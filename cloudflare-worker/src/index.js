// K-APT 자동 검증 Cloudflare Worker (V3)
//
// v3 변경:
//   - Cron trigger: 매일 02:00 KST K-APT 신규 공고 전량 수집 → Firebase 저장
//   - /verify는 Firebase 우선 조회 → 부분 매칭 + 빠른 응답
//   - /sync POST: 수동 일괄 수집 (초기화/재동기화용)
//
// 저장 구조 (Firebase Realtime DB):
//   bids/{bidNum} = {
//     bidNum, aptCode, bidKaptname, bidKaptnameNormalized,
//     bidTitle, bidContent, bidReason, bidRegdate, bidDeadline, amount,
//     matchedOurTechnology, matchedOurPatent, isOurBid,
//     fetchedAt
//   }
//
// 환경 변수:
//   DATA_GO_KR_KEY    : data.go.kr 인증키
//   JANDI_WEBHOOK_URL : 잔디 webhook
//   FIREBASE_DB_URL   : https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app
//   FIREBASE_DB_SECRET: Firebase Realtime DB secret (legacy) 또는 token

const VERSION = '3.0.0';
const API_BASE = 'https://apis.data.go.kr/1613000/ApHusBidResultNoticeInfoOfferServiceV2';
const UA = 'POUR-KAPT-Verify-Worker/3.0';

const OUR_TECHNOLOGIES = ['POUR', 'CNC', 'DO', 'DETEX', '시멘트분말'];

// 도장/방수/보수 관련 키워드 (Firebase 저장 필터)
// bidTitle에 하나라도 포함된 공고만 저장 → 노이즈 90% 감소
const RELEVANT_KEYWORDS = [
  '도장', '재도장', '방수', '외벽', '크랙', '균열', '보수', '리모델링',
  '복도', '계단실', '지하주차장', '옥상', '도장공사', '방수공사', '외벽공사',
  '실링', '코킹', '에폭시', 'POUR', 'CNC', 'DETEX', '시멘트',
  '발코니', '난간', '주차장', '바닥재', '도색',
];
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
      const bidCount = await countFirebaseBids(env).catch(() => null);
      return jsonResponse({
        status: 'ok',
        version: VERSION,
        hasKey: !!env.DATA_GO_KR_KEY,
        hasJandi: !!env.JANDI_WEBHOOK_URL,
        hasFirebase: !!(env.FIREBASE_DB_URL && env.FIREBASE_DB_SECRET),
        ourTechnologies: OUR_TECHNOLOGIES,
        ourPatentCount: OUR_PATENT_NUMBERS.size,
        firebaseBidCount: bidCount,
        matchingMode: '공고문 텍스트에서 공법명/특허번호 매칭 (Firebase 우선 조회)',
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

    // 수동 동기화: POST /sync?days=90
    if (url.pathname === '/sync' && request.method === 'POST') {
      try {
        const days = parseInt(url.searchParams.get('days') || '7', 10);
        const result = await syncRecentBids(env, days);
        return jsonResponse(result, env);
      } catch (e) {
        console.error('[sync] error', e);
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    // 디버그: GET /bid/:bidNum — Firebase 조회
    if (url.pathname.startsWith('/bid/') && request.method === 'GET') {
      const bidNum = url.pathname.split('/')[2];
      const bid = await getFirebaseBid(env, bidNum);
      return jsonResponse(bid || { error: 'not found' }, env);
    }

    return jsonResponse({
      error: 'Not found',
      endpoints: ['POST /verify', 'POST /sync?days=N', 'GET /bid/:bidNum', 'GET /health'],
    }, env, 404);
  },

  async scheduled(event, env, ctx) {
    // 매일 02:00 KST (= 17:00 UTC) 실행 → 전날 공고 수집
    console.log('[cron] triggered', new Date().toISOString());
    try {
      const result = await syncRecentBids(env, 2); // 어제+오늘 안전하게 2일
      console.log('[cron] result', result);
    } catch (e) {
      console.error('[cron] failed', e);
    }
  },
};

// === PT 검증 메인 ===
async function verifyPt(args, env) {
  const { siteName, bidNo, assignee, ptDate, by } = args;

  if (!env.DATA_GO_KR_KEY) {
    await notifyJandi(env, buildNeedReviewMsg({
      siteName, assignee, ptDate, by,
      reason: 'data.go.kr API 키 미등록',
    }));
    return { status: 'needs_review', reason: 'no_api_key' };
  }

  // Strategy 1: 공고번호 직접 조회 (Firebase 우선)
  if (bidNo && bidNo.trim()) {
    const trimmed = bidNo.trim();
    const fbBid = await getFirebaseBid(env, trimmed);
    if (fbBid) {
      return judgeAgainstBid(fbBid, { siteName, assignee, ptDate, by, bidNo: trimmed }, env);
    }
    // Firebase 없으면 data.go.kr 시도 (직접 조회는 불가 — 단지명 기반 검색)
    if (siteName) {
      const apiBids = await fetchAndCacheBidsBySiteName(env, siteName, ptDate);
      const match = apiBids.find(b => b.bidNum === trimmed);
      if (match) return judgeAgainstBid(match, { siteName, assignee, ptDate, by, bidNo: trimmed }, env);
    }
  }

  // Strategy 2: 단지명 기반 (Firebase 먼저, 없으면 API)
  if (siteName && siteName.trim()) {
    // Firebase 부분 매칭
    const fbMatches = await queryFirebaseByAptName(env, siteName, ptDate);
    if (fbMatches.length > 0) {
      const ourBids = fbMatches.filter(b => b.isOurBid);
      if (ourBids.length > 0) {
        return judgeAgainstBid(ourBids[0], { siteName, assignee, ptDate, by }, env);
      }
      // Firebase 조회됐는데 우리 공고 없으면 → 통과 못 함
      await notifyJandi(env, buildNoMatchMsg({
        siteName, assignee, ptDate, by, bidNo,
        totalFound: fbMatches.length,
        sampleTitles: fbMatches.slice(0, 3).map(b => `「${b.bidTitle}」`).join(', '),
      }));
      return {
        status: 'needs_review',
        reason: 'no_our_bid_in_firebase',
        totalFound: fbMatches.length,
        source: 'firebase',
        samples: fbMatches.slice(0, 5).map(b => ({ bidNum: b.bidNum, bidTitle: b.bidTitle, bidKaptname: b.bidKaptname })),
      };
    }

    // Firebase에 없으면 data.go.kr 직접
    const apiBids = await fetchAndCacheBidsBySiteName(env, siteName, ptDate);
    if (apiBids.length === 0) {
      await notifyJandi(env, buildNeedReviewMsg({
        siteName, assignee, ptDate, by,
        reason: `K-APT 검색 결과 없음 (단지명: ${siteName})`,
      }));
      return { status: 'needs_review', reason: 'bid_not_found', source: 'api' };
    }
    const ourBid = apiBids.find(b => b.isOurBid);
    if (ourBid) return judgeAgainstBid(ourBid, { siteName, assignee, ptDate, by }, env);
    await notifyJandi(env, buildNoMatchMsg({
      siteName, assignee, ptDate, by, bidNo,
      totalFound: apiBids.length,
      sampleTitles: apiBids.slice(0, 3).map(b => `「${b.bidTitle}」`).join(', '),
    }));
    return {
      status: 'needs_review',
      reason: 'no_our_technology_in_announcement',
      totalFound: apiBids.length,
      source: 'api',
    };
  }

  await notifyJandi(env, buildNeedReviewMsg({
    siteName, assignee, ptDate, by,
    reason: '단지명·공고번호 모두 미입력',
  }));
  return { status: 'needs_review', reason: 'no_search_key' };
}

function judgeAgainstBid(bid, ctx, env) {
  if (bid.isOurBid) {
    return {
      status: 'verified',
      isOurAnnouncement: true,
      matchedBy: bid.matchedOurPatent ? 'patent' : 'technology',
      matchedValue: bid.matchedOurPatent || bid.matchedOurTechnology,
      matchedBid: {
        bidNum: bid.bidNum, bidTitle: bid.bidTitle,
        bidKaptname: bid.bidKaptname, bidRegdate: bid.bidRegdate, amount: bid.amount,
      },
      message: bid.matchedOurPatent
        ? `공고문에 우리 특허번호 [${bid.matchedOurPatent}] 확인됨`
        : `공고문에 우리 공법 [${bid.matchedOurTechnology}] 확인됨`,
    };
  }
  // 우리 공고 아님 → 잔디 알림
  return notifyJandi(env, buildNoMatchMsg({
    ...ctx, totalFound: 1, sampleTitles: `「${bid.bidTitle}」`,
  })).then(() => ({
    status: 'needs_review',
    reason: 'no_our_technology',
    bidNum: bid.bidNum,
    bidTitle: bid.bidTitle,
  }));
}

// === K-APT 수집 + Firebase 저장 (batch PATCH) ===
async function syncRecentBids(env, days) {
  if (!env.DATA_GO_KR_KEY) return { error: 'no_api_key' };
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) return { error: 'no_firebase_config' };

  const results = { total: 0, stored: 0, ourBids: 0, errors: 0, dates: [] };
  const today = new Date();
  // Cloudflare Workers free plan: 최대 50 subrequest
  // 날짜당 API 1회(페이지1) + Firebase batch 1회 = 2 subrequest
  // 따라서 최대 ~20일까지만 안전. pageNo=1만 사용 (numOfRows=1000로 대부분 커버)
  const safeDays = Math.min(days, 20);
  for (let d = 0; d < safeDays; d++) {
    const date = new Date(today.getTime() - d * 86400000);
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    try {
      const bids = await fetchBidsByAnnouncementDate(dateStr, env.DATA_GO_KR_KEY);
      results.total += bids.length;
      // 엔리치 + 관련 공고만 필터 (도장/방수/보수)
      const batch = {};
      let relevantCount = 0;
      for (const bid of bids) {
        const enriched = enrichBid(bid);
        if (!enriched.isRelevant) continue; // 관련 공고만 저장
        relevantCount++;
        const safe = enriched.bidNum.replace(/[.#$\[\]\/]/g, '_');
        batch[safe] = enriched;
        if (enriched.isOurBid) results.ourBids++;
      }
      if (Object.keys(batch).length > 0) {
        await storeFirebaseBidsBatch(env, batch);
        results.stored += Object.keys(batch).length;
      }
      results.dates.push({ date: dateStr, fetched: bids.length, relevant: relevantCount });
    } catch (e) {
      console.warn(`[sync] ${dateStr} error`, e);
      results.errors++;
      results.dates.push({ date: dateStr, error: e.message });
    }
  }
  if (days > safeDays) {
    results.note = `Cloudflare subrequest 한도로 ${safeDays}일만 수집. 남은 날짜는 여러 번 sync 호출 필요.`;
  }
  return results;
}

async function storeFirebaseBidsBatch(env, batch) {
  const url = `${env.FIREBASE_DB_URL}/bids.json?auth=${env.FIREBASE_DB_SECRET}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });
  if (!resp.ok) throw new Error(`Firebase PATCH HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  return true;
}

async function fetchBidsByAnnouncementDate(pblancDe, serviceKey) {
  // 하루 공고는 통상 수백~수천 건 → numOfRows=1000 단일 호출로 충분
  // Cloudflare subrequest 한도 절약
  const params = new URLSearchParams({
    serviceKey, pblancDe, pageNo: '1', numOfRows: '1000', type: 'json',
  });
  const resp = await fetch(`${API_BASE}/getPblAncDeSearchV2?${params}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const items = data?.response?.body?.items;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

async function fetchAndCacheBidsBySiteName(env, hsmpNm, ptDate) {
  if (!env.DATA_GO_KR_KEY) return [];
  const year = extractYear(ptDate) || new Date().getFullYear();
  const combined = [];
  const seen = new Set();
  for (const y of [year, year - 1]) {
    const params = new URLSearchParams({
      serviceKey: env.DATA_GO_KR_KEY, hsmpNm, srchYear: String(y),
      pageNo: '1', numOfRows: '100', type: 'json',
    });
    const resp = await fetch(`${API_BASE}/getHsmpNmSearchV2?${params}`, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    if (!resp.ok) continue;
    const data = await resp.json();
    const items = data?.response?.body?.items;
    if (!items) continue;
    const arr = Array.isArray(items) ? items : [items];
    for (const it of arr) {
      if (seen.has(it.bidNum)) continue;
      seen.add(it.bidNum);
      const enriched = enrichBid(it);
      combined.push(enriched);
      // 발견된 것들 Firebase에 캐시
      if (env.FIREBASE_DB_URL && env.FIREBASE_DB_SECRET) {
        storeFirebaseBid(env, enriched).catch(() => {});
      }
    }
  }
  return combined;
}

function enrichBid(raw) {
  const bid = {
    bidNum: raw.bidNum,
    aptCode: raw.aptCode,
    bidKaptname: raw.bidKaptname || '',
    bidKaptnameNormalized: normalizeKoreanName(raw.bidKaptname || ''),
    bidTitle: raw.bidTitle || '',
    bidContent: raw.bidContent || '',
    bidReason: raw.bidReason || '',
    bidRegdate: raw.bidRegdate,
    bidDeadline: raw.bidDeadline,
    amount: parseInt(raw.amount || 0, 10) || 0,
    bidState: raw.bidState,
    bidFileSeq: raw.bidFileSeq, // PDF 파싱용 첨부파일 ID
    codeKind: raw.codeKind,
    codeClassifyType1: raw.codeClassifyType1,
    codeClassifyType2: raw.codeClassifyType2,
    codeClassifyType3: raw.codeClassifyType3,
    fetchedAt: new Date().toISOString(),
  };
  const matched = findOurInBid(bid);
  bid.matchedOurTechnology = matched?.type === 'technology' ? matched.value : null;
  bid.matchedOurPatent = matched?.type === 'patent' ? matched.value : null;
  bid.isOurBid = !!matched;
  bid.isRelevant = isPaintingOrWaterproofingBid(bid);
  return bid;
}

// 도장/방수 관련 공고인지 (필터용)
function isPaintingOrWaterproofingBid(bid) {
  const text = `${bid.bidTitle} ${bid.bidContent || ''}`.toLowerCase();
  return RELEVANT_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

function findOurInBid(bid) {
  const combined = [bid.bidTitle, bid.bidContent, bid.bidReason].filter(Boolean).join(' ');
  for (const tech of OUR_TECHNOLOGIES) {
    if (containsTechnology(combined, tech)) return { type: 'technology', value: tech };
  }
  const matches = combined.matchAll(/10-\d{7}/g);
  for (const m of matches) {
    if (OUR_PATENT_NUMBERS.has(m[0])) return { type: 'patent', value: m[0] };
  }
  return null;
}

function containsTechnology(text, tech) {
  if (!text || !tech) return false;
  if (/[가-힣]/.test(tech)) return text.includes(tech);
  const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^A-Z가-힣])${escaped}([^A-Z가-힣]|$)`, 'i');
  return re.test(text);
}

function normalizeKoreanName(s) {
  return String(s || '').replace(/\s+/g, '').replace(/[()()[\]]/g, '').toLowerCase();
}

// === Firebase REST API ===
async function storeFirebaseBid(env, bid) {
  const safe = bid.bidNum.replace(/[.#$\[\]\/]/g, '_');
  const url = `${env.FIREBASE_DB_URL}/bids/${safe}.json?auth=${env.FIREBASE_DB_SECRET}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bid),
  });
  if (!resp.ok) throw new Error(`Firebase PUT HTTP ${resp.status}`);
  return true;
}

async function getFirebaseBid(env, bidNum) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) return null;
  const safe = bidNum.replace(/[.#$\[\]\/]/g, '_');
  const url = `${env.FIREBASE_DB_URL}/bids/${safe}.json?auth=${env.FIREBASE_DB_SECRET}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  return data || null;
}

async function queryFirebaseByAptName(env, siteName, ptDate) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) return [];
  // 전체 bids를 가져와서 부분 매칭 (데이터 양 많으면 orderBy 인덱스 필요)
  // 임시: numOfRows 제한으로 최근 것만
  const url = `${env.FIREBASE_DB_URL}/bids.json?auth=${env.FIREBASE_DB_SECRET}&orderBy="bidKaptnameNormalized"&startAt="${normalizeKoreanName(siteName)}"&endAt="${normalizeKoreanName(siteName)}\uf8ff"&limitToFirst=20`;
  const resp = await fetch(url);
  if (!resp.ok) {
    // 인덱스 미설정 시 실패 가능 → fallback: 전체 조회 + 필터
    return queryFirebaseByAptNameFallback(env, siteName, ptDate);
  }
  const data = await resp.json();
  if (!data) return [];
  const arr = Object.values(data);
  return arr.sort((a, b) => (b.bidRegdate || '').localeCompare(a.bidRegdate || ''));
}

async function queryFirebaseByAptNameFallback(env, siteName, ptDate) {
  const target = normalizeKoreanName(siteName);
  const url = `${env.FIREBASE_DB_URL}/bids.json?auth=${env.FIREBASE_DB_SECRET}&shallow=false`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  if (!data) return [];
  const arr = Object.values(data).filter(b => {
    const n = b.bidKaptnameNormalized || normalizeKoreanName(b.bidKaptname || '');
    return n.includes(target) || target.includes(n);
  });
  return arr.sort((a, b) => (b.bidRegdate || '').localeCompare(a.bidRegdate || '')).slice(0, 20);
}

async function countFirebaseBids(env) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) return null;
  const url = `${env.FIREBASE_DB_URL}/bids.json?auth=${env.FIREBASE_DB_SECRET}&shallow=true`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  return data ? Object.keys(data).length : 0;
}

// === 잔디 ===
async function notifyJandi(env, message) {
  if (!env.JANDI_WEBHOOK_URL) return;
  try {
    const bodyBytes = new TextEncoder().encode(JSON.stringify(message));
    await fetch(env.JANDI_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.tosslab.jandi-v2+json',
        'Content-Type': 'application/vnd.tosslab.jandi-v2+json',
      },
      body: bodyBytes,
    });
  } catch (e) { console.warn('[Jandi] failed', e); }
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
        '👉 K-APT 사이트(www.k-apt.go.kr)에서 직접 공고를 확인해주세요.',
      ].join('\n'),
    }],
  };
}

function buildNoMatchMsg({ siteName, assignee, ptDate, by, bidNo, totalFound, sampleTitles }) {
  return {
    body: '⚠️ 공고문에 우리 공법/특허 미확인',
    connectColor: '#dc2626',
    connectInfo: [{
      title: `${siteName || '단지명 미입력'} — ${assignee || '담당자 미상'}`,
      description: [
        `진행일: ${ptDate || '-'}`,
        bidNo ? `공고번호: ${bidNo}` : '공고번호 미입력',
        `K-APT 검색: ${totalFound}건`,
        sampleTitles ? `샘플: ${sampleTitles}` : '',
        `입력자: ${by || '-'}`,
        '',
        '👉 공고문에 POUR/CNC/DO/DETEX/시멘트분말 또는 우리 특허번호(10-XXXXXXX) 미확인.',
        '   결과 [승]이 맞다면 "영업적 승리" 또는 "공고문 없는 현장" 예외 신청 검토.',
      ].filter(Boolean).join('\n'),
    }],
  };
}

// === Helpers ===
function extractYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, env, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders(env), 'Content-Type': 'application/json; charset=utf-8' },
  });
}
