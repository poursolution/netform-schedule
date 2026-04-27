// 정산 상태 공용 util (P3 + P4)
// 기존 settlement.requested / settlement.completed 만으로는 운영이 어려워
// 6단계 상태 모델로 확장. 기존 데이터와 호환되도록 derive 함수가 양쪽 해석.
//
// 상태 단계:
//   unsettled      - 미정산 (기본값 — 결과는 있으나 아직 정산 요청 안 됨)
//   needs_review   - 검토필요 (K-APT 미매칭 등 — 관리자 검토)
//   requested      - 정산요청 (담당자가 요청 제출)
//   confirmed      - 정산확정 (관리자가 지급 확정)
//   completed      - 정산완료 (지급 완료)
//   excluded       - 제외 (본인PT / 본인영업 / 주담 패배로 지원 제외 등)
//
// 중요 규칙:
//  - K-APT 미매칭 = 패배 아님 → needs_review 로
//  - 지원자는 주담 결과에 종속 (승/무 → 지원, 패 → 패/excluded)
//  - 패배는 정산 대상 제외 (금액 0)

import { getMainAssignee } from './apartmentMatch.js';

export const SETTLEMENT_STATUS = {
  UNSETTLED: 'unsettled',
  NEEDS_REVIEW: 'needs_review',
  REQUESTED: 'requested',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  EXCLUDED: 'excluded',
  SUPERSEDED: 'superseded',  // 동일 단지/공종 최신 PT로 단일화 — 정산 대상 아님
};

export const EXCLUSION_REASONS = {
  SELF_PT: 'self_pt',                   // 본인PT
  SELF_SALES: 'self_sales',             // 본인영업
  VENDOR_SELF_PT: 'vendor_self_pt',     // 협약사자체PT
  MAIN_LOST: 'main_lost',               // 주담 패배로 지원자 제외
  DRAW_SUPPORT_EXCLUDED: 'draw_support_excluded',  // 주담 무승부 → 지원자 관리자예외승인 필요
  LOSS: 'loss',                         // 결과가 패배
  CANCELLED_NOTICE: 'cancelled_notice', // K-APT 취소공고 (공고 올라왔지만 발주처 취소) — 재공고 대기
  SUPERSEDED: 'superseded',             // 동일 단지/공종 최신 PT 로 단일화 — 정산 대상 아님
};

// ===== 금액 테이블 =====

export const SETTLEMENT_AMOUNTS = {
  WIN: 500000,
  DRAW: 250000,
  SUPPORT: 250000,
  SUPERVISION: 80000,  // 감리 건당
  LOSS: 0,
  EXCLUDED: 0,
};

// ===== 결과 파생 =====

/**
 * 참여자별 실제 결과 파생 (지원 규칙 포함)
 *  - 지원자인데 주담 '패' → '패' (제외 대상)
 *  - 지원자인데 주담 '무' → '제외' (관리자 예외승인 있을 때만 '지원' 인정)
 *  - 지원자인데 주담 '승' → '지원'
 *  - 주담당자 본인은 results[주담] 그대로
 */
export function deriveAssigneeResult(pt, assignee, opts = {}) {
  if (!pt || !assignee) return null;
  const exceptionApproved = !!opts.exceptionApproved;

  // 감리 건 판별 — 감리는 승패 무관 건당 80k
  const isSupervisionPt = /감리/.test((pt.workType || '') + '|' + (pt.siteName || ''));

  // raw 결과 추출
  let raw = null;
  if (pt.results && pt.results[assignee] !== undefined) raw = pt.results[assignee];
  else {
    const tokens = (pt.ptAssignee || '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean);
    if (tokens.length <= 1) raw = pt.result || null;
  }
  if (!raw) return null;

  // 지원자 규칙 — 주담 결과에 종속
  const main = getMainAssignee(pt);
  if (raw === '지원' && main && assignee !== main) {
    const mainResult = pt.results?.[main] || pt.result;
    if (mainResult === '승') return '지원';
    if (mainResult === '무') return exceptionApproved ? '지원' : '제외';
    if (mainResult === '패') return '패';
    if (mainResult === '지원') return '지원';  // 주담·지원자 모두 지원 → 둘 다 250K (동등 지원)
    return null;
  }

  return raw;
}

// ===== 금액 계산 =====

/**
 * 참여자별 정산 금액 계산.
 *  반환: { amount, reason: EXCLUSION_REASONS | null, result: '승'|'무'|'패'|'지원'|'제외'|null }
 */
export function calculateSettlementAmount(pt, assignee, opts = {}) {
  if (!pt || !assignee) return { amount: 0, reason: null, result: null };

  // 1) 본인PT / 협약사자체PT 체크
  if (pt.selfPT) {
    return { amount: 0, reason: EXCLUSION_REASONS.VENDOR_SELF_PT, result: '제외' };
  }

  // 2) 본인영업 (담당자별 selfSales 플래그)
  const stl = pt.settlement?.[assignee] || {};
  if (stl.selfSales) {
    return { amount: 0, reason: EXCLUSION_REASONS.SELF_SALES, result: '제외' };
  }

  // 2.3) Superseded — 동일 단지/공종 최신 PT 로 단일화된 PT 는 정산 대상 아님
  //      금액 0원 + 제외 사유 = SUPERSEDED. 분기 보고서·UI 합계에서 자동 제외됨.
  if (stl.superseded === true || stl.supersededBy) {
    return { amount: 0, reason: EXCLUSION_REASONS.SUPERSEDED, result: '제외' };
  }

  // 2.5) K-APT 취소공고 — 공고 있었으나 발주처 취소 → 정산 제외 (재공고 대기)
  if (pt.kaptVerified?.status === 'cancelled') {
    return { amount: 0, reason: EXCLUSION_REASONS.CANCELLED_NOTICE, result: '제외' };
  }

  // 3) 감리 건 — 결과 무관 건당 80k
  //    ※ selfPT/selfSales 는 위에서 이미 제외됨. 이 시점에 감리면 결과 입력 여부와 무관하게 80K 지급.
  //    스펙: "감리 공종 - 건당 80,000원 (지역/결과 무관)"
  const isSupervision = /감리/.test((pt.workType || '') + '|' + (pt.siteName || ''));
  if (isSupervision) {
    return { amount: SETTLEMENT_AMOUNTS.SUPERVISION, reason: null, result: '감리' };
  }

  // 4) 파생 결과 (감리 아닐 때만)
  const result = deriveAssigneeResult(pt, assignee, opts);
  if (!result) return { amount: 0, reason: null, result: null };

  if (result === '제외') {
    // 주담 무 + 지원자 예외승인 없음
    return { amount: 0, reason: EXCLUSION_REASONS.DRAW_SUPPORT_EXCLUDED, result: '제외' };
  }

  if (result === '패') {
    // 주담 또는 지원자 모두 '패' 면 정산 제외
    return { amount: 0, reason: EXCLUSION_REASONS.LOSS, result: '패' };
  }

  if (result === '승') return { amount: SETTLEMENT_AMOUNTS.WIN, reason: null, result };
  if (result === '무') return { amount: SETTLEMENT_AMOUNTS.DRAW, reason: null, result };
  if (result === '지원') return { amount: SETTLEMENT_AMOUNTS.SUPPORT, reason: null, result };

  return { amount: 0, reason: null, result };
}

// ===== 상태 파생 =====

/**
 * 참여자별 정산 상태 파생.
 *  기존 데이터(requested/completed flag) 와 새 상태 필드(status) 둘 다 해석.
 *  저장된 status 가 명시적으로 있으면 그것 사용, 없으면 flag 로 역산.
 */
export function getSettlementStatus(pt, assignee) {
  if (!pt || !assignee) return SETTLEMENT_STATUS.UNSETTLED;
  const stl = pt.settlement?.[assignee] || {};

  // [Superseded 우선] 동일 단지/공종 최신 PT 로 단일화된 건 — kaptVerified 등
  // 다른 신호와 무관하게 SUPERSEDED 로 확정. status 필드가 누락됐어도 superseded:true 면 인정.
  if (stl.superseded === true || stl.supersededBy) {
    return SETTLEMENT_STATUS.SUPERSEDED;
  }

  // [결과 미입력 가드] PT 결과(승/무/패/지원) 가 없는 상태에서는 settlement.status 가
  // 어떻게 박혀있든 정산 상태 배지를 띄우면 안 됨 (자동 K-APT 검증이 결과 입력 전에
  // status='needs_review'를 미리 박는 케이스 방지).
  const hasResult = !!(pt.results?.[assignee] || pt.result);
  if (!hasResult) return SETTLEMENT_STATUS.UNSETTLED;

  // 1) 명시적 status 필드 우선
  if (stl.status && Object.values(SETTLEMENT_STATUS).includes(stl.status)) {
    return stl.status;
  }

  // 2) 제외 케이스
  const calc = calculateSettlementAmount(pt, assignee);
  if (calc.reason) return SETTLEMENT_STATUS.EXCLUDED;

  // 3) 결과 없음 → 정산 대상 아님
  if (!calc.result) return SETTLEMENT_STATUS.UNSETTLED;

  // 4) 패배 → 제외 (정산 아님)
  if (calc.result === '패') return SETTLEMENT_STATUS.EXCLUDED;

  // 5) K-APT 검증 상태 — needs_review 이면 검토필요
  if (pt.kaptVerified?.status === 'needs_review' && !stl.reviewBypassedBy) {
    // 잔디 공고문이 있으면 검토 통과로 간주
    const hasJandiEvidence = pt.evidenceFiles && Object.keys(pt.evidenceFiles).length > 0;
    if (!hasJandiEvidence) return SETTLEMENT_STATUS.NEEDS_REVIEW;
  }

  // 6) 기존 flag 역산
  if (stl.completed) return SETTLEMENT_STATUS.COMPLETED;
  if (stl.confirmed) return SETTLEMENT_STATUS.CONFIRMED;
  if (stl.requested) return SETTLEMENT_STATUS.REQUESTED;

  return SETTLEMENT_STATUS.UNSETTLED;
}

/**
 * 제외 사유 조회 (상세 진단용)
 */
export function getSettlementExclusionReason(pt, assignee) {
  const calc = calculateSettlementAmount(pt, assignee);
  return calc.reason;
}

/**
 * 정산 대상 자격 여부
 *  조건:
 *    - 결과가 승/무/지원 (패/제외 아님)
 *    - 본인PT/협약사자체PT/본인영업 아님
 *    - K-APT 검증 verified 또는 잔디 evidence 있거나 admin 수동 승인
 *    - status !== completed (이미 완료면 대상 아님)
 */
export function isSettlementEligible(pt, assignee, targetMonth = null) {
  if (!pt || !assignee) return false;
  const calc = calculateSettlementAmount(pt, assignee);
  if (calc.amount === 0) return false;
  if (!['승', '무', '지원'].includes(calc.result)) return false;

  // 검증: K-APT verified OR 잔디 evidence OR 관리자 승인
  const kvStatus = pt.kaptVerified?.status;
  const verified = kvStatus === 'verified';
  const hasJandiEvidence = pt.evidenceFiles && Object.keys(pt.evidenceFiles).length > 0;
  const stl = pt.settlement?.[assignee] || {};
  const manualApproved = !!(stl.reviewBypassedBy || stl.manualVerified);
  // 감리는 공고문 불필요
  const isSupervision = /감리/.test((pt.workType || '') + '|' + (pt.siteName || ''));

  if (!verified && !hasJandiEvidence && !manualApproved && !isSupervision) {
    return false;  // 아직 검증 안 됨
  }

  // targetMonth 필터 (PT 일자 기준)
  if (targetMonth) {
    const ptDate = pt.date || '';
    if (!ptDate.startsWith(targetMonth)) return false;
  }

  // 이미 completed 면 대상 아님
  if (stl.completed || stl.status === SETTLEMENT_STATUS.COMPLETED) return false;

  return true;
}

// ===== 마이그레이션 =====

/**
 * 기존 pt.settlement 데이터를 새 6단계 모델로 변환.
 *  비파괴 — 기존 flag (requested/completed) 유지하면서 status 필드 보완.
 *  반환: 변경사항만 담긴 diff 객체 (Firebase PATCH 용)
 */
export function migrateSettlementShape(pt) {
  if (!pt?.settlement) return null;
  const updates = {};
  for (const [assignee, stl] of Object.entries(pt.settlement)) {
    if (!stl || typeof stl !== 'object') continue;
    if (stl.status && Object.values(SETTLEMENT_STATUS).includes(stl.status)) continue;  // 이미 새 모델

    const derived = getSettlementStatus(pt, assignee);
    if (derived !== SETTLEMENT_STATUS.UNSETTLED || stl.requested || stl.completed) {
      updates[`settlement/${assignee}/status`] = derived;
    }

    // calculatedAmount 캐시
    const calc = calculateSettlementAmount(pt, assignee);
    if (calc.amount > 0) {
      updates[`settlement/${assignee}/calculatedAmount`] = calc.amount;
    }
    if (calc.reason) {
      updates[`settlement/${assignee}/excludedReason`] = calc.reason;
    }

    // monthKey (PT 일자 기준)
    if (pt.date) {
      const m = pt.date.match(/^(\d{4})-(\d{2})/);
      if (m) updates[`settlement/${assignee}/monthKey`] = `${m[1]}-${m[2]}`;
    }
  }
  return Object.keys(updates).length > 0 ? updates : null;
}

// ===== 마지막주 월요일 계산 (P5 기반) =====

/**
 * 해당 월의 마지막 주 월요일 구하기.
 *  예: 2026-04 → 2026-04-27
 */
export function getLastMondayOfMonth(year, month) {
  // month: 1~12
  const d = new Date(year, month, 0);  // 해당 월의 마지막 날
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * 현재 시각 기준, "지금 월정산 실행 시점인지" 판별.
 *  운영 기준: 마지막주 월요일 오전 9시 (로컬 타임존).
 */
export function isMonthlySettlementTime(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const targetDate = getLastMondayOfMonth(year, month);
  return (
    now.getFullYear() === targetDate.getFullYear() &&
    now.getMonth() === targetDate.getMonth() &&
    now.getDate() === targetDate.getDate() &&
    now.getHours() >= 9
  );
}

// ===== 자동 정산대상 전환 (Q2 2026부터 적용) =====

/**
 * Q2 2026 이후 PT 중 검증 완료 + 결과 있음 → 자동 정산대상 (settlement.requested = true)
 *
 * 기준일: 2026-04-01
 * 조건:
 *   - pt.date >= AUTO_TRANSITION_START
 *   - selfPT/selfSales 아님
 *   - 아직 requested/completed 아님
 *   - 결과가 승/무/지원 (감리는 검증 불필요이므로 결과 무관)
 *   - K-APT verified OR evidenceFiles 존재 (잔디 공고문)
 */
export const AUTO_TRANSITION_START = '2026-04-01';  // Q2 2026 시작

export function shouldAutoTransitionToTarget(pt, assignee) {
  if (!pt || !assignee || !pt.date) return false;
  if (pt.date < AUTO_TRANSITION_START) return false;  // Q1 이전은 제외
  if (pt.selfPT) return false;
  if (pt.kaptVerified?.status === 'cancelled') return false;  // 취소공고 제외
  const stl = pt.settlement?.[assignee] || {};
  if (stl.selfSales) return false;
  if (stl.requested || stl.completed) return false;  // 이미 전환됨

  // 감리는 검증·결과 무관 — ptAssignee 에 포함된 담당자면 자동 대상
  const isSupervision = /감리/.test((pt.workType || '') + '|' + (pt.siteName || ''));
  const tokens = (pt.ptAssignee || '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean);
  if (isSupervision && tokens.includes(assignee)) return true;

  // 일반 PT: 결과 있고 검증 완료
  const result = deriveAssigneeResult(pt, assignee);
  if (!['승', '무', '지원'].includes(result)) return false;

  const verified = pt.kaptVerified?.status === 'verified';
  const hasEvidence = pt.evidenceFiles && Object.keys(pt.evidenceFiles).length > 0;
  return verified || hasEvidence;
}

/**
 * 자동 전환 시 Firebase 에 저장할 settlement 엔트리 patch 생성
 */
export function buildAutoTransitionPatch(pt, assignee, triggeredBy = 'auto-verified') {
  if (!shouldAutoTransitionToTarget(pt, assignee)) return null;
  const now = new Date().toISOString();
  return {
    requested: true,
    requestedAt: now,
    requestedBy: triggeredBy,
    status: SETTLEMENT_STATUS.REQUESTED,
    autoTransition: true,
  };
}

// ===== 분기정산 util (월정산 → 분기정산 전환) =====

/**
 * Date/now 기준 분기 키 반환. "YYYY-Q{1..4}"
 */
export function getQuarterKey(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-Q${Math.ceil(m / 3)}`;
}

/**
 * "YYYY-QN" → { year, quarter, startMonth, endMonth } (월은 1~12)
 */
export function parseQuarterKey(quarterKey) {
  const m = String(quarterKey || '').match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const quarter = parseInt(m[2], 10);
  return { year, quarter, startMonth: (quarter - 1) * 3 + 1, endMonth: quarter * 3 };
}

/**
 * PT 일자(YYYY-MM-DD) 가 해당 분기에 속하는지
 */
export function ptBelongsToQuarter(ptDate, quarterKey) {
  const p = parseQuarterKey(quarterKey);
  if (!p || !ptDate) return false;
  const dm = String(ptDate).match(/^(\d{4})-(\d{2})/);
  if (!dm) return false;
  const y = parseInt(dm[1], 10);
  const m = parseInt(dm[2], 10);
  return y === p.year && m >= p.startMonth && m <= p.endMonth;
}

/**
 * 현재 분기가 마지막월의 마지막주 월요일 오전 9시 이후인지
 *  자동 실행 기준점 판별용
 */
export function isQuarterlySettlementTime(now = new Date()) {
  const month = now.getMonth() + 1;
  if (![3, 6, 9, 12].includes(month)) return false;
  const year = now.getFullYear();
  const targetDate = getLastMondayOfMonth(year, month);
  return (
    now.getFullYear() === targetDate.getFullYear() &&
    now.getMonth() === targetDate.getMonth() &&
    now.getDate() === targetDate.getDate() &&
    now.getHours() >= 9
  );
}

// ===== 실적 확정일 기준 분기 귀속 (resultConfirmDate) =====
//
// 운영 원칙:
//   정산 귀속 기준은 PT 진행일이 아니라 담당자가 실적을 확정한 날짜.
//   예: 2025-12-20 PT 라도 2026-04-08 에 확정되면 2026-Q2 귀속.
//
// 실적 확정일 추출 우선순위 (가장 강한 신호 → 약한 신호):
//   1. settlement.{assignee}.finalConfirmedAt    (Phase 4 최종확정 — 담당자 명시적 확정)
//   2. settlement.{assignee}.requestedAt         (정산요청 체크 시점)
//   3. pt.resultConfirmDate[assignee]            (승/무/패 버튼 클릭 시점 — 결과 입력일)
//   4. pt.date                                   (PT 진행일 — 레거시 fallback)
//
// [중요] 2026-04 수정: tier 3 추가.
//   이전에는 finalConfirmedAt/requestedAt 없으면 바로 pt.date 로 떨어져서
//   "결과 입력은 4월에 했는데 PT 가 1월이면 Q1 귀속" 오류 발생.
//   이제 '담당자가 승/무/패를 클릭한 날짜'(todayDate) 가 저장된 resultConfirmDate 를 우선.

/**
 * PT + assignee 의 실적 확정일 추출
 */
export function getResultConfirmDate(pt, assignee) {
  if (!pt || !assignee) return null;
  const stl = pt.settlement?.[assignee] || {};
  // 우선순위 1: 최종확정 (Phase 4)
  if (stl.finalConfirmedAt) return stl.finalConfirmedAt.slice(0, 10);
  // 우선순위 2: 정산요청 시점
  if (stl.requestedAt) return stl.requestedAt.slice(0, 10);
  // 우선순위 3: 결과(승/무/패) 입력 시점 — 담당자가 결과 버튼 클릭한 날짜
  const resCd = pt.resultConfirmDate?.[assignee];
  if (resCd) return String(resCd).slice(0, 10);
  // 우선순위 4: PT 일자 fallback (레거시 호환)
  return pt.date || null;
}

/**
 * 실적 확정일 기준 분기 키 반환
 */
export function getQuarterKeyByConfirmDate(confirmDate) {
  if (!confirmDate) return null;
  const m = String(confirmDate).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  return `${y}-Q${Math.ceil(mo / 3)}`;
}

/**
 * PT + assignee 가 어느 분기에 귀속되는지 (확정일 기준)
 */
export function getAssigneeQuarterKey(pt, assignee) {
  const cd = getResultConfirmDate(pt, assignee);
  return getQuarterKeyByConfirmDate(cd);
}

/**
 * 분기 마감일 — 분기 종료 다음달 마지막주 월요일
 *   Q1 (1-3월) → 4월 마지막주 월요일
 *   Q2 (4-6월) → 7월 마지막주 월요일
 *   Q3 (7-9월) → 10월 마지막주 월요일
 *   Q4 (10-12월) → 다음해 1월 마지막주 월요일
 *
 * 반환: Date 객체
 */
export function getQuarterClosingDate(quarterKey) {
  const p = parseQuarterKey(quarterKey);
  if (!p) return null;
  // 분기 종료 다음달
  let closingYear = p.year;
  let closingMonth = p.endMonth + 1;
  if (closingMonth > 12) { closingMonth = 1; closingYear += 1; }
  return getLastMondayOfMonth(closingYear, closingMonth);
}

/**
 * 분기별 급여 반영월 "YYYY-MM"
 *   Q1 → 해당년 4월, Q2 → 7월, Q3 → 10월, Q4 → 다음해 1월
 */
export function getPayrollMonthByQuarterKey(quarterKey) {
  const p = parseQuarterKey(quarterKey);
  if (!p) return null;
  let y = p.year;
  let m = p.endMonth + 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * PT+assignee 가 해당 분기 마감 전까지 집계 대상인지
 *  - 확정일이 분기 범위 안
 *  - 확정일이 마감일(다음달 마지막주 월요일) 이전
 *
 * now 파라미터로 현재 시각 주입 가능 (과거 분기 재집계 등).
 */
export function isInQuarterSettlementScope(pt, assignee, quarterKey, now = new Date()) {
  const cd = getResultConfirmDate(pt, assignee);
  if (!cd) return false;
  const qk = getQuarterKeyByConfirmDate(cd);
  if (qk !== quarterKey) return false;
  // 마감일 체크 — 현재가 마감일 이후면 해당 분기 마감 (확정일 제한 없음)
  // 현재가 마감일 이전이면 확정일 자체가 현재 이전이어야 집계 대상
  const closing = getQuarterClosingDate(quarterKey);
  if (!closing) return true;
  if (now > closing) return true; // 마감 이후 재집계 요청 — 분기 내 확정건 모두 포함
  // 마감 이전 호출 — 확정일이 현재 이전인 건만
  const cdDate = new Date(cd + 'T00:00:00');
  return cdDate <= now;
}
