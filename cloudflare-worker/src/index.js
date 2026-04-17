// K-APT 자동 검증 Cloudflare Worker (V2.1)
//
// 역할:
//   클라이언트(POUR영업운영시스템)에서 PT "승" 결과 입력 시 호출
//   data.go.kr 공동주택 입찰결과 OpenAPI(V2)를 호출하여 공고문 텍스트에
//   우리 회사 공법(POUR/CNC/DO/DETEX/시멘트분말) 키워드 포함 여부를 검사
//   - 포함: verified (우리 협약번호로 진행된 공고 → 승)
//   - 미포함/공고 없음: needs_review (잔디 알림 + admin 확인 필요)
//
// 변경 사항 (v2.1):
//   - 낙찰자 매칭(companyName) 로직 제거
//   - 공고문(bidTitle + bidContent + bidReason) 텍스트에서 우리 공법 키워드 검색
//   - 단어 경계 매칭으로 DO 같은 짧은 키워드 false positive 차단
//   - 잔디 Content-Type에 charset=utf-8 추가 (한글 깨짐 수정)
//
// 엔드포인트:
//   POST /verify  body: { siteName, workType, bidNo, assignee, ptDate, by }
//   GET  /health  → { status, version, hasKey, hasJandi, ourTechnologies }

const VERSION = '2.1.0';
const API_BASE = 'https://apis.data.go.kr/1613000/ApHusBidResultNoticeInfoOfferServiceV2';
const UA = 'POUR-KAPT-Verify-Worker/2.1';

// 우리 회사 공법 5종 (공고문 텍스트 매칭용)
const OUR_TECHNOLOGIES = ['POUR', 'CNC', 'DO', 'DETEX', '시멘트분말'];

// 우리 회사 특허번호 85건 (전체특허리스트_26.03.27.xlsx 기반)
// 공고문에 특허번호가 기재된 경우에도 우리 공고로 인정
const OUR_PATENT_NUMBERS = new Set([
  '10-1520738', '10-1703553', '10-1828211', '10-1831299', '10-1883132',
  '10-1885983', '10-1905536', '10-1923102', '10-1935719', '10-1994773',
  '10-2119347', '10-2122691', '10-2122700', '10-2272203', '10-2274045',
  '10-2320426', '10-2345836', '10-2398289', '10-2398296', '10-2398304',
  '10-2425081', '10-2425088', '10-2474761', '10-2516517', '10-2532155',
  '10-2535699', '10-2536398', '10-2539919', '10-2541308', '10-2544157',
  '10-2544161', '10-2562854', '10-2562855', '10-2574833', '10-2574836',
  '10-2586662', '10-2603257', '10-2614027', '10-2643734', '10-2664685',
  '10-2664703', '10-2694890', '10-2680047', '10-2677910', '10-2699417',
  '10-2709702', '10-2709705', '10-2715409', '10-2743867', '10-2780472',
  '10-2784426', '10-2793770', '10-2803706', '10-2805601', '10-2820585',
  '10-2816037', '10-2826539', '10-2844945', '10-2846086', '10-2856577',
  '10-2856580', '10-2856581', '10-2856582', '10-2856572', '10-2859388',
  '10-2856575', '10-2859385', '10-2859386', '10-2859390', '10-2861078',
  '10-2862312', '10-2865278', '10-2865281', '10-2870425', '10-2870421',
  '10-2869493', '10-2888024', '10-2893921', '10-2896797', '10-2900226',
  '10-2907890', '10-2914079', '10-2917109', '10-2917107', '10-2937091',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        version: VERSION,
        hasKey: !!env.DATA_GO_KR_KEY,
        hasJandi: !!env.JANDI_WEBHOOK_URL,
        ourTechnologies: OUR_TECHNOLOGIES,
        ourPatentCount: OUR_PATENT_NUMBERS.size,
        matchingMode: '공고문 텍스트에서 공법명 또는 특허번호(10-XXXXXXX) 매칭',
      }, env);
    }

    if (url.pathname === '/verify' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await verifyPt(body, env);
        return jsonResponse(result, env);
      } catch (e) {
        console.error('[verify] error', e);
        return jsonResponse({ status: 'error', error: e.message, stack: e.stack }, env, 500);
      }
    }

    return jsonResponse({ error: 'Not found', endpoints: ['POST /verify', 'GET /health'] }, env, 404);
  },
};

// === PT 검증 메인 ===
async function verifyPt(args, env) {
  const { siteName, bidNo, assignee, ptDate, by } = args;

  if (!env.DATA_GO_KR_KEY) {
    await notifyJandi(env, buildNeedReviewMsg({
      siteName, assignee, ptDate, by,
      reason: 'data.go.kr API 키가 Worker에 등록되지 않음 — 수동 확인 필요',
    }));
    return { status: 'needs_review', reason: 'no_api_key' };
  }

  // 공고 후보 수집
  const { bids, searchMeta } = await collectBidCandidates({ siteName, bidNo, ptDate, serviceKey: env.DATA_GO_KR_KEY });

  if (bids.length === 0) {
    await notifyJandi(env, buildNeedReviewMsg({
      siteName, assignee, ptDate, by,
      reason: `K-APT 검색 결과 없음 (${searchMeta}) — 정확한 공고번호/단지명 재확인 필요`,
    }));
    return { status: 'needs_review', reason: 'bid_not_found', searchMeta };
  }

  // 공고문 텍스트에서 우리 공법/특허번호 검색
  const matches = bids.map(b => ({
    bid: b,
    matched: findOurTechnology(b),
  })).filter(x => x.matched);

  if (matches.length > 0) {
    const top = matches[0];
    return {
      status: 'verified',
      isOurAnnouncement: true,
      matchedBy: top.matched.type, // 'technology' | 'patent'
      matchedValue: top.matched.value,
      matchedBid: {
        bidNum: top.bid.bidNum,
        bidTitle: top.bid.bidTitle,
        bidKaptname: top.bid.bidKaptname,
        bidRegdate: top.bid.bidRegdate,
        amount: top.bid.amount,
      },
      totalFound: bids.length,
      matchedCount: matches.length,
      message: top.matched.type === 'patent'
        ? `공고문에 우리 특허번호 [${top.matched.value}] 확인됨`
        : `공고문에 우리 공법 [${top.matched.value}] 확인됨`,
    };
  }

  // 매칭 실패 → 잔디 알림
  const sampleTitles = bids.slice(0, 3).map(b => `「${b.bidTitle}」`).join(', ');
  await notifyJandi(env, buildNoMatchMsg({
    siteName, assignee, ptDate, by, bidNo,
    totalFound: bids.length,
    sampleTitles,
  }));
  return {
    status: 'needs_review',
    reason: 'no_our_technology_in_announcement',
    isOurAnnouncement: false,
    totalFound: bids.length,
    sampleBids: bids.slice(0, 5).map(b => ({
      bidNum: b.bidNum,
      bidTitle: b.bidTitle,
      bidKaptname: b.bidKaptname,
    })),
  };
}

// === 공고 후보 수집 ===
async function collectBidCandidates({ siteName, bidNo, ptDate, serviceKey }) {
  // 공고번호 있으면 단지명 검색 후 해당 bidNum 필터링
  if (bidNo && bidNo.trim()) {
    const trimmed = bidNo.trim();
    // 단지명으로 검색 후 bidNum 매칭 (bidNum 직접 조회 endpoint 없음)
    if (siteName && siteName.trim()) {
      const year = extractYear(ptDate) || new Date().getFullYear();
      const bids = [];
      for (const y of [year, year - 1]) {
        const arr = await fetchBidsBySiteName(siteName, y, serviceKey).catch(() => []);
        bids.push(...arr);
        if (bids.length >= 50) break;
      }
      const exact = bids.filter(b => b.bidNum === trimmed);
      if (exact.length > 0) return { bids: exact, searchMeta: `공고번호[${trimmed}] 정확 매칭` };
      return { bids, searchMeta: `공고번호[${trimmed}] 없음 — 단지명 전체 ${bids.length}건 대상` };
    }
  }

  // 단지명 검색 (기본)
  if (!siteName || !siteName.trim()) {
    return { bids: [], searchMeta: '단지명 미입력' };
  }
  const year = extractYear(ptDate) || new Date().getFullYear();
  const combined = [];
  const seen = new Set();
  for (const y of [year, year - 1]) {
    const arr = await fetchBidsBySiteName(siteName, y, serviceKey).catch(() => []);
    for (const b of arr) {
      if (!seen.has(b.bidNum)) {
        seen.add(b.bidNum);
        combined.push(b);
      }
    }
    if (combined.length >= 30) break;
  }
  // PT 진행일과 가까운 순 정렬
  const sorted = pickClosestBids(combined, ptDate, 30);
  return { bids: sorted, searchMeta: `단지명[${siteName}] ${year}/${year - 1}년 ${sorted.length}건` };
}

// === data.go.kr API ===
async function fetchBidsBySiteName(hsmpNm, year, serviceKey) {
  const params = new URLSearchParams({
    serviceKey, hsmpNm, srchYear: String(year),
    pageNo: '1', numOfRows: '100', type: 'json',
  });
  const resp = await fetch(`${API_BASE}/getHsmpNmSearchV2?${params}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`getHsmpNmSearchV2 HTTP ${resp.status}`);
  const data = await resp.json();
  const items = data?.response?.body?.items;
  if (!items || items.length === 0) return [];
  const arr = Array.isArray(items) ? items : [items];
  return arr.map(it => ({
    bidNum: it.bidNum,
    aptCode: it.aptCode,
    bidKaptname: it.bidKaptname,
    bidTitle: it.bidTitle || '',
    bidContent: it.bidContent || '',
    bidReason: it.bidReason || '',
    bidRegdate: it.bidRegdate,
    bidDeadline: it.bidDeadline,
    amount: parseInt(it.amount || 0, 10) || 0,
    bidState: it.bidState,
  }));
}

// === 우리 공법/특허 매칭 (공고문 텍스트 검색) ===
// 반환: { type: 'technology'|'patent', value: string } 또는 null
function findOurTechnology(bid) {
  const combined = [bid.bidTitle, bid.bidContent, bid.bidReason]
    .filter(Boolean).join(' ');

  // 1) 공법명 매칭 (POUR/CNC/DO/DETEX/시멘트분말)
  for (const tech of OUR_TECHNOLOGIES) {
    if (containsTechnology(combined, tech)) {
      return { type: 'technology', value: tech };
    }
  }

  // 2) 특허번호 매칭 (10-XXXXXXX 형태로 우리 특허 85건 중 매칭)
  const patentMatches = combined.matchAll(/10-\d{7}/g);
  for (const m of patentMatches) {
    if (OUR_PATENT_NUMBERS.has(m[0])) {
      return { type: 'patent', value: m[0] };
    }
  }

  return null;
}

function containsTechnology(text, tech) {
  if (!text || !tech) return false;
  // 한글 기술명: 단순 포함 매칭
  if (/[가-힣]/.test(tech)) {
    return text.includes(tech);
  }
  // 영문 기술명: 단어 경계 매칭 (DO 같은 짧은 키워드 false positive 차단)
  const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^A-Z가-힣])${escaped}([^A-Z가-힣]|$)`, 'i');
  return re.test(text);
}

// === Helpers ===
function extractYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function pickClosestBids(bids, ptDate, n) {
  if (!ptDate) return bids.slice(0, n);
  const target = new Date(ptDate).getTime();
  return [...bids]
    .map(b => ({ ...b, _diff: Math.abs(new Date(b.bidRegdate || b.bidDeadline || 0).getTime() - target) }))
    .sort((a, b) => a._diff - b._diff)
    .slice(0, n);
}

// === 잔디 알림 ===
async function notifyJandi(env, message) {
  if (!env.JANDI_WEBHOOK_URL) {
    console.log('[Jandi] skip (no webhook URL)', message.body);
    return;
  }
  try {
    // UTF-8 바이트로 명시적 인코딩 (한글 깨짐 방지)
    const json = JSON.stringify(message);
    const bodyBytes = new TextEncoder().encode(json);
    await fetch(env.JANDI_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.tosslab.jandi-v2+json',
        'Content-Type': 'application/vnd.tosslab.jandi-v2+json',
      },
      body: bodyBytes,
    });
  } catch (e) {
    console.warn('[Jandi] failed', e);
  }
}

function buildNeedReviewMsg({ siteName, assignee, ptDate, by, reason }) {
  return {
    body: '🔍 PT 크로스체크 필요 — K-APT 자동검증 미통과',
    connectColor: '#f59e0b',
    connectInfo: [{
      title: `${siteName || '단지명 미입력'} — ${assignee || '담당자 미상'}`,
      description: [
        `사유: ${reason}`,
        `진행일: ${ptDate || '-'}`,
        `입력자: ${by || '-'}`,
        '',
        '👉 K-APT 사이트(www.k-apt.go.kr)에서 직접 공고 내용을 확인해주세요.',
      ].join('\n'),
    }],
  };
}

function buildNoMatchMsg({ siteName, assignee, ptDate, by, bidNo, totalFound, sampleTitles }) {
  return {
    body: '⚠️ PT 결과 = 승, 그러나 공고문에 우리 공법(POUR/CNC/DO/DETEX/시멘트분말) 미확인',
    connectColor: '#dc2626',
    connectInfo: [{
      title: `${siteName || '단지명 미입력'} — ${assignee || '담당자 미상'}`,
      description: [
        `진행일: ${ptDate || '-'}`,
        bidNo ? `공고번호: ${bidNo}` : '공고번호 미입력',
        `K-APT 검색 결과: ${totalFound}건`,
        totalFound > 0 ? `공고 제목 샘플: ${sampleTitles}` : '',
        `입력자: ${by || '-'}`,
        '',
        '👉 공고문에 POUR공법 협약번호 등 우리 공법 표기가 없습니다.',
        '   결과 [승]이 맞다면 "영업적 승리 예외 신청"을 검토해주세요.',
      ].filter(Boolean).join('\n'),
    }],
  };
}

// === HTTP ===
function corsHeaders(env) {
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, env, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders(env),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
