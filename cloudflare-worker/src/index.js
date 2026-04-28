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

    // 후보 검색 (모달 자동 추천용): POST /search-candidates { siteName, aliasMap? }
    // aliasMap: { [normalizedKey]: [aliasName, ...] } — 있으면 해당 bid 에 score=1 부스트
    // 반환: { candidates: [{bidNum, bidKaptname, bidTitle, bidRegdate, bidLocation, score, matchedByAlias}] (top 5) }
    if (url.pathname === '/search-candidates' && request.method === 'POST') {
      try {
        const body = await request.json();
        const siteName = (body.siteName || '').trim();
        if (!siteName) return jsonResponse({ candidates: [], reason: 'empty_siteName' }, env);

        // alias 확장: 입력 siteName 과 aliasMap 에서 연결된 이름들을 모두 정규화해서 후보 검색 시드로 사용
        const target = normalizeKoreanName(siteName);
        const aliasMap = body.aliasMap || {};
        const aliasKeys = new Set([target]);
        if (aliasMap[target]) {
          (aliasMap[target] || []).forEach(n => aliasKeys.add(normalizeKoreanName(n)));
        }

        // 주 검색 + alias 각각 검색해 합집합
        const allBids = [];
        const seen = new Set();
        for (const seed of aliasKeys) {
          if (!seed) continue;
          const list = await queryFirebaseByAptName(env, seed, body.ptDate || null).catch(() => []);
          for (const b of (list || [])) {
            const key = b.bidNum || b.bidcode;
            if (key && !seen.has(key)) { seen.add(key); allBids.push(b); }
          }
        }

        const scored = allBids.map(b => {
          const n = b.bidKaptnameNormalized || normalizeKoreanName(b.bidKaptname || '');
          let score = 0;
          let matchedByAlias = false;
          if (n && target) {
            if (aliasKeys.has(n) && n !== target) { score = 1; matchedByAlias = true; }
            else if (n === target) score = 1;
            else if (n.includes(target) || target.includes(n)) {
              const minLen = Math.min(n.length, target.length);
              const maxLen = Math.max(n.length, target.length);
              score = minLen / maxLen;
            }
          }
          return {
            bidNum: b.bidNum || b.bidcode || null,
            bidKaptname: b.bidKaptname || '',
            bidTitle: b.bidTitle || '',
            bidRegdate: b.bidRegdate || '',
            bidLocation: b.bidLocation || b.bidAddress || '',
            score,
            matchedByAlias,
          };
        })
        .filter(c => c.bidNum)
        .sort((a, b) => (b.score - a.score) || (b.bidRegdate || '').localeCompare(a.bidRegdate || ''))
        .slice(0, 5);
        return jsonResponse({ candidates: scored }, env);
      } catch (e) {
        return jsonResponse({ candidates: [], error: e.message }, env, 500);
      }
    }

    // === VPS 프록시 — HTTPS 페이지에서 HTTP VPS 호출 시 Mixed Content 차단 회피 ===
    //   /ocr-screenshot           → VPS Tesseract OCR
    //   /screenshot-verify-request → VPS Storage 업로드 + 관리자 큐 등록
    //   토큰 없는 endpoint 라 Worker 에서 그대로 forward (Auth 헤더 안 붙임)
    if ((url.pathname === '/ocr-screenshot' || url.pathname === '/screenshot-verify-request') && request.method === 'POST') {
      if (!env.VPS_URL) {
        return jsonResponse({ status: 'error', reason: 'vps_not_configured' }, env, 500);
      }
      try {
        const body = await request.text();
        const vpsResp = await fetch(`${env.VPS_URL.replace(/\/$/, '')}${url.pathname}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const responseText = await vpsResp.text();
        return new Response(responseText, {
          status: vpsResp.status,
          headers: {
            'Content-Type': vpsResp.headers.get('content-type') || 'application/json',
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
          },
        });
      } catch (e) {
        return jsonResponse({ status: 'error', reason: 'vps_proxy_failed', error: e.message }, env, 502);
      }
    }

    // 스크린샷 검증: POST /verify-screenshot
    //   body: { siteName, ptId?, scheduleId?, assignee?, imageBase64 (data URL or pure base64) }
    //   흐름:
    //     1. Workers AI Vision 모델 (Llama 3.2 11B) 로 이미지에서 텍스트 추출
    //     2. 추출된 텍스트에서 단지명 + 우리 공법(POUR/CNC/DO/DETEX/시멘트분말) 키워드 검사
    //     3. 단지명 vs 입력 siteName 유사도 ≥ 0.8 이고 우리 공법 키워드 ≥1 이면 verified
    //   반환: { status: 'verified'|'needs_review', extractedText, extractedSite, hasOurMethod, similarity, reason }
    if (url.pathname === '/verify-screenshot' && request.method === 'POST') {
      try {
        if (!env.AI) {
          return jsonResponse({ status: 'error', reason: 'ai_binding_missing' }, env, 500);
        }
        const body = await request.json();
        const siteName = (body.siteName || '').trim();
        const imgRaw = body.imageBase64 || '';
        if (!siteName) return jsonResponse({ status: 'error', reason: 'empty_siteName' }, env, 400);
        if (!imgRaw) return jsonResponse({ status: 'error', reason: 'empty_image' }, env, 400);

        // data URL prefix 제거 → pure base64
        const b64 = imgRaw.replace(/^data:image\/[a-z]+;base64,/i, '');
        // base64 → Uint8Array (Workers AI 가 image 를 number[] 로 받음)
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        // 한국어 OCR 정확도 한계 대비 — 예시 값을 그대로 베끼지 않도록 빈 값/null 로 제시.
        // 라벨 prefix("단지명:" 등) 도 제거하도록 명시.
        const prompt = `Korean K-APT (공동주택관리정보시스템) bid screenshot. Output EXACTLY this JSON (no markdown, no extra text):
{"apartmentName":"","ourMethodFound":[],"winner":null}

Rules:
- apartmentName: ONLY the apartment name itself (no "단지명:" label, no extra words). Empty string if not visible.
- ourMethodFound: List ONLY keywords actually visible in the image. Choose from: POUR, CNC, DO, DETEX, 시멘트분말. Empty array if none seen.
- winner: 낙찰업체명 if visible, else null.
- Read the actual Korean characters in the image. Do not invent or assume any values.`;

        // Llama 3.2 Vision 라이선스 동의 — 첫 호출 시 계정 단위로 'agree' 필요
        try {
          await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' });
        } catch {}

        const aiResp = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          image: Array.from(bytes),
          prompt,
          max_tokens: 512,
        });

        // Workers AI 응답은 다양한 형태 — 모두 string 으로 정규화
        let responseText = '';
        if (typeof aiResp === 'string') responseText = aiResp;
        else if (aiResp && typeof aiResp.response === 'string') responseText = aiResp.response;
        else if (aiResp && typeof aiResp.text === 'string') responseText = aiResp.text;
        else if (aiResp && Array.isArray(aiResp.description)) responseText = aiResp.description.join(' ');
        else responseText = JSON.stringify(aiResp);

        // JSON 추출 (모델이 ```json ``` 으로 감쌀 수 있음)
        let parsed = null;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch {}
        }

        if (!parsed) {
          return jsonResponse({
            status: 'needs_review',
            reason: 'ai_response_unparseable',
            rawResponse: responseText.slice(0, 500),
          }, env);
        }

        // 라벨 prefix 제거 — "단지명: 하안7단지아파트" → "하안7단지아파트"
        let extractedSite = String(parsed.apartmentName || '').trim();
        extractedSite = extractedSite.replace(/^(단지\s*명|단지|아파트\s*명|소\s*재\s*지|단지\s*명칭|아파트명|명칭|이름|name)\s*[:：]\s*/i, '').trim();
        // 끝에 따라오는 " 아파트" 같은 일반 토큰은 유지 (단지명에 자주 포함됨)
        const hasOurMethod = !!parsed.hasOurMethod || !!parsed.hasPourMethod ||
          (Array.isArray(parsed.ourMethodFound) && parsed.ourMethodFound.length > 0);

        // 단지명 유사도 계산 (간단 substring + 정규화)
        const normName = (s) => String(s || '').toLowerCase()
          .replace(/[\s()()[\]【】.\-_/\\·•‧⋅,，~～]/g, '')
          .replace(/(\d+)\s*[/·•‧⋅\-]\s*(\d+)\s*단지/g, '$1및$2단지');
        const a = normName(siteName);
        const b = normName(extractedSite);
        let similarity = 0;
        if (a && b) {
          if (a === b) similarity = 1;
          else if (a.includes(b) || b.includes(a)) similarity = Math.min(a.length, b.length) / Math.max(a.length, b.length);
          else {
            // 공통 substring
            const longer = a.length >= b.length ? a : b;
            const shorter = a.length >= b.length ? b : a;
            let best = 0;
            for (let len = shorter.length; len >= 3 && len > best; len--) {
              for (let i = 0; i + len <= shorter.length; i++) {
                if (longer.includes(shorter.slice(i, i + len))) { best = len; break; }
              }
            }
            similarity = best / longer.length;
          }
        }

        // 판정 기준 (현실 보정):
        //   - similarity ≥ 0.65 + hasOurMethod  → verified (AI OCR 한국어 한자 누락 흔함, 0.8 너무 엄격)
        //   - similarity ≥ 0.4  + hasOurMethod  → soft_match (사용자 확인 후 수동 승인 가능)
        //   - 그 외 → needs_review
        const verified = similarity >= 0.65 && hasOurMethod;
        const softMatch = !verified && similarity >= 0.4 && hasOurMethod;
        let status, reason;
        if (verified) { status = 'verified'; reason = null; }
        else if (softMatch) { status = 'soft_match'; reason = 'low_similarity_confirm_needed'; }
        else if (!hasOurMethod) { status = 'needs_review'; reason = 'no_our_method'; }
        else { status = 'needs_review'; reason = 'siteName_mismatch'; }

        return jsonResponse({
          status,
          reason,
          extractedSite,
          inputSiteName: siteName,
          hasOurMethod,
          ourMethodFound: parsed.ourMethodFound || [],
          winner: parsed.winner || null,
          similarity: Number(similarity.toFixed(3)),
          source: 'screenshot',
          model: '@cf/meta/llama-3.2-11b-vision-instruct',
        }, env);
      } catch (e) {
        return jsonResponse({ status: 'error', reason: 'exception', error: e.message }, env, 500);
      }
    }

    // 분기 확인 리마인드 수동 실행: POST /run-quarterly-reminder { quarterKey?, force? }
    //   미확인 담당자에게 개인 잔디 재발송
    if (url.pathname === '/run-quarterly-reminder' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await sendQuarterlyConfirmationReminders(env, { quarterKey: body.quarterKey, force: !!body.force });
        return jsonResponse(result, env);
      } catch (e) {
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    // 영업회의 D-7/D-1 알림 수동 실행 (테스트·재발송용): POST /run-sales-meeting-reminders
    //   { dryRun?, force? } — force=true 면 notifyLog 무시하고 재발송
    if (url.pathname === '/run-sales-meeting-reminders' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await sendSalesMeetingReminders(env, { dryRun: !!body.dryRun, force: !!body.force });
        return jsonResponse(result, env);
      } catch (e) {
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    // 동일 단지/담당/공종 PT 자동 superseded 수동 실행: POST /run-auto-supersede
    //   { dryRun?, force? } — dryRun=true 면 처리 대상만 미리보기
    if (url.pathname === '/run-auto-supersede' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await runAutoSupersede(env, { dryRun: !!body.dryRun, force: !!body.force });
        return jsonResponse(result, env);
      } catch (e) {
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    // 김유림 발송 준비 상태 체크: POST /check-report-readiness { quarterKey?, force? }
    //   전원 finalConfirmed → admin 잔디 알림 (중복 방지)
    if (url.pathname === '/check-report-readiness' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await checkQuarterReportReadiness(env, { quarterKey: body.quarterKey, force: !!body.force });
        return jsonResponse(result, env);
      } catch (e) {
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    // 관리자 수동 트리거: POST /run-quarterly-settlement { quarterKey?, force? }
    //   quarterKey: "YYYY-QN" (생략 시 현재 분기 KST)
    //   force: true 면 분기 마지막월 마지막주 월요일 아니어도 실행
    // 하위호환: /run-monthly-settlement 도 받아서 같은 함수 호출 (Body 의 monthKey 는 무시됨 — 현재분기로 동작)
    if ((url.pathname === '/run-quarterly-settlement' || url.pathname === '/run-monthly-settlement') && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await runQuarterlySettlementIfLastMonday(env, {
          quarterKey: body.quarterKey,
          monthKey: body.monthKey,
          force: !!body.force,
          overwrite: !!body.overwrite,
        });
        // 중복 가드 응답은 409 로 (admin 모달이 덮어쓰기 프롬프트 띄움)
        const httpStatus = result.status === 'exists' ? 409 : 200;
        return jsonResponse(result, env, httpStatus);
      } catch (e) {
        console.error('[quarterly-settlement] error', e);
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
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

    // VPS 셀프 업데이트: POST /vps-update (코드 pull + npm install)
    //                   POST /vps-restart (서비스 재시작)
    //   목적: SSH 없이 워커로 VPS 갱신·재시작 — playwright-server self-update endpoint 패스스루
    if ((url.pathname === '/vps-update' || url.pathname === '/vps-restart') && request.method === 'POST') {
      if (!env.VPS_URL || !env.VPS_AUTH_TOKEN) {
        return jsonResponse({ status: 'error', error: 'VPS_URL/VPS_AUTH_TOKEN 미설정' }, env, 500);
      }
      const target = url.pathname === '/vps-update' ? '/admin/self-update' : '/admin/self-restart';
      try {
        const r = await fetch(`${env.VPS_URL}${target}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.VPS_AUTH_TOKEN}`,
          },
          body: JSON.stringify({}),
        });
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 1000) }; }
        return jsonResponse({ status: r.ok ? 'ok' : 'error', httpStatus: r.status, ...data }, env, r.ok ? 200 : 502);
      } catch (e) {
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    // 잔디 채널 sync (백필용): POST /jandi-sync
    //   Body: { channelName?, monthsBack?, maxFiles?, maxScrolls?, forceReupload? }
    //   playwright-server /admin/jandi-channel-sync 로 passthrough
    if (url.pathname === '/jandi-sync' && request.method === 'POST') {
      if (!env.VPS_URL || !env.VPS_AUTH_TOKEN) {
        return jsonResponse({ status: 'error', error: 'VPS_URL/VPS_AUTH_TOKEN 미설정' }, env, 500);
      }
      try {
        const body = await request.json().catch(() => ({}));
        const r = await fetch(`${env.VPS_URL}/admin/jandi-channel-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.VPS_AUTH_TOKEN}`,
          },
          body: JSON.stringify({
            channelName: '입찰 공고(POUR공법)',
            monthsBack: 12,
            maxFiles: 1000,
            maxScrolls: 1000,
            ...body,
          }),
        });
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
        return jsonResponse({ status: r.ok ? 'ok' : 'error', httpStatus: r.status, ...data }, env, r.ok ? 200 : 502);
      } catch (e) {
        console.error('[jandi-sync] error', e);
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    // 잔디 PT 자동 매칭 강제 실행: POST /jandi-rematch
    //   Body: { limit?, includeUnverified?, ptIds? }
    //   playwright-server /admin/jandi-pt-match 로 passthrough (VPS_AUTH_TOKEN 자동 첨부)
    if (url.pathname === '/jandi-rematch' && request.method === 'POST') {
      if (!env.VPS_URL || !env.VPS_AUTH_TOKEN) {
        return jsonResponse({ status: 'error', error: 'VPS_URL 또는 VPS_AUTH_TOKEN 미설정' }, env, 500);
      }
      try {
        const body = await request.json().catch(() => ({}));
        const r = await fetch(`${env.VPS_URL}/admin/jandi-pt-match`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.VPS_AUTH_TOKEN}`,
          },
          body: JSON.stringify({ limit: 200, includeUnverified: true, ...body }),
        });
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
        return jsonResponse({ status: r.ok ? 'ok' : 'error', httpStatus: r.status, ...data }, env, r.ok ? 200 : 502);
      } catch (e) {
        console.error('[jandi-rematch] error', e);
        return jsonResponse({ status: 'error', error: e.message }, env, 500);
      }
    }

    return jsonResponse({
      error: 'Not found',
      endpoints: ['POST /verify', 'POST /search-candidates', 'POST /run-quarterly-settlement', 'POST /run-quarterly-reminder', 'POST /check-report-readiness', 'POST /sync?days=N', 'POST /jandi-rematch', 'GET /bid/:bidNum', 'GET /health'],
    }, env, 404);
  },

  async scheduled(event, env, ctx) {
    // cron 표현식으로 분기:
    //   "0 17 * * *" → 매일 02:00 KST 공고 동기화
    //   "0 0 * * 1"  → 매주 월요일 09:00 KST — 분기 마지막월 마지막주 월요일만 분기정산 실행
    //   "0 0,8 * * *" → 매일 09/17 KST — 분기 확인 리마인드 (deadline 내 미확인자만)
    console.log('[cron] triggered', event.cron, new Date().toISOString());
    if (event.cron === '0 17 * * *') {
      try {
        const result = await syncRecentBids(env, 2);
        console.log('[cron] sync result', result);
      } catch (e) { console.error('[cron] sync failed', e); }
      return;
    }
    if (event.cron === '0 0 * * 1') {
      try {
        const result = await runQuarterlySettlementIfLastMonday(env);
        console.log('[cron] quarterly settlement result', result);
      } catch (e) { console.error('[cron] quarterly settlement failed', e); }
      // 월요일 09시는 리마인드도 같이 발송
      try {
        const rr = await sendQuarterlyConfirmationReminders(env);
        console.log('[cron] reminder result', rr);
      } catch (e) { console.error('[cron] reminder failed', e); }
      // 영업회의 알림도 (월요일 09시 = 영업회의 D-7 케이스 커버 — 화/수/목 트리거는 0,8 cron이 처리)
      try {
        const sm = await sendSalesMeetingReminders(env);
        console.log('[cron] sales meeting reminders', sm);
      } catch (e) { console.error('[cron] sales meeting reminders failed', e); }
      return;
    }
    if (event.cron === '0 0,8 * * *') {
      try {
        const result = await sendQuarterlyConfirmationReminders(env);
        console.log('[cron] reminder result', result);
      } catch (e) { console.error('[cron] reminder failed', e); }
      // 같은 타이밍에 김유림 발송 준비 상태 체크
      try {
        const rr = await checkQuarterReportReadiness(env);
        console.log('[cron] readiness result', rr);
      } catch (e) { console.error('[cron] readiness check failed', e); }
      // 영업회의 D-7 / D-1 알림 (09시 트리거에서만 — 17시는 중복 방지로 skip)
      const utcHour = new Date(event.scheduledTime || Date.now()).getUTCHours();
      if (utcHour === 0) {  // 09시 KST 만
        try {
          const sm = await sendSalesMeetingReminders(env);
          console.log('[cron] sales meeting reminders', sm);
        } catch (e) { console.error('[cron] sales meeting reminders failed', e); }
        // 동일 단지/담당/공종 PT 자동 superseded
        try {
          const sp = await runAutoSupersede(env);
          console.log('[cron] auto-supersede', sp);
        } catch (e) { console.error('[cron] auto-supersede failed', e); }
      }
      return;
    }
  },
};

// === 동일 단지/담당자/공종 카테고리 PT 그룹 자동 superseded ===
// 룰: 같은 (단지명 정규화 + 주담당자 + 공종 카테고리) PT 그룹 → 최후 PT 만 살리고 이전 모두 superseded.
// 안전 가드: 이전 PT 가 이미 completed(정산완료) 면 자동 처리 skip → 경고 리포트만.
// 실행: 매일 cron (0 0,8 * * *) 09 KST 1회.
// 수동: POST /run-auto-supersede { dryRun?, force? }
//
// 같은 단지 다른 공종(슬라브 vs 에폭시 등)은 카테고리 기반으로 별개 그룹 → 자동 처리 안 함.
// (사용자가 요청한 슬라브/에폭시 분리 케이스 보존)
const SUPERSEDE_CATEGORY_KEYWORDS = {
  방수:   ['옥상방수','옥상 방수','우레탄','복합방수','시트방수','방수공사','방수','시트'],
  재도장: ['재도장','외벽도장','외벽 도장','균열보수','균열 보수','균열','크랙','도장','페인트'],
  주차장: ['지하주차장','주차장','에폭시'],
  도로:   ['아스콘','경계석','도로 포장','도로포장','포장공사'],
};
function inferSupersedeCategory(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  const matched = new Set();
  for (const [cat, kws] of Object.entries(SUPERSEDE_CATEGORY_KEYWORDS)) {
    for (const kw of kws) { if (lower.includes(kw.toLowerCase())) { matched.add(cat); break; } }
  }
  if (matched.size === 0) return null;
  if (matched.has('방수')) return '방수';
  if (matched.has('도로')) return '도로';
  if (matched.has('주차장')) return '주차장';
  return '재도장';
}
function normSupersedeSite(s) {
  return String(s || '')
    .replace(/_?\d+차PT$/gi, '')
    .replace(/\s+/g, '')
    .replace(/[()()[\]【】]/g, '')
    .toLowerCase();
}
// 주소 정규화 — "광주시 북구 서하로94번길 10" / "광주 북구 서하로94번길 10" 같이 표기
function normSupersedeAddress(s) {
  if (!s) return '';
  return String(s)
    .replace(/특별시|광역시|특별자치시|특별자치도/g, '')
    .replace(/\s+/g, '')
    .replace(/[(),.-]/g, '')
    .replace(/번지|동$/g, '')
    .toLowerCase();
}
function primaryAssigneeSupersede(pt) {
  return (pt.ptAssignee || '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean)[0] || null;
}

async function runAutoSupersede(env, opts = {}) {
  const { dryRun = false, force = false } = opts;
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) {
    return { skipped: 'no_firebase_config' };
  }
  const ptUrl = `${env.FIREBASE_DB_URL}/pt.json?auth=${env.FIREBASE_DB_SECRET}`;
  const ptResp = await fetch(ptUrl);
  if (!ptResp.ok) return { error: `firebase_${ptResp.status}` };
  const pts = await ptResp.json() || {};

  // 1차: 단지명 기반 그룹화 (기존)
  // 2차: 주소 기반 그룹화 (사용자 요청 — 단지명 다르지만 같은 주소 = 동일 단지)
  //      예: "쌍용예가" + "용봉동쌍용예가" = 둘 다 광주 북구 서하로94번길
  // 두 그룹 중 하나라도 매치되면 같이 묶음 (Union-Find 방식)
  const siteGroups = new Map(); // site key
  const addrGroups = new Map(); // address key
  const ptInfo = []; // [{ id, pt, siteKey, addrKey, assignee, cat }]
  for (const [id, pt] of Object.entries(pts)) {
    if (!pt || pt.selfPT) continue;
    const isSupervision = /감리/.test((pt.workType || '') + '|' + (pt.siteName || ''));
    if (isSupervision) continue;
    const a = primaryAssigneeSupersede(pt);
    if (!a) continue;
    const cat = pt.mainCategory || inferSupersedeCategory(pt.workType);
    if (!cat) continue;
    const site = normSupersedeSite(pt.siteName);
    const addr = normSupersedeAddress(pt.address);
    if (!site && !addr) continue;
    const siteKey = site ? `S:${site}__${a}__${cat}` : null;
    const addrKey = addr ? `A:${addr}__${a}__${cat}` : null;
    ptInfo.push({ id, pt, siteKey, addrKey, assignee: a, cat });
    if (siteKey) {
      if (!siteGroups.has(siteKey)) siteGroups.set(siteKey, []);
      siteGroups.get(siteKey).push(id);
    }
    if (addrKey) {
      if (!addrGroups.has(addrKey)) addrGroups.set(addrKey, []);
      addrGroups.get(addrKey).push(id);
    }
  }

  // Union-Find: ptId → 대표(root) 매핑
  const parent = new Map();
  const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const info of ptInfo) parent.set(info.id, info.id);
  // 같은 siteKey 의 ID들 union
  for (const ids of siteGroups.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  // 같은 addrKey 의 ID들 union (siteKey 다른 PT 도 같은 주소면 묶임)
  for (const ids of addrGroups.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);

  // root 별로 PT 묶기
  const groups = new Map();
  for (const info of ptInfo) {
    const root = find(info.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push({ id: info.id, pt: info.pt });
  }

  const ops = [];
  const conflicts = [];
  for (const [key, list] of groups.entries()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.pt.date || '').localeCompare(b.pt.date || ''));
    const latest = list[list.length - 1];
    for (const earlier of list.slice(0, -1)) {
      const a = primaryAssigneeSupersede(earlier.pt);
      const stl = earlier.pt.settlement?.[a] || {};
      if (!force && (stl.superseded === true || stl.status === 'superseded')) continue;
      if (!force && (stl.completed === true || stl.status === 'completed')) {
        conflicts.push({ key, earlierId: earlier.id, earlierDate: earlier.pt.date,
                         latestId: latest.id, latestDate: latest.pt.date,
                         siteName: earlier.pt.siteName, reason: 'earlier-completed' });
        continue;
      }
      ops.push({ key, earlier, latest, assignee: a });
    }
  }

  if (dryRun) {
    return {
      dryRun: true, totalGroups: groups.size, opsCount: ops.length, conflictsCount: conflicts.length,
      ops: ops.slice(0, 20).map(o => ({ siteName: o.earlier.pt.siteName,
        earlierId: o.earlier.id, earlierDate: o.earlier.pt.date,
        latestId: o.latest.id, latestDate: o.latest.pt.date, assignee: o.assignee })),
      conflicts,
    };
  }

  // 적용
  const nowISO = new Date().toISOString();
  const updatePromises = [];
  for (const o of ops) {
    const base = `pt/${o.earlier.id}/settlement/${o.assignee}`;
    const patch = {
      superseded: true,
      supersededAt: nowISO,
      supersededBy: o.latest.id,
      supersededReason: `동일 단지/담당/공종 — 최신 PT(${o.latest.pt.date})로 단일화 [auto]`,
      status: 'superseded',
      calculatedAmount: 0,
    };
    const url = `${env.FIREBASE_DB_URL}/${base}.json?auth=${env.FIREBASE_DB_SECRET}`;
    updatePromises.push(fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }));
  }
  await Promise.all(updatePromises);

  return {
    totalGroups: groups.size, processed: ops.length, conflictsCount: conflicts.length,
    sample: ops.slice(0, 10).map(o => ({ siteName: o.earlier.pt.siteName,
      earlierId: o.earlier.id, earlierDate: o.earlier.pt.date,
      latestId: o.latest.id, latestDate: o.latest.pt.date })),
    conflicts,
  };
}

// === 영업회의 알림 (D-7 / D-1) ===
// meetings/{id} 노드에서 title 에 "영업회의" 포함된 미래 회의 조회.
// 오늘 기준 +7일 또는 +1일에 회의가 있으면 잔디 웹훅 발송.
// 멱등성: meetings/{id}/notifyLog/{D-7|D-1} 에 발송 기록 → 중복 발송 방지.
//
// 웹훅 URL: SALES_MEETING_WEBHOOK_URL secret 또는 하드코딩 (사용자 제공).
const SALES_MEETING_WEBHOOK_FALLBACK = 'https://wh.jandi.com/connect-api/webhook/26098605/503f681ce06c8e5e33a07c35d08c6b66';

async function sendSalesMeetingReminders(env, opts = {}) {
  const { dryRun = false, force = false } = opts;
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) {
    return { skipped: 'no_firebase_config' };
  }
  const webhookUrl = env.SALES_MEETING_WEBHOOK_URL || SALES_MEETING_WEBHOOK_FALLBACK;
  if (!webhookUrl) return { skipped: 'no_webhook' };

  // 오늘 KST 날짜
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayStr = nowKst.toISOString().slice(0, 10);
  const addDays = (n) => {
    const d = new Date(nowKst);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const d7 = addDays(7);
  const d1 = addDays(1);

  // meetings 조회
  const url = `${env.FIREBASE_DB_URL}/meetings.json?auth=${env.FIREBASE_DB_SECRET}`;
  const resp = await fetch(url);
  if (!resp.ok) return { error: `firebase_${resp.status}` };
  const meetings = await resp.json() || {};

  const sent = [];
  const skipped = [];

  for (const [mid, m] of Object.entries(meetings)) {
    if (!m || !m.title || !m.date) continue;
    if (!String(m.title).includes('영업회의')) continue;

    let kind = null;
    if (m.date === d7) kind = 'D-7';
    else if (m.date === d1) kind = 'D-1';
    if (!kind) continue;

    // 멱등성: 이미 발송됐으면 skip (force=true 면 무시)
    const logKey = kind === 'D-7' ? 'd7' : 'd1';
    if (!force && m.notifyLog && m.notifyLog[logKey]) {
      skipped.push({ mid, title: m.title, date: m.date, kind, reason: 'already_sent', sentAt: m.notifyLog[logKey].sentAt });
      continue;
    }

    // 메시지 빌드
    const dateObj = new Date(m.date + 'T00:00:00+09:00');
    const dayKr = ['일','월','화','수','목','금','토'][dateObj.getUTCDay()];
    const month = dateObj.getUTCMonth() + 1;
    const day = dateObj.getUTCDate();
    const time = m.time || '09:00';
    const location = m.location || '본사 2층 회의실';
    const headline = kind === 'D-7'
      ? `📢 영업회의 일정 알림 — D-7 (1주일 전)`
      : `⏰ 영업회의 내일 진행 — D-1 알림`;

    const message = {
      body: `@all ${headline}`,
      connectColor: kind === 'D-7' ? '#2563eb' : '#dc2626',
      connectInfo: [{
        title: m.title,
        description: [
          `일시: ${month}월 ${day}일(${dayKr}) ${time}`,
          `장소: ${location}`,
          `참석대상: 전 영업담당자`,
          '',
          '영업회의 공지드립니다. 영업담당자 분들께서는 일정을 확인하시어 불참자 없이 반드시 전원 참석해주시기 바랍니다.',
          '참석 여부를 사전에 체크 부탁드립니다.',
        ].join('\n'),
      }],
    };

    // dryRun 이면 발송 skip, 미리보기만 반환
    if (dryRun) {
      sent.push({ mid, title: m.title, date: m.date, kind, dryRun: true, preview: message });
      continue;
    }

    // 발송
    let ok = false, errMsg = null;
    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.tosslab.jandi-v2+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      ok = r.ok;
      if (!r.ok) errMsg = `HTTP ${r.status}`;
    } catch (e) {
      errMsg = e.message || 'fetch_failed';
    }

    if (ok) {
      // 발송 로그 기록 (멱등성)
      const logUrl = `${env.FIREBASE_DB_URL}/meetings/${mid}/notifyLog/${logKey}.json?auth=${env.FIREBASE_DB_SECRET}`;
      try {
        await fetch(logUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sentAt: new Date().toISOString(), kind, by: 'cron-worker' }),
        });
      } catch (_) {}
      sent.push({ mid, title: m.title, date: m.date, kind });
    } else {
      skipped.push({ mid, title: m.title, date: m.date, kind, reason: 'send_failed', error: errMsg });
    }
  }

  return { todayStr, d7, d1, sentCount: sent.length, sent, skippedCount: skipped.length, skipped };
}

// === VPS 프록시 (한국 Lightsail Seoul → K-APT 직접 접근) ===
// 검증 성공(verified) 시 → Firebase pt/{scheduleId}에 공고번호·공법 자동 기록 (크로스체크 자동화)
async function verifyViaVps(env, args) {
  if (!env.VPS_URL || !env.VPS_AUTH_TOKEN) {
    return { status: 'error', error: 'VPS_URL 또는 VPS_AUTH_TOKEN 미설정' };
  }
  const bidNum = args.bidNum || args.bidNo;
  const siteName = args.siteName || '';
  if (!bidNum && !siteName) {
    return { status: 'needs_review', reason: 'no_bidNum_or_siteName' };
  }
  const vpsArgs = {
    bidNum: bidNum || undefined,
    siteName,
    assignee: args.assignee || '',
    ptDate: args.ptDate || '',
    by: args.by || '',
    dataGoKrKey: bidNum ? undefined : env.DATA_GO_KR_KEY,
  };
  const resp = await fetch(`${env.VPS_URL}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.VPS_AUTH_TOKEN}`,
    },
    body: JSON.stringify(vpsArgs),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`VPS HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const result = await resp.json();

  // === 검증 성공 → Firebase pt/{scheduleId}에 자동 기록 (크로스체크 자동화 핵심) ===
  if (result.status === 'verified' && args.scheduleId && env.FIREBASE_DB_URL && env.FIREBASE_DB_SECRET) {
    try {
      const foundBidNum = result.bidNum || result.matchedBid?.bidNum || bidNum;
      const matchedTech = result.matchedValue || null;
      const matchedBy = result.matchedBy || 'technology';
      // verdictEngine snapshot (VPS 에서 전달됨 — 3단계 신호 점수제 결과)
      const v = result.verdict || null;
      const update = {
        bidNo: foundBidNum,
        announcementMethods: matchedTech,
        kaptVerified: {
          status: 'verified',
          matchedBy,
          matchedValue: matchedTech,
          patentName: result.patentName || null,
          ourPatents: Array.isArray(result.ourPatents) ? result.ourPatents : [],
          competitorPatents: Array.isArray(result.competitorPatents) ? result.competitorPatents : [],
          competitorTechs: Array.isArray(result.competitorTechs) ? result.competitorTechs : [],
          bidNum: foundBidNum,
          bidTitle: result.bidTitle || result.matchedBid?.bidTitle || null,
          bidKaptname: result.bidKaptname || result.matchedBid?.bidKaptname || null,
          verifiedAt: new Date().toISOString(),
          verifiedBy: 'auto-kapt-worker',
          source: result.source || 'vps',
          // verdictEngine 증빙 snapshot (분쟁 방지 / 사후 감사용)
          verdict: v ? v.verdict : null,
          verdictReason: v ? v.reason : null,
          ourScore: v ? v.ourScore : null,
          competitorScore: v ? v.competitorScore : null,
          ourKeywords: v ? (v.ourKeywords || []) : [],
          competitorKeywords: v ? (v.competitorKeywords || []) : [],
          ignoredCombos: v ? (v.ignoredCombos || []) : [],
        },
      };
      const url = `${env.FIREBASE_DB_URL}/pt/${args.scheduleId}.json?auth=${env.FIREBASE_DB_SECRET}`;
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      result.firebaseUpdated = true;

      // Q2+ 자동 정산대상 전환 (Worker 안전망)
      // 클라이언트 autoTransitionIfEligible 가 호출을 놓칠 경우 Worker 가 보장 전환
      try {
        const at = await autoTransitionAfterVerifyWorker(env, args.scheduleId, args.assignee);
        if (at?.transitioned) result.autoTransitioned = at;
      } catch (e) { console.warn('[auto-transition] worker failed:', e.message); }
    } catch (e) {
      console.warn('[verify] Firebase PT update failed:', e.message);
      result.firebaseUpdateError = e.message;
    }
  }

  // 검증 실패 시 잔디 알림 + Firebase에 확인필요 마커
  if (result.status === 'needs_review') {
    if (args.scheduleId && env.FIREBASE_DB_URL && env.FIREBASE_DB_SECRET) {
      try {
        const v = result.verdict || null;
        const url = `${env.FIREBASE_DB_URL}/pt/${args.scheduleId}/kaptVerified.json?auth=${env.FIREBASE_DB_SECRET}`;
        await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'needs_review',
            reason: result.reason || 'unknown',
            verifiedAt: new Date().toISOString(),
            verifiedBy: 'auto-kapt-worker',
            // needs_review 여도 verdictEngine 점수/키워드는 저장 (진단용)
            verdict: v ? v.verdict : null,
            ourScore: v ? v.ourScore : null,
            competitorScore: v ? v.competitorScore : null,
            ourKeywords: v ? (v.ourKeywords || []) : [],
            competitorKeywords: v ? (v.competitorKeywords || []) : [],
            ignoredCombos: v ? (v.ignoredCombos || []) : [],
          }),
        });
      } catch (e) { console.warn('[verify] Firebase needs_review mark failed'); }
    }
    // 순위별 시도 결과 요약 메시지
    let sampleTitles = `단지명 [${siteName}] 검색 결과 없음`;
    if (result.rankedAttempts && result.rankedAttempts.length > 0) {
      sampleTitles = result.rankedAttempts.map(a =>
        `${a.rank}순위 "${a.bidKaptname}" (유사도 ${a.nameScore}) → ${a.matched ? '매칭✓' : '매칭X'}`
      ).join('\n   ');
    } else if (result.pageTextLength) {
      sampleTitles = `K-APT ${result.pageTextLength}자 파싱 완료, 우리 공법/특허 미발견`;
    }
    await notifyJandi(env, buildNoMatchMsg({
      siteName: args.siteName, assignee: args.assignee,
      ptDate: args.ptDate, by: args.by, bidNo: bidNum,
      totalFound: result.totalCandidates || 1,
      sampleTitles,
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

// === PT 검증 메인 (v5: VPS 우선, Firebase/API fallback) ===
async function verifyPt(args, env) {
  const { siteName, bidNo, assignee, ptDate, by } = args;

  // === Strategy 0: VPS 프록시로 K-APT 직접 파싱 (최우선, 가장 정확) ===
  // bidNo 있으면 직접 파싱 / 없으면 단지명 검색 후 후보 파싱
  if (env.VPS_URL && env.VPS_AUTH_TOKEN) {
    try {
      const vpsResult = await verifyViaVps(env, args);
      if (vpsResult && vpsResult.status) return vpsResult;
    } catch (e) {
      console.warn('[verify] VPS failed, fallback to API:', e.message);
    }
  }

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
  // [강화] 단지명 변형 후보 추가 시도:
  //   - target 그대로
  //   - "1및2단지" / "1단지" / 단지표기 제거 등 변형 (효천마을신안인스빌1/2단지 → "효천마을신안인스빌")
  //   - 양방향 substring match 폭 넓힘
  const variants = new Set([target]);
  // 단지표기 제거
  variants.add(target.replace(/\d+(단지|차|동|호|블럭|블록)/g, ''));
  variants.add(target.replace(/(단지|차|동|호|블럭|블록)\d*/g, ''));
  // 1및2단지 같은 우리 정규화 결과 → 1, 2 단지 분리
  const m = target.match(/^(.+?)(\d+)및(\d+)단지(.*)$/);
  if (m) {
    variants.add(m[1] + m[2] + '단지' + m[4]);
    variants.add(m[1] + m[3] + '단지' + m[4]);
    variants.add(m[1] + m[4]);
  }
  const arr = Object.values(data).filter(b => {
    const n = b.bidKaptnameNormalized || normalizeKoreanName(b.bidKaptname || '');
    if (!n) return false;
    for (const v of variants) {
      if (!v) continue;
      if (n.includes(v) || v.includes(n)) return true;
    }
    return false;
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
// 재시도 전략: HTTP 5xx / 네트워크 에러 시 최대 3회 (1s, 3s, 9s backoff).
// 4xx 는 재시도해도 무의미하므로 즉시 실패 기록.
async function notifyJandi(env, message) {
  if (!env.JANDI_WEBHOOK_URL) return { ok: false, reason: 'no_webhook' };
  return notifyJandiToUrl(env.JANDI_WEBHOOK_URL, message);
}

// 지정한 URL 로 발송 (담당자별 개인 webhook 용). 재시도 정책 동일.
async function notifyJandiToUrl(webhookUrl, message) {
  if (!webhookUrl) return { ok: false, reason: 'no_webhook' };
  const bodyBytes = new TextEncoder().encode(JSON.stringify(message));
  const maxAttempts = 3;
  const backoffs = [1000, 3000, 9000];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          // 잔디 webhook 은 Content-Type: application/vnd.tosslab.jandi-v2+json 을
          // 거절(400 "Invalid payload - body"). application/json 으로 변경.
          'Accept': 'application/vnd.tosslab.jandi-v2+json',
          'Content-Type': 'application/json',
        },
        body: bodyBytes,
      });
      if (resp.ok) {
        if (attempt > 1) console.log(`[Jandi] sent on attempt ${attempt}`);
        return { ok: true, attempts: attempt };
      }
      if (resp.status >= 400 && resp.status < 500) {
        const text = await resp.text().catch(() => '');
        console.warn(`[Jandi] 4xx ${resp.status} — abort retry`, text.slice(0, 200));
        return { ok: false, reason: `http_${resp.status}`, attempts: attempt };
      }
      console.warn(`[Jandi] 5xx ${resp.status} attempt ${attempt}/${maxAttempts}`);
    } catch (e) {
      console.warn(`[Jandi] network error attempt ${attempt}/${maxAttempts}`, e.message);
    }
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, backoffs[attempt - 1]));
    }
  }
  console.error('[Jandi] failed after all retries');
  return { ok: false, reason: 'retries_exhausted', attempts: maxAttempts };
}

// Q2+ 자동 정산대상 전환 (Worker 안전망)
// 검증 성공 직후 호출 — 조건 충족 시 settlement.requested=true + 담당자 개인 잔디 알림
const WORKER_AUTO_TRANSITION_START = '2026-04-01';

async function autoTransitionAfterVerifyWorker(env, scheduleId, primaryAssignee) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET || !scheduleId) return { skipped: true, reason: 'args' };
  // PT 로드
  const ptResp = await fetch(`${env.FIREBASE_DB_URL}/pt/${scheduleId}.json?auth=${env.FIREBASE_DB_SECRET}`);
  if (!ptResp.ok) return { skipped: true, reason: `pt_fetch_${ptResp.status}` };
  const pt = await ptResp.json();
  if (!pt) return { skipped: true, reason: 'pt_null' };
  if (!pt.date || pt.date < WORKER_AUTO_TRANSITION_START) return { skipped: true, reason: 'pre_q2' };
  if (pt.selfPT) return { skipped: true, reason: 'selfpt' };
  if (pt.kaptVerified?.status === 'cancelled') return { skipped: true, reason: 'cancelled_notice' };

  const transitioned = [];
  const notified = [];
  const tokens = (pt.ptAssignee || '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean);
  // 지정 담당자가 있으면 그 사람만, 없으면 전체 체크
  const targets = primaryAssignee ? [primaryAssignee] : tokens;

  for (const assignee of targets) {
    if (!tokens.includes(assignee)) continue;
    const stl = pt.settlement?.[assignee] || {};
    if (stl.selfSales || stl.requested || stl.completed) continue;

    // 감리는 결과 무관 — 자동 전환
    const isSup = /감리/.test((pt.workType || '') + '|' + (pt.siteName || ''));
    let result = null;
    let triggeredBy = 'auto-kapt-verified';
    if (isSup) {
      triggeredBy = 'auto-supervision';
      result = '감리';
    } else {
      // 결과 파생 (지원자 규칙)
      let raw = null;
      if (pt.results && pt.results[assignee] !== undefined) raw = pt.results[assignee];
      else if (tokens.length <= 1) raw = pt.result || null;
      if (!raw) continue;  // 결과 없으면 전환 대상 아님
      if (raw === '지원' && tokens[0] && assignee !== tokens[0]) {
        const mr = pt.results?.[tokens[0]] || pt.result;
        if (mr === '승') result = '지원';
        else if (mr === '무') continue;  // 제외
        else if (mr === '패') continue;  // 패배
        else continue;
      } else {
        result = raw;
      }
      if (!['승', '무', '지원'].includes(result)) continue;
    }

    // 금액 계산
    const amount = isSup ? 80000 : (result === '승' ? 500000 : (result === '무' || result === '지원') ? 250000 : 0);
    if (amount === 0) continue;

    // Firebase 업데이트
    const now = new Date().toISOString();
    const patch = {
      requested: true,
      requestedAt: now,
      requestedBy: triggeredBy,
      status: 'requested',
      autoTransition: true,
    };
    try {
      await fetch(`${env.FIREBASE_DB_URL}/pt/${scheduleId}/settlement/${encodeURIComponent(assignee)}.json?auth=${env.FIREBASE_DB_SECRET}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      transitioned.push({ assignee, result, amount, triggeredBy });
    } catch (e) { continue; }

    // 담당자 개인 잔디 알림
    const personalUrl = await fetchUserJandiWebhook(env, assignee);
    if (personalUrl) {
      try {
        await notifyJandiToUrl(personalUrl, {
          body: '✅ 정산대상 자동 전환',
          connectColor: '#16a34a',
          connectInfo: [{
            title: `${pt.siteName || '단지명 미입력'} — ${assignee}`,
            description: [
              `결과: ${result} · 예상금액: ${amount.toLocaleString('ko-KR')}원`,
              `PT일자: ${pt.date}`,
              `사유: ${triggeredBy === 'auto-supervision' ? '감리 (검증 불필요)' : 'K-APT 검증 완료'}`,
              '',
              '→ 관리자 확정 대기 중입니다.',
            ].join('\n'),
          }],
        });
        notified.push(assignee);
      } catch (e) {}
    }
  }
  return { transitioned: transitioned.length > 0, items: transitioned, notified };
}

// Firebase 에서 담당자별 jandi webhook 조회: config/jandi/users/{name}
async function fetchUserJandiWebhook(env, assignee) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) return null;
  try {
    const safe = encodeURIComponent(assignee);
    const url = `${env.FIREBASE_DB_URL}/config/jandi/users/${safe}.json?auth=${env.FIREBASE_DB_SECRET}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || !data.url || data.enabled === false) return null;
    return data.url;
  } catch { return null; }
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

// =================================================================
// 분기정산 (P5 개정 — 월정산 → 분기정산 전환)
// =================================================================
// 운영 기준: 분기 마지막월(3/6/9/12)의 마지막 주 월요일 09:00 KST 에 자동 실행.
// 해당 분기의 PT 전체 조회 → 담당자별 승/무/지원/제외/검토 집계 + 예상 금액
// Firebase quarterlySettlements/{YYYY-QN}/totals 와 /{YYYY-QN}/perAssignee/{name} 에 저장
// 관리자 잔디 알림 발송 (요약).

const SETTLEMENT_AMOUNTS = {
  WIN: 500000,
  DRAW: 250000,
  SUPPORT: 250000,
  SUPERVISION: 80000,
};

// KST 기준 오늘이 분기 마지막월의 마지막 주 월요일인지
function isLastMondayOfQuarterKST(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  if (kst.getUTCDay() !== 1) return false;  // 월요일 아님
  const month = kst.getUTCMonth() + 1; // 1~12
  // 분기 마지막월만 허용 (3/6/9/12)
  if (![3, 6, 9, 12].includes(month)) return false;
  // 다음 주 월요일이 다른 달이면 마지막 월요일
  const next = new Date(kst.getTime() + 7 * 86400 * 1000);
  return next.getUTCMonth() !== kst.getUTCMonth();
}

function getCurrentQuarterKeyKST(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const q = Math.ceil(m / 3);
  return `${y}-Q${q}`;
}

// "YYYY-QN" 에서 startMonth, endMonth (1-12) 추출
function parseQuarterKey(quarterKey) {
  const m = String(quarterKey || '').match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const q = parseInt(m[2], 10);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = q * 3;
  return { year, quarter: q, startMonth, endMonth };
}

// PT.date (YYYY-MM-DD) 가 해당 quarterKey 에 속하는지
function ptBelongsToQuarter(ptDate, quarterKey) {
  const p = parseQuarterKey(quarterKey);
  if (!p || !ptDate) return false;
  const dm = String(ptDate).match(/^(\d{4})-(\d{2})/);
  if (!dm) return false;
  const y = parseInt(dm[1], 10);
  const m = parseInt(dm[2], 10);
  return y === p.year && m >= p.startMonth && m <= p.endMonth;
}

// ===== 실적 확정일 기준 분기 귀속 =====
// PT + assignee 의 실적 확정일: finalConfirmedAt > requestedAt > pt.date
function getResultConfirmDateWorker(pt, assignee) {
  if (!pt || !assignee) return null;
  const stl = pt.settlement?.[assignee] || {};
  if (stl.finalConfirmedAt) return String(stl.finalConfirmedAt).slice(0, 10);
  if (stl.requestedAt) return String(stl.requestedAt).slice(0, 10);
  return pt.date || null;
}
function getQuarterKeyByConfirmDate(confirmDate) {
  if (!confirmDate) return null;
  const m = String(confirmDate).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  return `${y}-Q${Math.ceil(mo / 3)}`;
}

// 분기 종료 다음달 30일 (마감일)
//   Q1 → 4/30, Q2 → 7/30, Q3 → 10/30, Q4 → 익년 1/30
function getQuarterClosingDate(quarterKey) {
  const p = parseQuarterKey(quarterKey);
  if (!p) return null;
  let cY = p.year;
  let cM = p.endMonth + 1;
  if (cM > 12) { cM = 1; cY += 1; }
  return new Date(Date.UTC(cY, cM - 1, 30));
}

function getPayrollMonthByQuarterKey(quarterKey) {
  const p = parseQuarterKey(quarterKey);
  if (!p) return null;
  let y = p.year;
  let m = p.endMonth + 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

// pt·assignee 조합에 대한 결과 파생 (client settlement.js 와 동일한 규칙)
function deriveResultWorker(pt, assignee) {
  if (!pt || !assignee) return null;
  let raw = null;
  if (pt.results && pt.results[assignee] !== undefined) raw = pt.results[assignee];
  else {
    const tokens = (pt.ptAssignee || '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean);
    if (tokens.length <= 1) raw = pt.result || null;
  }
  if (!raw) return null;
  // 지원자 규칙 (client deriveAssigneeResult 와 일치)
  const tokens = (pt.ptAssignee || '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean);
  const main = tokens[0];
  if (raw === '지원' && main && assignee !== main) {
    const mainResult = pt.results?.[main] || pt.result;
    if (mainResult === '승') return '지원';
    if (mainResult === '무') return '제외';
    if (mainResult === '패') return '패';
    // main 결과가 '지원' 또는 미입력 → 지원자도 그대로 '지원' 처리 (250K 인정)
    return '지원';
  }
  return raw;
}

function calcAmountWorker(pt, assignee) {
  if (!pt || !assignee) return { amount: 0, result: null, reason: null };
  if (pt.selfPT) return { amount: 0, result: '제외', reason: 'vendor_self_pt' };
  const stl = pt.settlement?.[assignee] || {};
  if (stl.selfSales) return { amount: 0, result: '제외', reason: 'self_sales' };
  // 감리: 자동 80K 제거 — settlement.{a}.manualAmount 가 있으면 그 값, 없으면 0 (담당자 입력 대기)
  const isSupervision = /감리/.test((pt.workType || '') + '|' + (pt.siteName || ''));
  if (isSupervision) {
    const manualAmt = stl.manualAmount;
    if (typeof manualAmt === 'number' && manualAmt >= 0) {
      return { amount: manualAmt, result: '감리', reason: null };
    }
    return { amount: 0, result: '감리', reason: 'supervision_pending_input' };
  }
  const result = deriveResultWorker(pt, assignee);
  if (!result) return { amount: 0, result: null, reason: null };
  if (result === '제외') return { amount: 0, result: '제외', reason: 'draw_support_excluded' };
  if (result === '패') return { amount: 0, result: '패', reason: 'loss' };
  if (result === '승') return { amount: SETTLEMENT_AMOUNTS.WIN, result, reason: null };
  if (result === '무') return { amount: SETTLEMENT_AMOUNTS.DRAW, result, reason: null };
  if (result === '지원') return { amount: SETTLEMENT_AMOUNTS.SUPPORT, result, reason: null };
  return { amount: 0, result, reason: null };
}

async function runQuarterlySettlementIfLastMonday(env, opts = {}) {
  const now = new Date();
  const isLastMon = isLastMondayOfQuarterKST(now);
  if (!isLastMon && !opts.force) {
    return { status: 'skipped', reason: 'not_last_monday_of_quarter', now: now.toISOString() };
  }
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) {
    return { status: 'error', reason: 'firebase_not_configured' };
  }
  const quarterKey = opts.quarterKey || opts.monthKey /* 하위호환 */ || getCurrentQuarterKeyKST(now);
  const parsed = parseQuarterKey(quarterKey);
  if (!parsed) return { status: 'error', reason: 'invalid_quarter_key', quarterKey };

  // 중복 생성 가드: 기존 데이터 있고 overwrite 플래그 없으면 거부
  //   admin 모달은 이 응답 받으면 "덮어쓰기?" confirm 후 overwrite: true 로 재호출
  if (!opts.overwrite) {
    try {
      const existUrl = `${env.FIREBASE_DB_URL}/quarterlySettlements/${quarterKey}/totals.json?auth=${env.FIREBASE_DB_SECRET}`;
      const existResp = await fetch(existUrl);
      if (existResp.ok) {
        const existing = await existResp.json();
        if (existing && existing.generatedAt) {
          return {
            status: 'exists',
            reason: 'already_generated',
            quarterKey,
            existing: {
              generatedAt: existing.generatedAt,
              generatedBy: existing.generatedBy,
              totalAssignees: existing.totalAssignees,
              totalCount: existing.totalCount,
              totalEstimated: existing.totalEstimated,
            },
            hint: 'overwrite: true 로 재호출하면 덮어씀',
          };
        }
      }
    } catch (e) { console.warn('[quarterly] existing check failed', e.message); }
  }

  // 분기 마감일 + 급여 반영월 미리 계산
  const closingDate = getQuarterClosingDate(quarterKey);
  const closingDateStr = closingDate ? `${closingDate.getUTCFullYear()}-${String(closingDate.getUTCMonth() + 1).padStart(2, '0')}-${String(closingDate.getUTCDate()).padStart(2, '0')}` : null;
  const payrollMonth = getPayrollMonthByQuarterKey(quarterKey);

  // 1) PT 전체 로드
  const ptUrl = `${env.FIREBASE_DB_URL}/pt.json?auth=${env.FIREBASE_DB_SECRET}`;
  const ptResp = await fetch(ptUrl);
  if (!ptResp.ok) return { status: 'error', reason: `pt_fetch_http_${ptResp.status}` };
  const ptData = await ptResp.json();
  const allPts = ptData ? Object.entries(ptData).map(([id, pt]) => ({ id, ...pt })) : [];

  // 2) 담당자별 집계 — 사용자 정의 룰
  //    분기 정산 대상 = pt.date <= 분기 종료일 + settlement.{a}.requested=true (또는 mv) + completed != true
  //    옛날 PT라도 정산요청되면 해당 분기에 합산, 정산완료되면 다음 분기에 자동 제외
  const VALID_ASSIGNEES = new Set([
    '한준엽', '조재연', '정정훈', '김성민', '이필선', '한인규', '황윤선',
    '이승우', '부산지사',
  ]);
  // 분기 종료일 계산
  const _qParsed = parseQuarterKey(quarterKey);
  const _qEndMonth = _qParsed.quarter * 3;
  const _qEndDay = _qEndMonth === 3 || _qEndMonth === 12 ? 31 : 30;
  const _qEndDate = `${_qParsed.year}-${String(_qEndMonth).padStart(2, '0')}-${String(_qEndDay).padStart(2, '0')}`;
  const perAssignee = {};
  for (const pt of allPts) {
    if (pt.selfPT) continue; // 협약사 자체PT 통째 제외
    const ptDate = pt.date || '';
    if (!ptDate || ptDate > _qEndDate) continue; // 분기 종료일 이후 PT 는 제외 (다음 분기 대상)
    const tokens = (pt.ptAssignee || '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean);
    for (const assignee of tokens) {
      if (!VALID_ASSIGNEES.has(assignee)) continue;
      const stl = pt.settlement?.[assignee] || {};
      // 정산요청 OR 수동검증 안 됐으면 분기 정산 대상 아님 (담당자가 명시적으로 정산요청 누른 것만)
      if (!(stl.requested === true || stl.manualVerified === true)) continue;
      // 이미 정산완료된 건은 다음 분기 들어가지 않게 제외
      if (stl.completed === true) continue;
      // 중복 처리된(superseded) PT 도 분기 정산에서 빠짐
      if (stl.superseded === true || stl.status === 'superseded') continue;
      const confirmDate = ptDate;
      const assigneeQK = quarterKey;

      if (!perAssignee[assignee]) {
        perAssignee[assignee] = {
          quarterKey, assignee,
          totalCount: 0, winCount: 0, drawCount: 0, supportCount: 0, excludedCount: 0, reviewCount: 0,
          estimatedAmount: 0,
          status: 'draft',
          closingDate: closingDateStr, payrollMonth, reportedTo: '김유림',
          reportedToPayroll: false, reportedAt: null,
          generatedAt: now.toISOString(),
          generatedBy: opts.force ? 'manual' : 'cron',
          items: [],
        };
      }
      const agg = perAssignee[assignee];
      const calc = calcAmountWorker(pt, assignee);
      agg.totalCount++;
      agg.items.push({
        ptId: pt.id, siteName: pt.siteName, ptDate: pt.date,
        resultConfirmDate: confirmDate,
        result: calc.result, amount: calc.amount, reason: calc.reason,
      });
      if (calc.reason === 'loss' || calc.reason === 'vendor_self_pt' || calc.reason === 'self_sales' || calc.reason === 'draw_support_excluded' || calc.reason === 'cancelled_notice') {
        agg.excludedCount++;
        continue;
      }
      // 검토필요: K-APT needs_review 이고 증빙 없음
      const needsReview = pt.kaptVerified?.status === 'needs_review'
        && !(pt.evidenceFiles && Object.keys(pt.evidenceFiles).length > 0);
      if (needsReview) agg.reviewCount++;
      agg.estimatedAmount += calc.amount;
      if (calc.result === '승') agg.winCount++;
      else if (calc.result === '무') agg.drawCount++;
      else if (calc.result === '지원') agg.supportCount++;
    }
  }

  // 3) 전체 summary
  const totals = {
    quarterKey, totalAssignees: 0, totalCount: 0, totalEstimated: 0, totalReview: 0,
    closingDate: closingDateStr, payrollMonth, reportedTo: '김유림',
    generatedAt: now.toISOString(), generatedBy: opts.force ? 'manual' : 'cron',
    aggregationBasis: 'resultConfirmDate',
  };
  for (const agg of Object.values(perAssignee)) {
    if (agg.totalCount === 0) continue;
    totals.totalAssignees++;
    totals.totalCount += agg.totalCount;
    totals.totalEstimated += agg.estimatedAmount;
    totals.totalReview += agg.reviewCount;
  }

  // 5) Firebase 저장 (quarterlySettlements/{quarterKey})
  const writeUrl = `${env.FIREBASE_DB_URL}/quarterlySettlements/${quarterKey}.json?auth=${env.FIREBASE_DB_SECRET}`;
  const writeResp = await fetch(writeUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ totals, perAssignee }),
  });
  if (!writeResp.ok) return { status: 'error', reason: `firebase_write_http_${writeResp.status}`, totals };

  // 6) 관리자 잔디 알림
  const perList = Object.values(perAssignee)
    .filter(a => a.totalCount > 0)
    .sort((a, b) => b.estimatedAmount - a.estimatedAmount)
    .map(a => `${a.assignee}: ${a.totalCount}건 · 예상 ${(a.estimatedAmount || 0).toLocaleString('ko-KR')}원 (검토 ${a.reviewCount})`)
    .slice(0, 15);
  await notifyJandi(env, {
    body: `[${quarterKey} 분기정산 생성 완료 — 관리자 확인 필요]`,
    connectColor: '#dc2626',
    connectInfo: [{
      title: `총 ${totals.totalAssignees}명 · ${totals.totalCount}건 · 예상 ${(totals.totalEstimated || 0).toLocaleString('ko-KR')}원`,
      description: [
        `검토필요 합계: ${totals.totalReview}건`,
        '',
        '담당자별:',
        ...perList,
        '',
        '👉 관리자 분기정산 화면에서 정산확정/완료 처리하세요.',
      ].join('\n'),
    }],
  });

  // 7) 담당자별 개인 잔디 알림 — admin 이 명시적으로 notifyUsers:true 줄 때만 발송
  //    분기정산 생성/재집계 만으로는 발송 X (사용자 요청: 확정 전 발송 차단)
  const userNotifyResults = { sent: 0, skipped: 0, failed: 0, suppressedByDefault: false };
  if (opts.notifyUsers === true) {
    for (const agg of Object.values(perAssignee)) {
      if (agg.totalCount === 0) continue;
      const personalUrl = await fetchUserJandiWebhook(env, agg.assignee);
      if (!personalUrl) { userNotifyResults.skipped++; continue; }
      const amountStr = (agg.estimatedAmount || 0).toLocaleString('ko-KR') + '원';
      const r = await notifyJandiToUrl(personalUrl, {
        body: `[${quarterKey} 정산 안내]`,
        connectColor: '#2563eb',
        connectInfo: [{
          title: `담당자: ${agg.assignee}`,
          description: [
            `정산대상: ${agg.totalCount}건`,
            `승 ${agg.winCount} / 무 ${agg.drawCount} / 지원 ${agg.supportCount}`,
            `예상 정산금액: ${amountStr}`,
            agg.reviewCount > 0 ? `⚠ 검토필요: ${agg.reviewCount}건` : '',
            '',
            '👉 시스템에서 정산요청 상태를 확인해주세요.',
          ].filter(Boolean).join('\n'),
        }],
      });
      if (r.ok) userNotifyResults.sent++;
      else userNotifyResults.failed++;
    }
  } else {
    userNotifyResults.suppressedByDefault = true;
  }

  return { status: 'ok', quarterKey, totals, assigneesWritten: Object.keys(perAssignee).length, userNotify: userNotifyResults };
}

// =================================================================
// 분기 확인 리마인드 (매일 09/17 KST)
// =================================================================
// quarterConfirmations/{qKey}/{name}/confirmed !== true 인 담당자에게
// 개인 잔디 webhook (config/jandi/users/{name}) 으로 재발송.
// deadline 지나면 자동 종료.

function getQuarterDeadlineDate(quarterKey) {
  const p = parseQuarterKey(quarterKey);
  if (!p) return null;
  // 분기 종료 익월 30일 — Q1 → 4/30, Q2 → 7/30, Q3 → 10/30, Q4 → 익년 1/30
  const nextMonth = p.endMonth + 1 > 12 ? 1 : p.endMonth + 1;
  const y = p.endMonth + 1 > 12 ? p.year + 1 : p.year;
  return new Date(Date.UTC(y, nextMonth - 1, 30));
}

async function sendQuarterlyConfirmationReminders(env, opts = {}) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) {
    return { status: 'error', reason: 'firebase_not_configured' };
  }
  const now = new Date();
  const quarterKey = opts.quarterKey || getCurrentQuarterKeyKST(now);
  const deadline = getQuarterDeadlineDate(quarterKey);
  if (!opts.force && deadline && now > deadline) {
    return { status: 'skipped', reason: 'past_deadline', quarterKey, deadline: deadline.toISOString() };
  }

  // 분기정산 집계 + 확인 상태 + webhook 조회
  const [perResp, confResp, hookResp] = await Promise.all([
    fetch(`${env.FIREBASE_DB_URL}/quarterlySettlements/${quarterKey}/perAssignee.json?auth=${env.FIREBASE_DB_SECRET}`),
    fetch(`${env.FIREBASE_DB_URL}/quarterConfirmations/${quarterKey}.json?auth=${env.FIREBASE_DB_SECRET}`),
    fetch(`${env.FIREBASE_DB_URL}/config/jandi/users.json?auth=${env.FIREBASE_DB_SECRET}`),
  ]);
  const perAssignee = (await perResp.json()) || {};
  const confirmations = (await confResp.json()) || {};
  const hooks = (await hookResp.json()) || {};

  const deadlineLabel = deadline ? `${deadline.getUTCFullYear()}-${String(deadline.getUTCMonth() + 1).padStart(2, '0')}-${String(deadline.getUTCDate()).padStart(2, '0')}` : '-';
  const results = { sent: 0, skippedConfirmed: 0, skippedNoHook: 0, failed: 0, quarterKey, deadline: deadlineLabel, attempts: [] };

  // 리마인더 제외 대상 (사용자 요청)
  const REMINDER_EXCLUDED = ['조현식'];
  // 입력/확인 페이지 — 알림 클릭 시 바로 진입
  const HOMEPAGE_URL = env.HOMEPAGE_URL || 'https://schedules-cip.pages.dev';

  for (const [name, agg] of Object.entries(perAssignee)) {
    if (!agg || (agg.totalCount || 0) === 0) continue;
    if (REMINDER_EXCLUDED.includes(name)) { results.attempts.push(`${name}: 리마인더 제외 대상 (스킵)`); continue; }
    const conf = confirmations[name] || {};
    if (conf.confirmed === true) { results.skippedConfirmed++; results.attempts.push(`${name}: 확인완료 (스킵)`); continue; }
    const hook = hooks[name];
    if (!hook?.url || hook.enabled === false) { results.skippedNoHook++; results.attempts.push(`${name}: webhook 미등록`); continue; }

    const amountStr = (agg.estimatedAmount || 0).toLocaleString('ko-KR') + '원';
    const firstDate = conf.firstNotifiedAt ? conf.firstNotifiedAt.slice(0, 10) : '-';
    const r = await notifyJandiToUrl(hook.url, {
      body: `🔔 [${quarterKey} 실적 확인 리마인드]`,
      connectColor: '#f59e0b',
      connectInfo: [{
        title: `${name}님 — 아직 확인 전입니다 (마감 ${deadlineLabel})`,
        description: [
          `본인 ${quarterKey} 실적:`,
          `  ${agg.totalCount}건 · 예상 ${amountStr}`,
          `  승 ${agg.winCount || 0} / 무 ${agg.drawCount || 0} / 지원 ${agg.supportCount || 0}${agg.supervisionCount ? ` / 감리 ${agg.supervisionCount}` : ''}`,
          agg.reviewCount > 0 ? `  ⚠ 검토필요: ${agg.reviewCount}건` : '',
          '',
          '👉 입력하기 / 확인하기 :',
          HOMEPAGE_URL,
          '',
          '마이페이지에서 "이상없음·확인완료" 또는 "검증/수정 요청" 처리 부탁드립니다.',
          firstDate !== '-' ? `처음 알림: ${firstDate}` : '',
        ].filter(Boolean).join('\n'),
      }],
    });
    if (r.ok) {
      results.sent++;
      results.attempts.push(`${name}: ✅ 발송`);
      // 발송 이력 업데이트
      try {
        await fetch(`${env.FIREBASE_DB_URL}/quarterConfirmations/${quarterKey}/${encodeURIComponent(name)}.json?auth=${env.FIREBASE_DB_SECRET}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastNotifiedAt: now.toISOString(), notificationCount: (conf.notificationCount || 0) + 1 }),
        });
      } catch {}
    } else {
      results.failed++;
      results.attempts.push(`${name}: ❌ ${r.reason}`);
    }
  }

  return { status: 'ok', ...results };
}

// =================================================================
// 김유림 발송 준비 상태 체크 (매일 09/17 KST)
// =================================================================
// 활동 담당자 전원 finalConfirmed → admin 채널에 "김유림 발송 가능" 알림
// 중복 발송 방지: quarterReportReadiness/{qKey}/notifiedAdmin 체크
async function checkQuarterReportReadiness(env, opts = {}) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) {
    return { status: 'error', reason: 'firebase_not_configured' };
  }
  const now = new Date();
  const quarterKey = opts.quarterKey || getCurrentQuarterKeyKST(now);

  const [perResp, confResp, readyResp] = await Promise.all([
    fetch(`${env.FIREBASE_DB_URL}/quarterlySettlements/${quarterKey}/perAssignee.json?auth=${env.FIREBASE_DB_SECRET}`),
    fetch(`${env.FIREBASE_DB_URL}/quarterConfirmations/${quarterKey}.json?auth=${env.FIREBASE_DB_SECRET}`),
    fetch(`${env.FIREBASE_DB_URL}/quarterReportReadiness/${quarterKey}.json?auth=${env.FIREBASE_DB_SECRET}`),
  ]);
  const perAssignee = (await perResp.json()) || {};
  const confirmations = (await confResp.json()) || {};
  const readiness = (await readyResp.json()) || {};

  // 활동 담당자만 추려서 체크
  const activeAssignees = Object.values(perAssignee).filter(a => (a?.totalCount || 0) > 0).map(a => a.assignee);
  if (activeAssignees.length === 0) {
    return { status: 'skipped', reason: 'no_active_assignees', quarterKey };
  }
  const finalConfirmed = activeAssignees.filter(n => confirmations[n]?.finalConfirmed === true);
  const missing = activeAssignees.filter(n => !confirmations[n]?.finalConfirmed);
  const allConfirmed = missing.length === 0;
  if (!allConfirmed) {
    return { status: 'not_ready', quarterKey, finalConfirmed: finalConfirmed.length, total: activeAssignees.length, missing };
  }
  // 중복 방지
  if (readiness.notifiedAdmin && !opts.force) {
    return { status: 'already_notified', quarterKey, notifiedAt: readiness.notifiedAdminAt };
  }

  // 총합 계산
  const totals = Object.values(perAssignee).reduce((t, a) => {
    if ((a?.totalCount || 0) > 0) {
      t.totalCount += a.totalCount;
      t.totalEstimated += (a.estimatedAmount || 0);
    }
    return t;
  }, { totalCount: 0, totalEstimated: 0 });

  // admin 잔디 알림
  const msg = {
    body: `🎯 [${quarterKey} 분기보고서 발송 준비 완료]`,
    connectColor: '#7c3aed',
    connectInfo: [{
      title: `담당자 ${activeAssignees.length}명 전원 최종 확정 완료 — 김유림 발송 가능`,
      description: [
        `집계: ${totals.totalCount}건 · 예상 ${totals.totalEstimated.toLocaleString('ko-KR')}원`,
        '',
        '👉 시스템 상단 [📊 분기보고서] 버튼으로 김유림(yurim@netformrnd.com) 발송 진행해주세요.',
        '',
        '※ 이 알림은 전원 최종 확정 완료 시 1회만 발송됩니다.',
      ].join('\n'),
    }],
  };
  const r = await notifyJandi(env, msg);

  // 중복 방지 마커 기록
  if (r.ok) {
    try {
      await fetch(`${env.FIREBASE_DB_URL}/quarterReportReadiness/${quarterKey}.json?auth=${env.FIREBASE_DB_SECRET}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifiedAdmin: true, notifiedAdminAt: now.toISOString() }),
      });
    } catch {}
  }

  return { status: 'ready', quarterKey, finalConfirmed: finalConfirmed.length, total: activeAssignees.length, totals, notifyOk: r.ok };
}
