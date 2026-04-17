// K-APT 자동 검증 Cloudflare Worker
//
// 역할:
//   1. 클라이언트(POUR영업운영시스템)에서 PT "승" 결과 입력 시 호출됨
//   2. data.go.kr 공동주택 입찰결과 OpenAPI 호출 → 우리 회사 낙찰 여부 판정
//   3. 검증 실패(공고 못 찾음 / 우리 회사 낙찰 아님) 시 잔디 채널에 알림
//   4. 응답: { status, found, isOurWin, awardAmount, message }
//
// 엔드포인트:
//   POST /verify
//     body: { siteName, workType, bidNo, ourTechnologies, assignee, ptDate, by }
//   GET /health
//     200 OK { status: 'ok', version, hasKey, hasJandi }
//
// 환경 변수 (wrangler secret put):
//   DATA_GO_KR_KEY    : data.go.kr 인증키
//   JANDI_WEBHOOK_URL : 잔디 incoming webhook URL
// vars (wrangler.toml):
//   OUR_COMPANY_NAMES : 콤마 구분 우리 회사 명칭

const VERSION = '1.0.0';

// data.go.kr 공동주택 입찰결과 정보 OpenAPI
// 단지명 검색은 직접 안 됨 → 단지목록 API로 단지코드 조회 → 입찰결과 API 호출
const DATA_GO_KR = {
  bidResultBase: 'https://apis.data.go.kr/1613000/ApHusBidResultNoticeInfoOfferService1',
  bidNoticeBase: 'https://apis.data.go.kr/1613000/ApHusBidNoticeInfoOfferService1',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        version: VERSION,
        hasKey: !!env.DATA_GO_KR_KEY,
        hasJandi: !!env.JANDI_WEBHOOK_URL,
        ourCompanies: (env.OUR_COMPANY_NAMES || '').split(',').map(s => s.trim()).filter(Boolean),
      }, env);
    }

    if (url.pathname === '/verify' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await verifyPt(body, env);
        return jsonResponse(result, env);
      } catch (e) {
        console.error('[verify] error', e);
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    return jsonResponse({ error: 'Not found', endpoints: ['POST /verify', 'GET /health'] }, env, 404);
  },
};

// === PT 검증 메인 ===
async function verifyPt(args, env) {
  const { siteName, workType, bidNo, assignee, ptDate, by } = args;
  const ourCompanies = (env.OUR_COMPANY_NAMES || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  if (!env.DATA_GO_KR_KEY) {
    await notifyJandi(env, buildNeedReviewMsg({
      siteName, assignee, ptDate, by,
      reason: 'data.go.kr API 키가 Worker에 등록되지 않음 — 수동 확인 필요',
    }));
    return { status: 'needs_review', reason: 'no_api_key' };
  }

  // 1) 공고번호가 있으면 입찰결과 직접 조회 (가장 정확)
  // 2) 공고번호 없으면 단지명으로 검색 시도 (정확도 낮음)
  let bids = [];
  let lookupReason = '';
  if (bidNo && bidNo.trim()) {
    bids = await fetchBidResultsByBidNo(bidNo.trim(), env.DATA_GO_KR_KEY).catch(e => {
      lookupReason = `공고번호 조회 실패: ${e.message}`;
      return [];
    });
  } else {
    bids = await fetchBidResultsBySiteName(siteName, env.DATA_GO_KR_KEY).catch(e => {
      lookupReason = `단지명 조회 실패: ${e.message}`;
      return [];
    });
  }

  if (bids.length === 0) {
    await notifyJandi(env, buildNeedReviewMsg({
      siteName, assignee, ptDate, by,
      reason: lookupReason || `K-APT에서 공고를 찾을 수 없음 (${bidNo ? `공고번호: ${bidNo}` : '단지명 기반 검색'})`,
    }));
    return { status: 'needs_review', reason: 'bid_not_found', searched: { bidNo, siteName }, lookupReason };
  }

  // 우리 회사 낙찰 여부 확인
  const ourWin = bids.find(b => isOurCompany(b.winnerName, ourCompanies));
  if (ourWin) {
    return {
      status: 'verified',
      found: bids.length,
      isOurWin: true,
      winnerName: ourWin.winnerName,
      awardAmount: ourWin.awardAmount,
      message: `K-APT 낙찰 확인됨: ${ourWin.winnerName}`,
    };
  }

  // 우리 회사 낙찰 아님 → 잔디 알림 + needs_review
  const winnersText = bids.slice(0, 3).map(b => `${b.winnerName || '(정보 없음)'} ${b.awardAmount ? `(${b.awardAmount.toLocaleString()}원)` : ''}`).join(', ');
  await notifyJandi(env, buildNotOurWinMsg({
    siteName, assignee, ptDate, by, bidNo,
    winners: winnersText,
  }));
  return {
    status: 'needs_review',
    reason: 'not_our_win',
    found: bids.length,
    isOurWin: false,
    winners: bids.slice(0, 5).map(b => ({ name: b.winnerName, amount: b.awardAmount })),
  };
}

// === data.go.kr API 호출 ===
async function fetchBidResultsByBidNo(bidNo, serviceKey) {
  // 정확한 endpoint는 공식 문서에서 확인 필요 (2026 시점). 임시로 주요 매개변수 형식만 정의.
  // 실제 배포 시 wrangler tail로 응답 형식 확인 후 파싱 보정.
  const params = new URLSearchParams({
    serviceKey,
    bidNum: bidNo,
    pageNo: '1',
    numOfRows: '20',
    type: 'json',
  });
  const url = `${DATA_GO_KR.bidResultBase}/getBidMethodSearch1?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return parseBidResultResponse(data);
}

async function fetchBidResultsBySiteName(siteName, serviceKey) {
  // 단지명 직접 검색은 API에서 제한적임. 일단 단지검색 후 단지코드로 조회하는 방식 권장.
  // 임시 단순 구현: 동일 endpoint에 aptName 파라미터로 시도
  const params = new URLSearchParams({
    serviceKey,
    aptName: siteName,
    pageNo: '1',
    numOfRows: '20',
    type: 'json',
  });
  const url = `${DATA_GO_KR.bidResultBase}/getBidMethodSearch1?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return parseBidResultResponse(data);
}

function parseBidResultResponse(data) {
  // data.go.kr 응답 표준 구조: { response: { body: { items: { item: [...] } } } }
  const items = data?.response?.body?.items?.item;
  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];
  return arr.map(it => ({
    bidNo: it.bidNum || it.bidNo || '',
    aptName: it.aptName || '',
    winnerName: it.cmpyNm || it.winnerName || it.bidCmpyNm || '',
    awardAmount: parseInt(it.awardAmount || it.bidAmount || it.cntrPrice || 0, 10) || 0,
    bidStatus: it.bidStatus || it.status || '',
    bidDate: it.bidDate || it.noticeDate || '',
  }));
}

function isOurCompany(winnerName, ourCompanies) {
  if (!winnerName) return false;
  const norm = String(winnerName).replace(/\s+/g, '').toUpperCase();
  return ourCompanies.some(name => {
    const n = String(name).replace(/\s+/g, '').toUpperCase();
    return n && norm.includes(n);
  });
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
        '👉 K-APT 사이트에서 직접 공고/낙찰 결과를 확인 후 정산 승인 부탁드립니다.',
      ].join('\n'),
    }],
  };
}

function buildNotOurWinMsg({ siteName, assignee, ptDate, by, bidNo, winners }) {
  return {
    body: '⚠️ PT 결과 = 승, 그러나 K-APT 낙찰자 = 우리 회사 아님',
    connectColor: '#dc2626',
    connectInfo: [{
      title: `${siteName || '단지명 미입력'} — ${assignee || '담당자 미상'}`,
      description: [
        `진행일: ${ptDate || '-'}`,
        bidNo ? `공고번호: ${bidNo}` : '공고번호 미입력 — 단지명 기반 검색',
        `K-APT 낙찰자: ${winners || '(정보 없음)'}`,
        `입력자: ${by || '-'}`,
        '',
        '👉 결과 [승]이 잘못 입력된 것일 수 있습니다. 시스템에서 결과를 재확인하거나, 영업적 승리 예외 신청을 검토해주세요.',
      ].join('\n'),
    }],
  };
}

// === Helpers ===
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
