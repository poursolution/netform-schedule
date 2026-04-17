// PT 결과 예외 신청 워크플로우
// - tie_to_win: 입찰 결과는 무승부지만 영업적 조건으로 승리 인정 신청
// - no_bid_to_win: 공고문이 없는 현장(교회·일반건물 등)에 대해 승리 인정 신청
// 흐름: 담당자 신청 → admin 승인 → result='승' 자동 변경 + 정산 인정

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
export function buildExceptionResultMessage({ assignee, siteName, type, status, reviewedBy, reviewNote }) {
  const typeMeta = EXCEPTION_TYPES[type] || { label: type };
  const isApproved = status === 'approved';
  return {
    body: isApproved ? '✅ PT 예외 승인됨 — 승리 처리' : '❌ PT 예외 거절됨',
    connectColor: isApproved ? '#16a34a' : '#dc2626',
    connectInfo: [{
      title: `[${typeMeta.label}] ${siteName || '단지명 미입력'} — ${assignee} 담당`,
      description: [
        `결정: ${isApproved ? '승인 (정산 대상에 포함)' : '거절 (기존 결과 유지)'}`,
        `검토자: ${reviewedBy || '-'}`,
        '',
        `검토 사유:`,
        reviewNote || '(없음)',
      ].join('\n'),
    }],
  };
}
