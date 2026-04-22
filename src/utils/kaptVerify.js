// K-APT 자동 검증 (Cloudflare Worker 호출)
// 사용 시나리오: PT 결과 "승" 입력 시 → Worker가 data.go.kr API로 K-APT 입찰결과 조회
//   → 우리 회사 낙찰 확인 시 통과 / 못 찾으면 잔디 알림 ("확인 바람")
//
// Worker URL은 Firebase 'config/kaptWorker'에 저장 (admin 모달에서 입력)
// Worker 미배포 상태에서도 fallback으로 클라이언트가 직접 잔디 알림 호출

import { sendJandiNotification, buildCrossCheckMessage } from './jandi.js';
import { BRAND_TOKENS } from './apartmentMatch.js';

// siteName 에서 브랜드 토큰 기반 변형 이름 생성
//   예: "남악경남아너스빌" → ["남악경남아너스빌", "경남아너스빌"]
//   예: "세마역트루엘더퍼스트" → ["세마역트루엘더퍼스트"] (트루엘 미포함 브랜드면 원본만)
// 브랜드 앞 접두어(지역/역명)가 있을 때 해당 브랜드부터 끝까지를 추가 변형으로 반환.
function buildSiteNameVariants(siteName) {
  const variants = [siteName];
  if (!siteName) return variants;
  const norm = siteName.replace(/\s+/g, '');
  // 길이순 정렬 (긴 브랜드 우선 매칭)
  const sortedBrands = [...BRAND_TOKENS].sort((a, b) => b.length - a.length);
  for (const brand of sortedBrands) {
    const brandNorm = brand.replace(/\s+/g, '');
    const idx = norm.indexOf(brandNorm);
    if (idx > 0) {
      // 브랜드 앞에 1자 이상 있으면 접두어가 있는 것 — 변형 추가
      const stripped = norm.slice(idx);
      if (!variants.includes(stripped)) variants.push(stripped);
      break;  // 첫 매칭만 사용
    }
  }
  return variants;
}

let cachedWorkerUrl = null;
let cachedEnabled = true;

export function setKaptVerifyConfig({ workerUrl, enabled = true }) {
  cachedWorkerUrl = workerUrl || null;
  cachedEnabled = !!enabled;
}

export function getKaptVerifyConfig() {
  return { workerUrl: cachedWorkerUrl, enabled: cachedEnabled };
}

// 메인 진입점: PT 승리 결과 입력 시 호출
// args: { scheduleId, assignee, siteName, workType, bidNo, ptDate, by }
// 반환: Promise<{ status: 'verified'|'needs_review'|'skipped', message?, raw? }>
export async function verifyKaptForPt(args) {
  if (!cachedEnabled) {
    return { status: 'skipped', reason: 'disabled' };
  }

  // Worker URL이 있으면 → Worker 호출 (서버 측에서 data.go.kr 조회 + 잔디 알림)
  if (cachedWorkerUrl) {
    try {
      const resp = await fetch(`${cachedWorkerUrl.replace(/\/$/, '')}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!resp.ok) throw new Error(`Worker HTTP ${resp.status}`);
      const data = await resp.json();
      console.log('[KAPT] verify result', data);
      return data;
    } catch (e) {
      console.warn('[KAPT] worker call failed, fallback to direct jandi', e);
      // Worker 호출 실패 시 fallback
      await sendDirectJandiCrossCheck(args, 'Worker 호출 실패: ' + e.message);
      return { status: 'needs_review', reason: 'worker_failed', error: e.message };
    }
  }

  // Worker 미배포 상태 → 클라이언트가 직접 잔디 알림 (mode:no-cors)
  await sendDirectJandiCrossCheck(args, 'K-APT 자동 검증 미가동 — 수동 확인 필요');
  return { status: 'needs_review', reason: 'worker_not_configured' };
}

// K-APT 후보 검색 — 모달 자동 추천용.
// siteName 으로 Firebase 에 수집된 bids 중 유사한 공고 top 5 반환.
// Worker 미설정·미배포 시에는 빈 배열 반환 (→ 수동 입력 flow fallback)
//
// [개선] 지역 prefix 변형 자동 시도:
//   "남악경남아너스빌" 입력 시 원본 외에 "경남아너스빌" 버전도 병렬로 검색.
//   Worker 가 이름 정확 매칭 방식이라 지역 prefix 차이로 bid_not_found 나는 케이스 대응.
//   결과는 bidNum 기준 dedupe 후 score 내림차순 정렬.
export async function searchKaptCandidates({ siteName, ptDate, aliasMap } = {}) {
  if (!cachedEnabled) return { candidates: [], reason: 'disabled' };
  if (!cachedWorkerUrl) return { candidates: [], reason: 'worker_not_configured' };
  if (!siteName) return { candidates: [], reason: 'empty_siteName' };

  const variants = buildSiteNameVariants(siteName);
  const endpoint = `${cachedWorkerUrl.replace(/\/$/, '')}/search-candidates`;

  // 변형별 병렬 호출
  const requests = variants.map(v =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteName: v, ptDate: ptDate || null, aliasMap: aliasMap || null }),
    })
      .then(r => r.ok ? r.json() : { candidates: [], reason: `http_${r.status}` })
      .catch(e => ({ candidates: [], reason: 'network', error: e.message }))
  );

  try {
    const results = await Promise.all(requests);
    // 병합 + bidNum 기준 dedupe (가장 높은 score 유지)
    const merged = new Map();
    let lastReason = null;
    for (const r of results) {
      lastReason = r?.reason || lastReason;
      const list = Array.isArray(r?.candidates) ? r.candidates : [];
      for (const c of list) {
        if (!c?.bidNum) continue;
        const existing = merged.get(c.bidNum);
        if (!existing || (c.score ?? 0) > (existing.score ?? 0)) {
          merged.set(c.bidNum, c);
        }
      }
    }
    const candidates = Array.from(merged.values())
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10);  // 상위 10개
    return {
      candidates,
      reason: candidates.length > 0 ? null : lastReason,
      variantsSearched: variants,
    };
  } catch (e) {
    console.warn('[KAPT] searchCandidates failed', e);
    return { candidates: [], reason: 'network', error: e.message };
  }
}

async function sendDirectJandiCrossCheck(args, extraNote) {
  const msg = buildCrossCheckMessage({
    assignee: args.assignee,
    siteName: args.siteName,
    bidNo: args.bidNo,
    ptDate: args.ptDate,
    by: args.by,
  });
  // 추가 안내문 첨부
  if (extraNote && msg.connectInfo && msg.connectInfo[0]) {
    msg.connectInfo[0].description += `\n\n[참고] ${extraNote}`;
  }
  await sendJandiNotification(msg);
}
