// K-APT 자동 검증 Cloudflare Worker (V5)
//
// v5 변경 (VPS 프록시):
//   - Browser Rendering 제거 (K-APT가 Cloudflare IP 차단)
//   - AWS Lightsail Seoul VPS의 Playwright 서버로 프록시
//   - /verify-pdf → VPS /verify 호출
//   - /probe → VPS /verify 호출 (동일, 디버깅용)
//
// 환경 변수 (wrangler secret):
//   DATA_GO_KR_KEY    : data.go.kr 인증키
//   JANDI_WEBHOOK_URL : 잔디 webhook
//   FIREBASE_DB_URL   : https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app
//   FIREBASE_DB_SECRET: Firebase Realtime DB secret
//   VPS_URL           : http://13.209.81.200:8080 (한국 VPS)
//   VPS_AUTH_TOKEN    : VPS Bearer token

const VERSION = '5.0.0';
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
      let vpsStatus = null;
      if (env.VPS_URL) {
        try {
          const vpsResp = await fetch(`${env.VPS_URL}/health`, { method: 'GET' });
          vpsStatus = vpsResp.ok ? await vpsResp.json() : { error: `HTTP ${vpsResp.status}` };
        } catch (e) { vpsStatus = { error: e.message }; }
      }
      return jsonResponse({
        status: 'ok',
        version: VERSION,
        hasKey: !!env.DATA_GO_KR_KEY,
        hasJandi: !!env.JANDI_WEBHOOK_URL,
        hasFirebase: !!(env.FIREBASE_DB_URL && env.FIREBASE_DB_SECRET),
        hasVps: !!(env.VPS_URL && env.VPS_AUTH_TOKEN),
        ourTechnologies: OUR_TECHNOLOGIES,
        ourPatentCount: OUR_PATENT_NUMBERS.size,
        firebaseBidCount: bidCount,
        vpsStatus,
        matchingMode: 'API + Firebase + VPS Playwright (K-APT 직접 파싱)',
      }, env);
    }

    // VPS 기반 검증: 공고번호 → K-APT 직접 파싱 + 우리 공법/특허 매칭
    // POST /verify-pdf  body: { bidNum, siteName?, assignee?, by? }
    if (url.pathname === '/verify-pdf' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await verifyViaVps(env, body);
        return jsonResponse(result, env);
      } catch (e) {
        return jsonResponse({ error: e.message, stack: e.stack }, env, 500);
      }
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

// === VPS 프록시 (한국 Lightsail Seoul → K-APT 직접 접근) ===
async function verifyViaVps(env, args) {
  if (!env.VPS_URL || !env.VPS_AUTH_TOKEN) {
    return { status: 'error', error: 'VPS_URL 또는 VPS_AUTH_TOKEN 미설정' };
  }
  const resp = await fetch(`${env.VPS_URL}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.VPS_AUTH_TOKEN}`,
    },
    body: JSON.stringify(args),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`VPS HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const result = await resp.json();
  // 검증 실패 시 잔디 알림
  if (result.status === 'needs_review') {
    await notifyJandi(env, buildNoMatchMsg({
      siteName: args.siteName, assignee: args.assignee,
      ptDate: args.ptDate, by: args.by, bidNo: args.bidNum,
      totalFound: 1,
      sampleTitles: `K-APT ${result.pageTextLength}\uc790 \ud30c\uc2f1 \ub418\uc5c8\uc73c\ub098 \uc6b0\ub9ac \uacf5\ubc95/\ud2b9\ud5c8 \ubbf8\ubc1c\uacac`,
    }));
  }
  return result;
}

// === (deprecated) Browser Rendering 탐색 — 남겨둠 (사용 안 함) ===
async function probeKaptBid_deprecated(env, bidNum) {
  if (!env.BROWSER) throw new Error('Browser Rendering binding 없음 (Paid plan 필요)');
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    // 실제 브라우저처럼 위장
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });
    // 1) K-APT 메인 접속 (세션 쿠키 확보) — 실패하면 바로 상세 페이지로
    try {
      await page.goto('https://www.k-apt.go.kr/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.log('[probe] main page failed:', e.message);
    }

    // 2) bidNum으로 직접 상세 페이지 접근 시도 (여러 URL 패턴)
    const urls = [
      `https://www.k-apt.go.kr/bid/bidInfoView.do?bidNum=${bidNum}`,
      `https://www.k-apt.go.kr/bid/bidDetail.do?bidNum=${bidNum}`,
    ];
    const attempts = [];
    for (const u of urls) {
      try {
        const resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000)); // JS 렌더링 대기
        const title = await page.title();
        const bodyText = (await page.evaluate(() => document.body?.innerText || '')).slice(0, 500);
        // 첨부파일 링크 추출
        const attachments = await page.evaluate(() => {
          const links = [...document.querySelectorAll('a')];
          return links
            .filter(a => /fileDown|download|attachFile|fileSeq|.pdf|.hwp|.doc/i.test(a.href + a.onclick?.toString() || ''))
            .slice(0, 10)
            .map(a => ({ href: a.href, text: (a.innerText || '').trim().slice(0, 100), onclick: a.getAttribute('onclick') }));
        });
        // bidContent 관련 요소 추출
        const content = await page.evaluate(() => {
          const sel = ['#bidContent', '.bidContent', '.bid_content', '[class*=content]', '.detail_cont', '.detail', 'main', 'article'];
          for (const s of sel) {
            const el = document.querySelector(s);
            if (el && el.innerText.length > 50) return { selector: s, text: el.innerText.slice(0, 2000) };
          }
          return { selector: null, text: '' };
        });
        attempts.push({ url: u, httpStatus: resp?.status(), title, bodyPreview: bodyText, attachmentsFound: attachments.length, attachments, content });
      } catch (err) {
        attempts.push({ url: u, error: err.message });
      }
    }
    return { bidNum, attempts };
  } finally {
    await browser.close();
  }
}

// === K-APT 공고 상세 페이지 텍스트 파싱 + 우리 공법/특허 매칭 ===
async function verifyByPdf(env, args) {
  const { bidNum, siteName, assignee, ptDate, by } = args;
  if (!env.BROWSER) throw new Error('Browser Rendering binding 없음');

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    });

    // 1단계: K-APT 메인 먼저 방문 (세션 쿠키 확보 — 필수!)
    try {
      await page.goto('https://www.k-apt.go.kr/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.log('[verify-pdf] main page error (non-fatal):', e.message);
    }

    // 2단계: 공고 상세 페이지 접근 (retry 3회)
    const detailUrl = `https://www.k-apt.go.kr/bid/bidDetail.do?bidNum=${bidNum}`;
    let lastErr = null;
    let navSuccess = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        navSuccess = true;
        break;
      } catch (e) {
        lastErr = e;
        console.log(`[verify-pdf] attempt ${attempt + 1} failed:`, e.message);
        await new Promise(r => setTimeout(r, 2000 + attempt * 1500));
      }
    }
    if (!navSuccess) {
      await browser.close();
      await notifyJandi(env, buildNeedReviewMsg({
        siteName, assignee, ptDate, by,
        reason: `K-APT 접속 차단 (3회 retry 실패): ${lastErr?.message || 'unknown'}`,
      }));
      return {
        status: 'needs_review',
        reason: 'kapt_connection_blocked',
        error: lastErr?.message,
        bidNum,
      };
    }
    await new Promise(r => setTimeout(r, 3000)); // JS 렌더링 + AJAX 데이터 로드 대기

    // 페이지 전체 텍스트 추출 (공고 본문 + 낙찰자 등 모든 정보)
    const pageText = await page.evaluate(() => document.body?.innerText || '');

    // PDF 첨부파일도 추가로 시도 (있으면)
    const pdfLinks = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a')];
      return links
        .map(a => ({
          href: a.href,
          text: (a.innerText || '').trim(),
          onclick: a.getAttribute('onclick'),
        }))
        .filter(l =>
          /\.pdf|\.hwp|\.doc/i.test(l.href) ||
          /\.pdf|\.hwp|\.doc/i.test(l.text) ||
          /fileDown|downLoad|attachFile/i.test(l.onclick || '')
        );
    });

    let combinedText = pageText;
    const pdfTexts = [];

    // PDF 발견 시 다운로드 + 텍스트 추출 시도
    for (const link of pdfLinks.slice(0, 2)) {
      try {
        if (!/\.pdf/i.test(link.href)) continue;
        const cookies = await page.cookies();
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const resp = await fetch(link.href, {
          headers: { 'Cookie': cookieStr, 'Referer': detailUrl, 'User-Agent': 'Mozilla/5.0' },
        });
        if (!resp.ok) continue;
        const buffer = await resp.arrayBuffer();
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        pdfTexts.push({ url: link.href, text: text.slice(0, 20000) });
        combinedText += '\n\n[PDF]\n' + text;
      } catch (e) {
        pdfTexts.push({ url: link.href, error: e.message });
      }
    }

    // 우리 공법/특허 매칭 (페이지 텍스트 + PDF 텍스트)
    const matched = findOurInText(combinedText);

    if (matched) {
      return {
        status: 'verified',
        isOurAnnouncement: true,
        matchedBy: matched.type,
        matchedValue: matched.value,
        bidNum,
        pageTextLength: pageText.length,
        pdfCount: pdfTexts.length,
        source: pdfTexts.some(p => p.text) ? 'page_and_pdf' : 'page_text',
        message: matched.type === 'patent'
          ? `공고에서 우리 특허 [${matched.value}] 확인됨`
          : `공고에서 우리 공법 [${matched.value}] 확인됨`,
      };
    }

    await notifyJandi(env, buildNoMatchMsg({
      siteName, assignee, ptDate, by, bidNo: bidNum,
      totalFound: 1,
      sampleTitles: `페이지 텍스트 ${pageText.length}자 + PDF ${pdfTexts.length}개 검색 완료`,
    }));
    return {
      status: 'needs_review',
      reason: 'no_our_tech_in_announcement',
      bidNum,
      pageTextLength: pageText.length,
      pdfCount: pdfTexts.length,
      pdfTexts: pdfTexts.map(p => ({ url: p.url, hasText: !!p.text, error: p.error, textPreview: (p.text || '').slice(0, 200) })),
      pageTextPreview: pageText.slice(0, 500),
    };
  } finally {
    await browser.close();
  }
}

function findOurInText(text) {
  if (!text) return null;
  for (const tech of OUR_TECHNOLOGIES) {
    if (containsTechnology(text, tech)) return { type: 'technology', value: tech };
  }
  const matches = text.matchAll(/10-\d{7}/g);
  for (const m of matches) {
    if (OUR_PATENT_NUMBERS.has(m[0])) return { type: 'patent', value: m[0] };
  }
  return null;
}

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
