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

// === 웹훅 호출 (no-cors fire-and-forget) ===
export async function sendJandiNotification(message) {
  if (!cachedEnabled || !cachedWebhookUrl) {
    console.log('[Jandi] skip (config not set)', message.body);
    return { ok: false, reason: 'config_missing' };
  }
  try {
    // mode: 'no-cors' — 응답 검증 불가, 보냄만 보장
    await fetch(cachedWebhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Accept': 'application/vnd.tosslab.jandi-v2+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    console.log('[Jandi] sent', message.body);
    return { ok: true };
  } catch (e) {
    console.warn('[Jandi] send failed', e);
    return { ok: false, reason: e.message };
  }
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
