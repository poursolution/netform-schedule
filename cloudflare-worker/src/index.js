// K-APT 자동 검증 Cloudflare Worker (V2)
//
// 역할:
//   클라이언트(POUR영업운영시스템)에서 PT "승" 결과 입력 시 호출됨
//   data.go.kr 공동주택 입찰결과 OpenAPI(V2)를 호출하여 우리 회사 낙찰 여부 판정
//   검증 실패 시(공고 못 찾음 / 우리 회사 낙찰 아님) 잔디 채널에 알림
//
// 엔드포인트:
//   POST /verify
//     body: { siteName, workType, bidNo, assignee, ptDate, by }
//     response: { status, found, isOurWin, winnerName, awardAmount, message }
//   GET /health
//     200 OK { status: 'ok', version, hasKey, hasJandi }
//
// 환경 변수 (wrangler secret put):
//   DATA_GO_KR_KEY    : data.go.kr 인증키
//   JANDI_WEBHOOK_URL : 잔디 incoming webhook URL
// vars (wrangler.toml):
//   OUR_COMPANY_NAMES : 콤마 구분 우리 회사 명칭 (낙찰자 매칭)
//
// data.go.kr API:
//   - 입찰결과 V2: https://apis.data.go.kr/1613000/ApHusBidResultNoticeInfoOfferServiceV2
//   - 입찰공고 V2: https://apis.data.go.kr/1613000/ApHusBidPblAncInfoOfferServiceV2
//   주요 endpoint:
//     /getHsmpNmSearchV2     - 단지명 + 검색년도 → 입찰 리스트
//     /getBidEntrpsInfoSearchV2 - 입찰번호 → 응찰업체 + 낙찰여부
//     /getPblAncDeSearchV2   - 입찰공고일 → 입찰 리스트
//   주요 응답 필드:
//     bidNum, aptCode, bidKaptname, bidTitle, bidDeadline, amount, bidReason
//     companyName, bidSuccessfulYn ('Y'=낙찰)

const VERSION = '2.0.0';
const API_BASE = 'https://apis.data.go.kr/1613000/ApHusBidResultNoticeInfoOfferServiceV2';

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
        ourCompanies: parseCompanies(env),
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

    return jsonResponse({
      error: 'Not found',
      endpoints: ['POST /verify', 'GET /health'],
    }, env, 404);
  },
};

// === PT 검증 메인 ===
async function verifyPt(args, env) {
  const { siteName, bidNo, assignee, ptDate, by } = args;
  const ourCompanies = parseCompanies(env);

  if (!env.DATA_GO_KR_KEY) {
    await notifyJandi(env, buildNeedReviewMsg({
      siteName, assignee, ptDate, by,
      reason: 'data.go.kr API 키가 Worker에 등록되지 않음 — 수동 확인 필요',
    }));
    return { status: 'needs_review', reason: 'no_api_key' };
  }

  // === Strategy 1: 공고번호(bidNum)가 있으면 직접 응찰업체 조회 ===
  if (bidNo && bidNo.trim()) {
    const trimmed = bidNo.trim();
    const entries = await fetchBidEntries(trimmed, env.DATA_GO_KR_KEY);
    if (entries.length === 0) {
      await notifyJandi(env, buildNeedReviewMsg({
        siteName, assignee, ptDate, by,
        reason: `공고번호 [${trimmed}]로 응찰업체 정보를 찾을 수 없음 (K-APT 미등록)`,
      }));
      return { status: 'needs_review', reason: 'bid_not_found', searched: { bidNo: trimmed } };
    }
    return judgeAndNotify({
      entries, ourCompanies, env,
      msgArgs: { siteName, assignee, ptDate, by, bidNo: trimmed },
    });
  }

  // === Strategy 2: 단지명으로 입찰 리스트 검색 → bidNum 후보 → 응찰업체 조회 ===
  const yearGuess = extractYear(ptDate) || new Date().getFullYear();
  const yearsToTry = [yearGuess, yearGuess - 1]; // 작년/올해
  let allBids = [];
  for (const y of yearsToTry) {
    const bids = await fetchBidsBySiteName(siteName, y, env.DATA_GO_KR_KEY);
    allBids = allBids.concat(bids);
    if (allBids.length >= 10) break;
  }

  if (allBids.length === 0) {
    await notifyJandi(env, buildNeedReviewMsg({
      siteName, assignee, ptDate, by,
      reason: `단지명 [${siteName}]로 K-APT 검색 결과 없음 (정확한 단지명 또는 공고번호 입력 필요)`,
    }));
    return { status: 'needs_review', reason: 'site_not_found', searched: { siteName, years: yearsToTry } };
  }

  // 후보 bidNum 중 PT 진행일과 가까운 것 우선 (시간 가까운 순 최대 5개)
  const candidates = pickClosestBids(allBids, ptDate, 5);
  let allEntries = [];
  for (const b of candidates) {
    const entries = await fetchBidEntries(b.bidNum, env.DATA_GO_KR_KEY);
    entries.forEach(e => { e._bidNum = b.bidNum; e._bidKaptname = b.bidKaptname; e._amount = b.amount; });
    allEntries = allEntries.concat(entries);
  }

  if (allEntries.length === 0) {
    await notifyJandi(env, buildNeedReviewMsg({
      siteName, assignee, ptDate, by,
      reason: `단지 [${siteName}] 후보 ${candidates.length}건 중 응찰업체 정보 없음`,
    }));
    return { status: 'needs_review', reason: 'no_entries', searched: { siteName, candidates: candidates.length } };
  }

  return judgeAndNotify({
    entries: allEntries, ourCompanies, env,
    msgArgs: { siteName, assignee, ptDate, by, candidatesNote: `단지명 검색 ${candidates.length}건 후보` },
  });
}

// === 판정 + 잔디 알림 ===
function judgeAndNotify({ entries, ourCompanies, env, msgArgs }) {
  // 낙찰업체만 필터
  const winners = entries.filter(e => (e.bidSuccessfulYn || '').toUpperCase() === 'Y');
  const ourWin = winners.find(w => isOurCompany(w.companyName, ourCompanies));

  if (ourWin) {
    return {
      status: 'verified',
      isOurWin: true,
      winnerName: ourWin.companyName,
      awardAmount: ourWin._amount || null,
      bidNum: ourWin._bidNum || null,
      message: `K-APT 낙찰 확인됨: ${ourWin.companyName}`,
    };
  }

  const winnersText = winners.length > 0
    ? winners.slice(0, 3).map(w => `${w.companyName}${w._amount ? ` (${w._amount.toLocaleString()}원)` : ''}`).join(', ')
    : '(낙찰자 정보 없음 — 유찰/취소 가능성)';

  return notifyJandi(env, buildNotOurWinMsg({
    ...msgArgs,
    winners: winnersText,
    totalEntries: entries.length,
  })).then(() => ({
    status: 'needs_review',
    reason: 'not_our_win',
    isOurWin: false,
    totalEntries: entries.length,
    totalWinners: winners.length,
    winners: winners.slice(0, 5).map(w => ({
      companyName: w.companyName,
      amount: w._amount,
      bidNum: w._bidNum,
    })),
  }));
}

// === API 호출 ===
async function fetchBidEntries(bidNum, serviceKey) {
  const params = new URLSearchParams({
    serviceKey, bidNum, pageNo: '1', numOfRows: '50', type: 'json',
  });
  const resp = await fetch(`${API_BASE}/getBidEntrpsInfoSearchV2?${params}`, {
    headers: { 'User-Agent': 'POUR-KAPT-Verify-Worker/2.0', 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`getBidEntrpsInfoSearchV2 HTTP ${resp.status}`);
  const data = await resp.json();
  const items = data?.response?.body?.items;
  if (!items || items.length === 0) return [];
  // items는 항상 배열로 반환됨 (확인됨)
  return Array.isArray(items) ? items : [items];
}

async function fetchBidsBySiteName(hsmpNm, year, serviceKey) {
  const params = new URLSearchParams({
    serviceKey, hsmpNm, srchYear: String(year),
    pageNo: '1', numOfRows: '50', type: 'json',
  });
  const resp = await fetch(`${API_BASE}/getHsmpNmSearchV2?${params}`, {
    headers: { 'User-Agent': 'POUR-KAPT-Verify-Worker/2.0', 'Accept': 'application/json' },
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
    bidTitle: it.bidTitle,
    bidRegdate: it.bidRegdate,
    bidDeadline: it.bidDeadline,
    amount: parseInt(it.amount || 0, 10) || 0,
    bidReason: it.bidReason,
    bidState: it.bidState,
  }));
}

// === Helpers ===
function isOurCompany(winnerName, ourCompanies) {
  if (!winnerName) return false;
  const norm = String(winnerName).replace(/[\s().,\-]/g, '').toUpperCase();
  return ourCompanies.some(name => {
    const n = String(name).replace(/[\s().,\-]/g, '').toUpperCase();
    return n && norm.includes(n);
  });
}

function parseCompanies(env) {
  return (env.OUR_COMPANY_NAMES || '').split(',').map(s => s.trim()).filter(Boolean);
}

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
    await fetch(env.JANDI_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.tosslab.jandi-v2+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
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
        '👉 K-APT 사이트(www.k-apt.go.kr)에서 직접 공고/낙찰 결과를 확인 후 정산 승인 부탁드립니다.',
      ].join('\n'),
    }],
  };
}

function buildNotOurWinMsg({ siteName, assignee, ptDate, by, bidNo, winners, totalEntries, candidatesNote }) {
  return {
    body: '⚠️ PT 결과 = 승, 그러나 K-APT 낙찰자 = 우리 회사 아님',
    connectColor: '#dc2626',
    connectInfo: [{
      title: `${siteName || '단지명 미입력'} — ${assignee || '담당자 미상'}`,
      description: [
        `진행일: ${ptDate || '-'}`,
        bidNo ? `공고번호: ${bidNo}` : (candidatesNote || '공고번호 미입력 — 단지명 기반 검색'),
        `K-APT 낙찰자: ${winners}`,
        `총 응찰업체: ${totalEntries}곳`,
        `입력자: ${by || '-'}`,
        '',
        '👉 결과 [승]이 잘못 입력된 것일 수 있습니다.',
        '   시스템에서 결과를 재확인하거나, 영업적 승리 예외 신청을 검토해주세요.',
      ].join('\n'),
    }],
  };
}

// === HTTP Helpers ===
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
