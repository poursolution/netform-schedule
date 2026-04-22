// K-APT 자동 검증 (Cloudflare Worker 호출)
// 사용 시나리오: PT 결과 "승" 입력 시 → Worker가 data.go.kr API로 K-APT 입찰결과 조회
//   → 우리 회사 낙찰 확인 시 통과 / 못 찾으면 잔디 알림 ("확인 바람")
//
// Worker URL은 Firebase 'config/kaptWorker'에 저장 (admin 모달에서 입력)
// Worker 미배포 상태에서도 fallback으로 클라이언트가 직접 잔디 알림 호출

import { sendJandiNotification, buildCrossCheckMessage } from './jandi.js';

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
export async function searchKaptCandidates({ siteName, ptDate } = {}) {
  if (!cachedEnabled) return { candidates: [], reason: 'disabled' };
  if (!cachedWorkerUrl) return { candidates: [], reason: 'worker_not_configured' };
  if (!siteName) return { candidates: [], reason: 'empty_siteName' };
  try {
    const resp = await fetch(`${cachedWorkerUrl.replace(/\/$/, '')}/search-candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteName, ptDate: ptDate || null }),
    });
    if (!resp.ok) return { candidates: [], reason: `http_${resp.status}` };
    const data = await resp.json();
    return { candidates: Array.isArray(data?.candidates) ? data.candidates : [], reason: data?.reason || null };
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
