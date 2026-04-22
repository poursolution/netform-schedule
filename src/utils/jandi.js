// 잔디(JANDI) Incoming Webhook 알림 유틸
// 사용처: PT 결과 "승" 입력 시 크로스체크 요청, 정산요청 발생 시 admin 알림 등
//
// 설정: Firebase 'config/jandiWebhookUrl' 노드에 URL 저장 (admin 설정 모달에서 입력)
// CORS: 잔디 incoming webhook은 일반적으로 CORS 헤더 없음 → mode:'no-cors'로 fire-and-forget
//        실패해도 시스템 동작에는 영향 없음

let cachedWebhookUrl = null;
let cachedEnabled = true;

// Firebase에서 URL 동기화 (App.jsx 초기화 시 호출)
export function setJandiConfig({ url, enabled = true }) {
  cachedWebhookUrl = url || null;
  cachedEnabled = !!enabled;
}

export function getJandiConfig() {
  return { url: cachedWebhookUrl, enabled: cachedEnabled };
}

// 잔디 메시지 색상 (잔디 권장)
const COLORS = {
  info: '#2563eb',
  success: '#16a34a',
  warn: '#f59e0b',
  danger: '#dc2626',
  purple: '#7c3aed',
};

// === 메시지 빌더 ===

// PT "승" 입력 → 크로스체크 요청 (admin이 K-APT 공고 확인 필요)
export function buildCrossCheckMessage({ assignee, siteName, bidNo, ptDate, by }) {
  return {
    body: '🔍 PT 크로스체크 요청',
    connectColor: COLORS.warn,
    connectInfo: [{
      title: `${siteName || '단지명 미입력'} — ${assignee} 담당`,
      description: [
        `결과: 승 (입력자: ${by || '-'})`,
        `진행일: ${ptDate || '-'}`,
        bidNo ? `공고번호: ${bidNo}` : `⚠️ 공고번호 미입력 — K-APT 직접 확인 필요`,
        '',
        '👉 K-APT 입찰결과 페이지에서 우리 회사 낙찰 여부 확인 후 정산 승인 부탁드립니다.',
      ].join('\n'),
    }],
  };
}

// 정산요청 발생 → admin 확인 요청
export function buildSettlementRequestMessage({ assignee, siteName, bidNo, result, amount, by }) {
  return {
    body: '💰 PT 정산요청',
    connectColor: COLORS.info,
    connectInfo: [{
      title: `${siteName || '단지명 미입력'} — ${assignee} 담당`,
      description: [
        `결과: ${result} · 정산금액: ${(amount || 0).toLocaleString()}원`,
        bidNo ? `공고번호: ${bidNo}` : '⚠️ 공고번호 미입력',
        `요청자: ${by || '-'}`,
        '',
        '👉 시스템에서 검토 후 정산완료 처리 부탁드립니다.',
      ].join('\n'),
    }],
  };
}

// 분기 마감 임박 알림 (D-7 등)
export function buildQuarterDeadlineMessage({ year, quarter, daysLeft, deadline }) {
  return {
    body: `⏰ ${year}년 ${quarter}분기 PT 결과 입력 마감 D-${daysLeft}`,
    connectColor: daysLeft <= 3 ? COLORS.danger : COLORS.warn,
    connectInfo: [{
      title: `정산 발송 예정: ${deadline}`,
      description: [
        `이번 분기 PT 결과를 분기 마지막 날(예: 3/31)까지 입력해주세요.`,
        `분기말까지 입력된 건만 다음달 마지막 주 월요일에 정산 발송됩니다.`,
        '',
        '대상: 황윤선 · 이필선 · 한준엽 · 한인규 · 조재연 · 정정훈 · 김성민',
      ].join('\n'),
    }],
  };
}

// 분기 보고서 김유림 발송 완료
export function buildReportSentMessage({ year, quarter, summary }) {
  return {
    body: `✅ ${year}년 ${quarter}분기 보고서 김유림 발송 완료`,
    connectColor: COLORS.success,
    connectInfo: [{
      title: `수신: 김유림 (yurim@netformrnd.com)`,
      description: summary || '보고서 발송이 완료되었습니다.',
    }],
  };
}

// === 웹훅 호출 (no-cors fire-and-forget) + 실패 큐 재시도 ===
//
// no-cors 모드이므로 HTTP 응답 검증 불가.
// fetch 자체가 throw 하는 경우(네트워크 오프라인·CSP 차단 등)만 실패로 감지 가능.
// 그런 경우 localStorage 큐에 저장 → 다음 호출 또는 flushJandiQueue() 호출 시 재시도.
const QUEUE_KEY = 'jandi_retry_queue_v1';
const MAX_QUEUE_SIZE = 50;
const MAX_ATTEMPTS = 3;

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE_SIZE)));
  } catch {}
}

function enqueueFailed(message, reason) {
  const q = loadQueue();
  q.push({ message, reason, attempts: 1, ts: Date.now() });
  saveQueue(q);
  console.warn('[Jandi] queued for retry', message.body, 'queue size=', q.length);
}

async function trySend(message) {
  await fetch(cachedWebhookUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Accept': 'application/vnd.tosslab.jandi-v2+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}

export async function sendJandiNotification(message) {
  if (!cachedEnabled || !cachedWebhookUrl) {
    console.log('[Jandi] skip (config not set)', message.body);
    return { ok: false, reason: 'config_missing' };
  }
  try {
    await trySend(message);
    console.log('[Jandi] sent', message.body);
    // 성공 → 큐 flush 시도 (뒷건들도 빠르게 처리)
    queueMicrotask(() => flushJandiQueue().catch(() => {}));
    return { ok: true };
  } catch (e) {
    console.warn('[Jandi] send failed — enqueue for retry', e);
    enqueueFailed(message, e.message || 'send_failed');
    return { ok: false, reason: e.message || 'send_failed', queued: true };
  }
}

// 실패 큐 flush — app 초기화 시 또는 다음 송신 성공 시 호출.
// 각 항목 최대 MAX_ATTEMPTS 회까지 재시도 후 drop.
export async function flushJandiQueue() {
  if (!cachedEnabled || !cachedWebhookUrl) return { flushed: 0, dropped: 0 };
  const q = loadQueue();
  if (q.length === 0) return { flushed: 0, dropped: 0 };
  const remaining = [];
  let flushed = 0, dropped = 0;
  for (const entry of q) {
    try {
      await trySend(entry.message);
      flushed++;
    } catch (e) {
      entry.attempts = (entry.attempts || 1) + 1;
      if (entry.attempts >= MAX_ATTEMPTS) {
        console.warn('[Jandi] drop after', entry.attempts, 'attempts:', entry.message?.body);
        dropped++;
      } else {
        remaining.push(entry);
      }
    }
  }
  saveQueue(remaining);
  if (flushed || dropped) console.log('[Jandi] queue flush', { flushed, dropped, remaining: remaining.length });
  return { flushed, dropped, remaining: remaining.length };
}

// 편의 헬퍼들
export function notifyCrossCheck(args) {
  return sendJandiNotification(buildCrossCheckMessage(args));
}
export function notifySettlementRequest(args) {
  return sendJandiNotification(buildSettlementRequestMessage(args));
}
export function notifyQuarterDeadline(args) {
  return sendJandiNotification(buildQuarterDeadlineMessage(args));
}
export function notifyReportSent(args) {
  return sendJandiNotification(buildReportSentMessage(args));
}
