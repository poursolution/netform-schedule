// PT 결과 예외 신청 워크플로우
// - tie_to_win: 입찰 결과는 무승부지만 영업적 조건으로 승리 인정 신청
// - no_bid_to_win: 공고문이 없는 현장(교회·일반건물 등)에 대해 승리 인정 신청
// 흐름: 담당자 신청 → admin 승인 → 결과 '승'으로 계산(settlement.js isWinExceptionApproved) + 정산 대상 전환
import { calculateSettlementAmount, SETTLEMENT_STATUS } from './settlement.js';

export const EXCEPTION_TYPES = {
  tie_to_win: {
    label: '영업적 승리',
    description: '입찰은 무승부였으나 영업적 조건으로 승리 인정',
    badge: { bg: '#fef3c7', text: '#92400e' },
  },
  no_bid_to_win: {
    label: '공고문 없는 현장',
    description: '공고가 K-APT에 등록되지 않은 현장 (교회·일반건물 등)',
    badge: { bg: '#e0e7ff', text: '#4338ca' },
  },
};

export const EXCEPTION_STATUSES = {
  pending: { label: '승인대기', bg: '#fef3c7', text: '#92400e' },
  approved: { label: '승인완료', bg: '#dcfce7', text: '#16a34a' },
  rejected: { label: '거절', bg: '#fee2e2', text: '#dc2626' },
};

// 신규 예외 신청 객체 생성
export function createExceptionRequest({ type, reason, requestedBy }) {
  return {
    type,
    reason: (reason || '').trim(),
    requestedBy: requestedBy || '',
    requestedAt: new Date().toISOString(),
    status: 'pending',
    reviewedBy: '',
    reviewedAt: '',
    reviewNote: '',
  };
}

// 승인 처리 (관리자)
export function approveException(req, { reviewedBy, reviewNote = '' }) {
  return {
    ...req,
    status: 'approved',
    reviewedBy,
    reviewedAt: new Date().toISOString(),
    reviewNote: reviewNote.trim(),
  };
}

// 거절 처리 (관리자)
export function rejectException(req, { reviewedBy, reviewNote = '' }) {
  return {
    ...req,
    status: 'rejected',
    reviewedBy,
    reviewedAt: new Date().toISOString(),
    reviewNote: reviewNote.trim(),
  };
}

// PT의 담당자가 승인된 예외를 가지고 있으면 → 정산 시 승리로 인정
export function isExceptionApproved(schedule, assignee) {
  const req = schedule?.exceptionRequests?.[assignee];
  return req && req.status === 'approved';
}

// 효과적 결과 (예외 승인 반영) — 보고서/정산 집계 시 사용
//   기존 result 그대로 + 예외 승인 시 '승'으로 오버라이드
export function getEffectiveResult(schedule, assignee, rawResult) {
  if (isExceptionApproved(schedule, assignee)) return '승';
  return rawResult;
}

// 전체 PT 리스트에서 pending 예외 추출 (admin 큐용)
export function listPendingExceptions(ptSchedules) {
  const pending = [];
  ptSchedules.forEach(s => {
    const reqs = s.exceptionRequests || {};
    Object.entries(reqs).forEach(([assignee, req]) => {
      if (req.status === 'pending') {
        pending.push({
          scheduleId: s.id,
          siteName: s.siteName || '',
          bidNo: s.bidNo || '',
          ptDate: s.date || '',
          announcementMethods: s.announcementMethods || '',
          assignee,
          ...req,
        });
      }
    });
  });
  // 신청일 오름차순 (오래된 것 먼저 처리)
  pending.sort((a, b) => (a.requestedAt || '').localeCompare(b.requestedAt || ''));
  return pending;
}

// 예외 승인 큐(#11a) — 신청 후 지난 날수
export function exceptionWaitDays(requestedAt, now = new Date()) {
  if (!requestedAt) return 0;
  const d = new Date(requestedAt);
  if (isNaN(d)) return 0;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

export const exceptionKey = item => `${item.scheduleId}_${item.assignee}`;

// 승인하면 받게 될 금액 — 승 규칙 그대로(단독 50만 · 여러 명 PT 25만 · 본인영업/취소공고 등은 0)
export function approvedWinAmount(pt, assignee) {
  if (!pt) return 0;
  const sim = { ...pt, exceptionRequests: { ...(pt.exceptionRequests || {}), [assignee]: { ...(pt.exceptionRequests?.[assignee] || {}), status: 'approved' } } };
  return calculateSettlementAmount(sim, assignee).amount;
}

/**
 * #11a 승인·거절 저장 — pt 노드 기준 상대 경로 { 'exceptionRequests/김성민': {...}, 'settlement/김성민/..': v }
 *  승인: 예외 상태 + 정산 대상 전환(requested) + 관리자 확인(manualVerified) + 금액 캐시.
 *        이미 확정·지급된 건은 정산 상태를 건드리지 않음(지급 이력 보존).
 *  undo: 같은 경로를 처리 전 값으로 되돌리는 patch.
 */
export function buildExceptionDecisionPatch(pt, assignee, status, { reviewedBy, reviewNote = '', at = new Date().toISOString() } = {}) {
  const req = pt?.exceptionRequests?.[assignee] || {};
  const nextReq = status === 'approved' ? approveException(req, { reviewedBy, reviewNote }) : rejectException(req, { reviewedBy, reviewNote });
  nextReq.reviewedAt = at;
  const patch = { [`exceptionRequests/${assignee}`]: nextReq };
  const undo = { [`exceptionRequests/${assignee}`]: req };
  if (status !== 'approved') return { patch, undo };

  const stl = pt?.settlement?.[assignee] || {};
  const paid = stl.completed || stl.confirmed || stl.status === SETTLEMENT_STATUS.COMPLETED || stl.status === SETTLEMENT_STATUS.CONFIRMED;
  const amount = approvedWinAmount(pt, assignee);
  const fields = {
    manualVerified: true,
    reviewBypassedBy: reviewedBy || 'admin',
    reviewBypassedAt: at,
    ...(paid ? {} : { calculatedAmount: amount }),
    ...(paid || stl.requested ? {} : { requested: true, requestedAt: at, requestedBy: 'exception-approved', status: SETTLEMENT_STATUS.REQUESTED }),
  };
  Object.entries(fields).forEach(([f, v]) => {
    patch[`settlement/${assignee}/${f}`] = v;
    undo[`settlement/${assignee}/${f}`] = stl[f] === undefined ? null : stl[f];
  });
  return { patch, undo };
}

// #11a 처리 요약 — decisions: { key: 'ok'|'no' }, deltaOf(item) → 승인 시 정산 증가액
export function exceptionSummary(items, decisions, deltaOf = () => 0) {
  const ok = items.filter(it => decisions[exceptionKey(it)] === 'ok');
  const no = items.filter(it => decisions[exceptionKey(it)] === 'no');
  return {
    pending: items.length - ok.length - no.length,
    ok: ok.length,
    no: no.length,
    amount: ok.reduce((sum, it) => sum + (deltaOf(it) || 0), 0),
  };
}

// 잔디 메시지 빌더 (admin 알림 — 신규 신청 발생)
export function buildExceptionRequestMessage({ assignee, siteName, type, reason, by }) {
  const typeMeta = EXCEPTION_TYPES[type] || { label: type };
  return {
    body: '⚠️ PT 예외 신청 — admin 승인 필요',
    connectColor: '#f59e0b',
    connectInfo: [{
      title: `[${typeMeta.label}] ${siteName || '단지명 미입력'} — ${assignee} 담당`,
      description: [
        `신청 사유:`,
        reason || '(사유 미입력)',
        '',
        `신청자: ${by || assignee}`,
        '',
        '👉 시스템에서 검토 후 승인/거절 부탁드립니다 (📋 예외 N건 버튼).',
      ].join('\n'),
    }],
  };
}

// 잔디 메시지 빌더 (담당자 알림 — 승인/거절 결과)
export function buildExceptionResultMessage({ assignee, siteName, type, status, reviewedBy, reviewNote, amount }) {
  const typeMeta = EXCEPTION_TYPES[type] || { label: type };
  const isApproved = status === 'approved';
  const amt = typeof amount === 'number' ? ` · ${amount.toLocaleString('ko-KR')}원` : '';
  return {
    body: isApproved ? '✅ PT 예외 승인됨 — 승리 처리' : '❌ PT 예외 거절됨',
    connectColor: isApproved ? '#16a34a' : '#dc2626',
    connectInfo: [{
      title: `[${typeMeta.label}] ${siteName || '단지명 미입력'} — ${assignee} 담당`,
      description: [
        `결정: ${isApproved ? `승인 — 결과 승으로 정산 대상에 포함${amt}` : '거절 (기존 결과 유지)'}`,
        `검토자: ${reviewedBy || '-'}`,
        '',
        `검토 사유:`,
        reviewNote || '(없음)',
      ].join('\n'),
    }],
  };
}
