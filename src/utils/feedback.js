// 파일럿 피드백(#12a) — 화면 전용 파생값. 저장 구조는 기존 feedback/{id} 그대로.

export const FEEDBACK_KINDS = ['버그', '제안', '헷갈려요'];

// 상태: 새로 들어옴(open·없음) / 처리 중(in_progress) / 완료(resolved)
export function feedbackStatus(f) {
  if (f?.status === 'resolved') return 'done';
  if (f?.status === 'in_progress') return 'doing';
  return 'new';
}

const VIEW_LABEL = { dashboard: '메인', performance: '실적', mypage: '마이페이지', meeting: '영업회의', other: '일정' };
const MODAL_LABEL = { 'kapt-verify': 'K-APT 확인', 'quarterly-settlement': '분기정산', 'quarter-report': '분기 보고서', analysis: '분석 리포트', 'activity-log': '활동 로그', uat: 'UAT' };

export function feedbackScreen(ctx) {
  if (!ctx) return '';
  if (ctx.screen) return ctx.screen;
  const v = VIEW_LABEL[ctx.activeView] || ctx.activeView || '';
  const m = ctx.activeModal ? (MODAL_LABEL[ctx.activeModal] || ctx.activeModal) : '';
  return [v, m].filter(Boolean).join(' › ');
}

export function feedbackDevice(ua) {
  const s = String(ua || '');
  if (!s) return '';
  const os = /iPhone|iPad/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'Mac' : '';
  const br = /SamsungBrowser/.test(s) ? '삼성 인터넷' : /Edg\//.test(s) ? 'Edge' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ');
}

export function feedbackCounts(list) {
  const c = { new: 0, doing: 0, done: 0, all: (list || []).length };
  (list || []).forEach(f => { c[feedbackStatus(f)] += 1; });
  return c;
}
