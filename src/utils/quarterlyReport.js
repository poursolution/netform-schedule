// 분기 보고서 (PT 정산 실적 중심) 데이터 집계 + Excel/PDF 생성
//
// [2026-04 재구성] 주말출근·공법통계 제거 → PT 실적 중심 단순화
// 정산 대상 기준: 분기정산 화면과 동일
//   PT 진행일이 선택 분기 안에 있고, 담당자별 requested/manualVerified 상태인 건.
//
// 발송 흐름: admin 확인 → 김유림(yurim@netformrnd.com) 발송
// 발송 시점: 해당 분기 끝난 다음달 마지막 주 월요일 14:00 KST

import * as XLSX from 'xlsx';
import { isExceptionApproved, EXCEPTION_TYPES } from './exceptions.js';
import { calculateSettlementAmount } from './settlement.js';
import {
  SETTLEMENT_ASSIGNEES,
  isQuarterSettlementTarget,
} from './quarterlySettlementCore.js';
export { SETTLEMENT_ASSIGNEES } from './quarterlySettlementCore.js';

// 이 명단에 포함된 담당자의 데이터만 보고서 집계에 사용
const SETTLEMENT_ASSIGNEES_SET = new Set(SETTLEMENT_ASSIGNEES);

// === 분기 날짜 범위 ===
export function getQuarterRange(year, quarter) {
  const y = parseInt(year);
  if (quarter === 1) return { start: `${y}-01-01`, end: `${y}-03-31`, label: '1분기' };
  if (quarter === 2) return { start: `${y}-04-01`, end: `${y}-06-30`, label: '2분기' };
  if (quarter === 3) return { start: `${y}-07-01`, end: `${y}-09-30`, label: '3분기' };
  if (quarter === 4) return { start: `${y}-10-01`, end: `${y}-12-31`, label: '4분기' };
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: '연간' };
}

// === 분기 발송 시점 (분기 끝난 다음달 30일 고정) ===
//   1분기 → 4월 30일
//   2분기 → 7월 30일
//   3분기 → 10월 30일
//   4분기 → 다음 연도 1월 30일
export function getQuarterDeadline(year, quarter) {
  const y = parseInt(year);
  if (quarter === 1) return `${y}-04-30`;
  if (quarter === 2) return `${y}-07-30`;
  if (quarter === 3) return `${y}-10-30`;
  if (quarter === 4) return `${y + 1}-01-30`;
  return null;
}

// === 정산 분기 윈도우 (가이드: 입력 분기 = 수당 분기) — "이전 분기 미확인" 케이스에만 사용 ===
//   Q1 = 1/31 ~ 4/30
//   Q2 = 5/1 ~ 7/30
//   Q3 = 7/31 ~ 10/30
//   Q4 = 10/31 ~ 익년 1/30
export function getSettlementWindow(year, quarter) {
  const y = parseInt(year);
  if (quarter === 1) return { start: `${y}-01-31`, end: `${y}-04-30`, label: '1분기 정산창' };
  if (quarter === 2) return { start: `${y}-05-01`, end: `${y}-07-30`, label: '2분기 정산창' };
  if (quarter === 3) return { start: `${y}-07-31`, end: `${y}-10-30`, label: '3분기 정산창' };
  if (quarter === 4) return { start: `${y}-10-31`, end: `${y + 1}-01-30`, label: '4분기 정산창' };
  return null;
}

// === PT 한 건의 수당 귀속 분기 ===
//   가이드 룰:
//     1) PT 진행 분기 마감일(다음달 30일) 안에 입력 → PT 진행 분기 수당
//     2) 마감 지나서 입력 → 입력 분기 (settlement window) 수당
//   예: 4/15 PT, 4/24 입력 → Q2 진행 + Q2 마감(7/30) 전 → Q2 수당
//   예: 1월 PT, 4/24 입력 → Q1 진행 + Q1 마감(4/30) 전 → Q1 수당
//   예: 1월 PT, 5/5 입력 → Q1 진행 + Q1 마감 지남 → 입력일이 Q2 윈도우 → Q2 수당
export function getSettlementQuarterForPt(ptDate, confirmDate) {
  if (!ptDate) return null;
  const m = String(ptDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const ptY = parseInt(m[1], 10);
  const ptM = parseInt(m[2], 10);
  const ptQ = Math.ceil(ptM / 3);
  // 진행 분기 마감일 — Q1=4/30, Q2=7/30, Q3=10/30, Q4=익년1/30
  const dlMonth = ptQ * 3 + 1;
  const dlYear = dlMonth > 12 ? ptY + 1 : ptY;
  const dlMonthAdj = dlMonth > 12 ? 1 : dlMonth;
  const deadlineStr = `${dlYear}-${String(dlMonthAdj).padStart(2, '0')}-30`;
  const cd = String(confirmDate || '').slice(0, 10);
  if (!cd) return { year: ptY, quarter: ptQ };
  if (cd <= deadlineStr) {
    return { year: ptY, quarter: ptQ };
  }
  // 마감 지남 → 입력일 분기 윈도우
  const cy = parseInt(cd.slice(0, 4), 10);
  const cm = parseInt(cd.slice(5, 7), 10);
  const cday = parseInt(cd.slice(8, 10), 10);
  if (cm === 1 && cday <= 30) return { year: cy - 1, quarter: 4 };
  if ((cm >= 1 && cm < 4) || (cm === 4 && cday <= 30)) return { year: cy, quarter: 1 };
  if ((cm > 4 && cm < 7) || (cm === 4 && cday > 30) || (cm === 7 && cday <= 30)) return { year: cy, quarter: 2 };
  if ((cm > 7 && cm < 10) || (cm === 7 && cday > 30) || (cm === 10 && cday <= 30)) return { year: cy, quarter: 3 };
  return { year: cy, quarter: 4 };
}

// === 헬퍼 ===
function inRange(dateStr, range) {
  if (!dateStr) return false;
  return dateStr >= range.start && dateStr <= range.end;
}

function parseAssignees(s) {
  if (!s) return [];
  return s.split(/[\/,+&]/).map(a => a.trim()).filter(a => a);
}

function getPrimaryAssignee(s) {
  const assignees = parseAssignees(s.ptAssignee);
  return assignees[0] || null;
}

function getPtResult(s, assignee) {
  let raw = null;
  if (s.results && s.results[assignee]) raw = s.results[assignee];
  else {
    const assignees = parseAssignees(s.ptAssignee);
    if (assignees.length > 1) raw = null;
    else raw = s.result || null;
  }
  if (!raw) return null;

  // 지원 규칙: 지원자 결과는 주담당자 결과에 종속
  const primary = getPrimaryAssignee(s);
  if (raw === '지원' && primary && assignee !== primary) {
    const primaryResult = s.results?.[primary] || s.result;
    if (primaryResult === '승') return '지원';
    if (primaryResult === '무') return '지원';
    if (primaryResult === '패') return '패';
    if (primaryResult === '지원') return '지원';  // 주담·지원자 모두 지원 → 둘 다 250K
    return null;
  }
  return raw;
}

function isSelfSales(s, assignee) {
  return s.settlement?.[assignee]?.selfSales || false;
}

function isSettlementCompleted(s, assignee) {
  const set = s.settlement?.[assignee];
  return set?.completed || set?.selfSales || false;
}

function isSettlementRequested(s, assignee) {
  return s.settlement?.[assignee]?.requested || false;
}

function isSupervision(s) {
  return !!(s && s.workType && /감리/.test(String(s.workType)));
}

// === 주말출근 판정 (PT 진행일 기준) ===
//   토(6) / 일(0) 출근 → 연차 1.5일 부여
//   결과(승/무/지원/패) 무관 — 단지 출근 사실 기준 (다른 출근수당 정산 별도 운용)
function isWeekendPt(s) {
  if (!s.date) return false;
  // YYYY-MM-DD 직접 파싱 (Date() 시간대 이슈 회피)
  const m = s.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  const day = d.getDay();
  return day === 0 || day === 6;
}

function getSettlementAmount(s, assignee, overrideResult = null) {
  if (s.selfPT) return 0;
  if (isSelfSales(s, assignee)) return 0;
  if (isSupervision(s)) return 80000;
  const r = overrideResult || getPtResult(s, assignee);
  if (r === '승') return 500000;
  if (r === '무') return 250000;
  if (r === '지원') return 250000;
  return 0;
}

// === PT 검증 게이트 ===
// OPERATIONS.md §7 룰: 다음 중 하나 만족 시 검증완료
//   1) selfPT / 감리 / 패 → 검증 불필요
//   2) kaptVerified.status === 'verified' (K-APT 자동검증 통과)
//   3) settlement.{a}.manualVerified === true (관리자 수동승인)
//   4) evidenceFiles 1개 이상 (잔디 공고문 첨부)
//   5) bidNo 입력 (공고번호 텍스트만 채워도 인정 — legacy)
//   6) kaptVerified.status === 'cancelled' 은 별도 처리(취소공고) — 위에서 skip
function isPtVerified(s, assignee) {
  if (s.selfPT) return true;
  if (isSupervision(s)) return true;
  const r = getPtResult(s, assignee);
  if (!r) return false;
  if (r === '패') return true;
  // K-APT 자동검증 통과
  if (s.kaptVerified?.status === 'verified') return true;
  // 관리자 수동검증 (분기정산 모달 체크박스)
  if (s.settlement?.[assignee]?.manualVerified === true) return true;
  // 잔디 공고문 증빙
  if (s.evidenceFiles && Object.keys(s.evidenceFiles).length > 0) return true;
  // 공고번호 텍스트 입력 (legacy 호환)
  if (s.bidNo && String(s.bidNo).trim()) return true;
  return false;
}

function getVerifyReason(s, assignee) {
  if (s.selfPT) return '';
  if (isSupervision(s)) return '';
  const r = getPtResult(s, assignee);
  if (!r) return '결과 미입력';
  if (r === '패') return '';
  if (s.kaptVerified?.status === 'verified') return '';
  if (s.settlement?.[assignee]?.manualVerified === true) return '';
  if (s.evidenceFiles && Object.keys(s.evidenceFiles).length > 0) return '';
  if (s.bidNo && String(s.bidNo).trim()) return '';
  return '미검증 (K-APT 미통과 · 증빙 없음 · 공고번호 미입력)';
}

// === 금액 미반영 사유 라벨 (calculateSettlementAmount reason → 한글) ===
const EXCLUSION_REASON_LABELS = {
  loss: '패 (POUR 공법 미입찰 — 0원)',
  self_sales: '본인영업 (정산 제외)',
  vendor_self_pt: '자체PT (협약사 자체 진행 — 정산 제외)',
  draw_support_excluded: '주담 무승부 — 지원자 예외승인 없음 (0원)',
  cancelled_notice: '취소공고 (발주처 공고 취소 — 재공고 대기)',
  settlement_excluded: '정산예외 (관리자 판단 정산 제외)',
  supervision_pending_input: '감리 금액 미입력 (수동 입력 대기)',
};

// === 확정일 추출 (우선순위 fallback) ===
//   1. settlement.{a}.finalConfirmedAt (Phase 4 최종확정)
//   2. settlement.{a}.requestedAt (정산요청 시점)
//   3. pt.resultConfirmDate[a] (결과 버튼 클릭일)
//   4. pt.date (PT 진행일 — 레거시 fallback)
function extractConfirmDate(s, assignee) {
  const stl = s.settlement?.[assignee] || {};
  if (stl.finalConfirmedAt) return stl.finalConfirmedAt.slice(0, 10);
  if (stl.requestedAt) return stl.requestedAt.slice(0, 10);
  const resCd = s.resultConfirmDate?.[assignee];
  if (resCd) return String(resCd).slice(0, 10);
  return s.date || null;
}

// === 메인 집계 — PT 정산 중심 ===
// 기준: 관리자 분기정산 화면과 동일한 대상 조건
// 제외: 미요청 / 완료 / 중복대체 / 자체PT / 본인영업 / 취소공고
export function aggregateQuarterlyReport(allData, year, quarter, opts = {}) {
  const range = getQuarterRange(year, quarter);  // PT 진행일 범위 (1/1~3/31) — 주말출근에 사용
  const { ptSchedules = [] } = allData;
  const quarterKey = `${parseInt(year, 10)}-Q${parseInt(quarter, 10)}`;

  const SETTLEMENT_RESULTS = new Set(['승', '무', '지원', '감리']);
  const ptVerified = [];
  const ptUnverified = [];
  // 금액 미반영 내역 — PT 진행일이 분기 안인데 정산금액에 안 잡힌 건 + 사유
  const ptExcludedItems = [];
  const pushExcluded = (s, a, reason, result) => {
    ptExcludedItems.push({
      date: s.date,
      siteName: s.siteName || '',
      address: s.address || '',
      assignee: a,
      result: result || '',
      reason,
    });
  };
  // 주말출근(토/일) — PT 진행일 기준 분기 귀속, 결과 무관
  //   PT 결과(승/무/지원/패) 와 정산 fallback 체인 무관 — 단순 출근일 집계.
  //   범위: PT 진행일(s.date)이 분기 안에 있으면 카운트.
  //   조건: SETTLEMENT_ASSIGNEES 중, ptAssignee 토큰에 들어 있는 사람만.
  //         취소공고 제외, 자체PT 제외 (실제 출근 의미 약함).
  const weekendItems = [];

  let debugStats = {
    totalSchedules: ptSchedules.length,
    skippedNoDate: 0,
    skippedNonConfirmed: 0,
    skippedNonSettlementAssignee: 0,
    skippedNonSettlementResult: 0,
    skippedCancelled: 0,
    skippedOutOfQuarter: 0,
    skippedNotRequested: 0,
    skippedCompleted: 0,
    skippedSuperseded: 0,
    skippedExcludedByCalc: 0,
    includedVerified: 0,
    includedUnverified: 0,
    weekendItems: 0,
  };

  ptSchedules.forEach(s => {
    if (!s.date) { debugStats.skippedNoDate++; return; }
    const inQuarter = inRange(s.date, range);
    if (s.kaptVerified?.status === 'cancelled') {
      debugStats.skippedCancelled++;
      if (inQuarter) {
        parseAssignees(s.ptAssignee).forEach(a => {
          if (!SETTLEMENT_ASSIGNEES_SET.has(a)) return;
          pushExcluded(s, a, EXCLUSION_REASON_LABELS.cancelled_notice, getPtResult(s, a));
        });
      }
      return;
    }

    // 분기정산 모달과 동일: pt.date 기준 분기 귀속 + grace 룰
    // 주말출근 — PT 진행일 in range, 결과/requested 무관 (취소공고는 제외)
    if (!s.selfPT && s.kaptVerified?.status !== 'cancelled' && isWeekendPt(s) && inRange(s.date, range)) {
      const wAssignees = parseAssignees(s.ptAssignee);
      wAssignees.forEach(wa => {
        if (!SETTLEMENT_ASSIGNEES_SET.has(wa)) return;
        if (isSelfSales(s, wa)) return;
        weekendItems.push({
          date: s.date,
          dayOfWeek: ['일','월','화','수','목','금','토'][new Date(parseInt(s.date.slice(0,4)), parseInt(s.date.slice(5,7))-1, parseInt(s.date.slice(8,10))).getDay()],
          siteName: s.siteName || '',
          assignee: wa,
          result: getPtResult(s, wa) || '미입력',
        });
        debugStats.weekendItems++;
      });
    }

    const assignees = parseAssignees(s.ptAssignee);
    assignees.forEach(a => {
      if (!SETTLEMENT_ASSIGNEES_SET.has(a)) { debugStats.skippedNonSettlementAssignee++; return; }
      if (!isQuarterSettlementTarget(s, a, quarterKey, opts)) {
        debugStats.skippedOutOfQuarter++;
        // \ubd84\uae30 \ub0b4 PT\uc778\ub370 \uc9d1\uacc4 \ub300\uc0c1\uc774 \uc544\ub2cc \uac74 \u2192 \ubbf8\ubc18\uc601 \uc0ac\uc720 \uae30\ub85d
        if (inQuarter) {
          const stl0 = s.settlement?.[a] || {};
          const calc0 = calculateSettlementAmount(s, a);
          let reason;
          if (s.selfPT) reason = EXCLUSION_REASON_LABELS.vendor_self_pt;
          else if (stl0.completed === true) reason = '\uc815\uc0b0\uc644\ub8cc (\uae30\uc9c0\uae09 \u2014 \ubcf8 \ubd84\uae30 \uc9d1\uacc4 \uc81c\uc678)';
          else if (stl0.superseded === true || stl0.status === 'superseded') reason = '\uc911\ubcf5\ub300\uccb4 \uac74 (\ub2e4\ub978 \uac74\uc73c\ub85c \ub300\uccb4)';
          else if (calc0.reason && EXCLUSION_REASON_LABELS[calc0.reason]) reason = EXCLUSION_REASON_LABELS[calc0.reason];
          else if (calc0.result === '\ud328') reason = EXCLUSION_REASON_LABELS.loss;
          else if (!calc0.result) reason = '\uacb0\uacfc \ubbf8\uc785\ub825 (\uc2b9/\ubb34/\ud328 \uc785\ub825 \uc804)';
          else reason = '\uc815\uc0b0 \ubbf8\uc694\uccad (\uc815\uc0b0\uc694\uccad\u00b7\uc218\ub3d9\uac80\uc99d \uc804 \u2014 \ucc28\uae30 \uc9d1\uacc4 \ub300\uc0c1)';
          pushExcluded(s, a, reason, calc0.result || getPtResult(s, a));
        }
        return;
      }
      const rawResult = getPtResult(s, a);
      const exceptionApproved = isExceptionApproved(s, a);
      const exceptionReq = exceptionApproved ? s.exceptionRequests?.[a] : null;
      const calc = exceptionApproved
        ? { amount: 500000, result: '\uc2b9', reason: null }
        : calculateSettlementAmount(s, a);
      const effectiveResult = exceptionApproved ? '\uc2b9' : (calc.result || rawResult);
      if (!SETTLEMENT_RESULTS.has(effectiveResult)) {
        debugStats.skippedNonSettlementResult++;
        if (inQuarter) {
          const reason = (calc.reason && EXCLUSION_REASON_LABELS[calc.reason])
            || (calc.result === '\ud328' ? EXCLUSION_REASON_LABELS.loss : null)
            || (!rawResult ? '\uacb0\uacfc \ubbf8\uc785\ub825 (\uc2b9/\ubb34/\ud328 \uc785\ub825 \uc804)' : '\uc815\uc0b0 \ub300\uc0c1 \uacb0\uacfc \uc544\ub2d8');
          pushExcluded(s, a, reason, calc.result || rawResult);
        }
        return;
      }

      const confirmDate = extractConfirmDate(s, a);
      const stl = s.settlement?.[a] || {};
      const verified = isPtVerified(s, a);
      const row = {
        date: s.date,
        confirmDate,
        bidNo: s.bidNo || '',
        siteName: s.siteName || '',
        address: s.address || '',
        assignee: a,
        result: exceptionApproved ? effectiveResult : calc.result,
        rawResult,
        isException: exceptionApproved,
        exceptionType: exceptionReq ? exceptionReq.type : null,
        exceptionReason: exceptionReq ? exceptionReq.reason : '',
        settlementStatus: isSettlementCompleted(s, a) ? '정산완료'
          : (isSettlementRequested(s, a) ? '정산요청' : '미정산'),
        amount: calc.amount || 0,
        selfPT: !!s.selfPT,
        note: s.note || '',
        verifyReason: '',
      };
      ptVerified.push(row);
      debugStats.includedVerified++;
    });
  });

  // 디버그 로그 — 실적 0건 문제 진단
  console.log(`[분기보고서 ${year}-Q${quarter}] 집계 결과:`, {
    기준분기: range,
    원본_PT: debugStats.totalSchedules,
    집계된_검증완료: debugStats.includedVerified,
    집계된_미검증: debugStats.includedUnverified,
    제외_사유: {
      날짜없음: debugStats.skippedNoDate,
      미확정일정: debugStats.skippedNonConfirmed,
      정산담당자_아님: debugStats.skippedNonSettlementAssignee,
      승무지원_아님: debugStats.skippedNonSettlementResult,
      취소공고: debugStats.skippedCancelled,
      분기_범위_밖: debugStats.skippedOutOfQuarter,
    },
    resultConfirmDate_없음_PT일_fallback: debugStats.missingResultConfirmDate,
  });

  // 담당자별 그룹
  const byAssignee = {};
  SETTLEMENT_ASSIGNEES.forEach(a => { byAssignee[a] = { assignee: a, ptItems: [] }; });
  ptVerified.forEach(p => { byAssignee[p.assignee].ptItems.push(p); });
  SETTLEMENT_ASSIGNEES.forEach(a => {
    byAssignee[a].ptItems.sort((x, y) => x.confirmDate.localeCompare(y.confirmDate));
  });

  // 주말출근 담당자별 카운트
  const weekendByAssignee = {};
  SETTLEMENT_ASSIGNEES.forEach(a => { weekendByAssignee[a] = []; });
  weekendItems.forEach(w => {
    if (weekendByAssignee[w.assignee]) weekendByAssignee[w.assignee].push(w);
  });

  // 담당자 요약 (7명 전원) — 주말출근 + 연차 환산일수 포함
  //   연차 1.5배: 주말 1회 출근 = 연차 1.5일 부여
  const summary = SETTLEMENT_ASSIGNEES.map(assignee => {
    const ptList = byAssignee[assignee].ptItems;
    const wList = weekendByAssignee[assignee] || [];
    return {
      assignee,
      ptCount: ptList.length,
      ptWin: ptList.filter(r => r.result === '승').length,
      ptDraw: ptList.filter(r => r.result === '무').length,
      ptSupport: ptList.filter(r => r.result === '지원').length,
      settlementAmount: ptList.reduce((s, r) => s + r.amount, 0),
      weekendCount: wList.length,
      annualLeaveDays: wList.length * 1.5,
    };
  });

  const totals = {
    ptCount: summary.reduce((s, r) => s + r.ptCount, 0),
    ptWin: summary.reduce((s, r) => s + r.ptWin, 0),
    ptDraw: summary.reduce((s, r) => s + r.ptDraw, 0),
    ptSupport: summary.reduce((s, r) => s + r.ptSupport, 0),
    settlementAmount: summary.reduce((s, r) => s + r.settlementAmount, 0),
    weekendCount: summary.reduce((s, r) => s + r.weekendCount, 0),
    annualLeaveDays: summary.reduce((s, r) => s + r.annualLeaveDays, 0),
  };

  ptExcludedItems.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return {
    range, summary, byAssignee,
    ptVerified, ptUnverified, totals,
    ptExcludedItems,
    weekendItems, weekendByAssignee,
    year, quarter, debugStats,
  };
}

// === Excel 생성 (표지·요약 + 주말출근 + PT상세 + 금액미반영) ===
//   opts.includeAmounts === false → 정산금액·단가 컬럼 전부 제외한 버전 생성
export function generateExcelBlob(report, opts = {}) {
  const includeAmounts = opts.includeAmounts !== false;  // 기본: 금액 포함
  const { range, summary, byAssignee, totals, year } = report;
  const excludedItems = report.ptExcludedItems || [];
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `${year}년 ${range.label} PT 실적 보고서`,
    Subject: 'PT 정산 (분기정산 대상 기준)',
    Author: 'POUR영업운영시스템',
    CreatedDate: new Date(),
  };

  // ----- Sheet1: 표지 + 담당자별 요약 -----
  const summaryRows = summary.map(r => includeAmounts
    ? [r.assignee, r.ptCount, r.ptWin, r.ptDraw, r.ptSupport, r.settlementAmount, r.weekendCount, r.annualLeaveDays]
    : [r.assignee, r.ptCount, r.ptWin, r.ptDraw, r.ptSupport, r.weekendCount, r.annualLeaveDays]);
  const totalRow = includeAmounts
    ? ['합계', totals.ptCount, totals.ptWin, totals.ptDraw, totals.ptSupport, totals.settlementAmount, totals.weekendCount, totals.annualLeaveDays]
    : ['합계', totals.ptCount, totals.ptWin, totals.ptDraw, totals.ptSupport, totals.weekendCount, totals.annualLeaveDays];

  const sheet1Data = [
    [`${year}년 ${range.label} PT 실적 보고서${includeAmounts ? '' : ' (금액 제외)'}`],
    [`기간: ${range.start} ~ ${range.end} (분기정산 대상 기준)`],
    [`발송일: ${new Date().toISOString().slice(0,10)} · 수신: 김유림(yurim@netformrnd.com)`],
    [],
    ['【 분기 요약 】'],
    ['항목', '값'],
    ['총 정산 대상 건수', totals.ptCount + '건'],
    ['결과 분포', `승 ${totals.ptWin} / 무 ${totals.ptDraw} / 지원 ${totals.ptSupport}`],
    ...(includeAmounts ? [['총 정산금액', totals.settlementAmount.toLocaleString() + '원']] : []),
    ['주말출근 (토/일)', `${totals.weekendCount}회 → 연차 ${totals.annualLeaveDays}일 (1.5배 환산)`],
    ['금액 미반영', `${excludedItems.length}건 (사유별 상세: '금액미반영' 시트)`],
    [],
    ['【 담당자별 실적 】'],
    includeAmounts
      ? ['담당자', 'PT건수', '승', '무', '지원', '정산금액(원)', '주말출근(회)', '연차환산(일·1.5배)']
      : ['담당자', 'PT건수', '승', '무', '지원', '주말출근(회)', '연차환산(일·1.5배)'],
    ...summaryRows,
    totalRow,
    [],
    ['【 PT 결과 판정 기준 】'],
    ...(includeAmounts ? [
      ['결과', '기준', '정산 단가'],
      ['승', 'POUR 공법 단독 입찰', '500,000원'],
      ['무', 'POUR 공법 + 타공법 동시 입찰', '250,000원'],
      ['지원', '한 현장 2명 이상 — 주영업 외 지원', '250,000원 (주담 패배 시 0원)'],
      ['패', 'POUR 공법 미입찰', '0원'],
      ['감리', '감리 공종 (공고문 요구 없음)', '한준엽/관리자 수동 입력 금액'],
    ] : [
      ['결과', '기준'],
      ['승', 'POUR 공법 단독 입찰'],
      ['무', 'POUR 공법 + 타공법 동시 입찰'],
      ['지원', '한 현장 2명 이상 — 주영업 외 지원'],
      ['패', 'POUR 공법 미입찰'],
      ['감리', '감리 공종 (공고문 요구 없음)'],
    ]),
    [],
    ['※ 집계 기준: 관리자 분기정산 화면과 동일 (정산요청/수동검증 · 완료 제외)'],
    ['※ 자체PT(selfPT) · 본인영업 건은 정산 제외 (0원 처리)'],
    ['※ 취소공고 건은 집계 제외'],
    [],
    ['【 금액 미반영 기준 】 — 아래 사유에 해당하면 정산금액 0원 또는 집계 제외'],
    ['사유', '설명'],
    ['패', 'POUR 공법 미입찰 — 0원'],
    ['결과 미입력', '담당자 결과(승/무/패) 입력 전'],
    ['본인영업', '담당자 본인 영업 건 — 정산 제외'],
    ['자체PT', '협약사 자체 진행 PT — 정산 제외'],
    ['취소공고', '발주처 공고 취소 — 재공고 대기'],
    ['주담 무·지원 미승인', '주담당 무승부 시 지원자는 관리자 예외승인 필요'],
    ['정산예외', '관리자 판단으로 정산 대상 제외'],
    ['정산 미요청', '정산요청·수동검증 전 — 차기 분기 집계 대상'],
    ['정산완료', '이미 지급 완료 — 본 분기 집계 제외'],
    ['감리 금액 미입력', '감리 건은 수동 입력 금액 확정 전까지 0원'],
    ['※ 건별 상세는 "금액미반영" 시트 참조'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = includeAmounts
    ? [{ wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 6 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 14 }]
    : [{ wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 6 }, { wch: 8 }, { wch: 12 }, { wch: 14 }];
  // 제목/소제목 행: 전체 컬럼 머지 (금액 유무에 따라 행/컬럼 수 달라지므로 동적 계산)
  const lastCol = includeAmounts ? 7 : 6;
  const assigneeHeaderRow = sheet1Data.findIndex(r => r[0] === '【 담당자별 실적 】');
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: lastCol } },
    { s: { r: assigneeHeaderRow, c: 0 }, e: { r: assigneeHeaderRow, c: lastCol } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, '표지·요약');

  // ----- Sheet1.5: 주말출근 상세 (별도 시트) -----
  if (report.weekendItems && report.weekendItems.length > 0) {
    const wkRows = [...report.weekendItems]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map(w => [w.date, w.dayOfWeek, w.assignee, w.siteName, w.result]);
    const wkSheet = XLSX.utils.aoa_to_sheet([
      [`${year}년 ${range.label} 주말출근 상세 (연차 1.5배 환산)`],
      [`총 ${totals.weekendCount}회 → 연차 ${totals.annualLeaveDays}일 부여`],
      [],
      ['날짜', '요일', '담당자', '현장', '결과'],
      ...wkRows,
    ]);
    wkSheet['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 30 }, { wch: 8 }];
    wkSheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    ];
    XLSX.utils.book_append_sheet(wb, wkSheet, '주말출근');
  }

  // ----- Sheet2: PT 상세 리스트 (담당자별 그룹) -----
  const ptData = [
    ['PT 상세 리스트 (분기정산 대상 기준 · 승/무/지원/감리)'],
    ['※ 자체PT·본인영업·취소공고 건은 제외 · 패배 건은 금액 0원이므로 제외'],
    [],
    ['【 담당자별 합계 】'],
    includeAmounts
      ? ['담당자', 'PT 건수', '승', '무', '지원', '정산금액(원)']
      : ['담당자', 'PT 건수', '승', '무', '지원'],
    ...summary.map(r => includeAmounts
      ? [r.assignee, r.ptCount, r.ptWin, r.ptDraw, r.ptSupport, r.settlementAmount]
      : [r.assignee, r.ptCount, r.ptWin, r.ptDraw, r.ptSupport]),
    includeAmounts
      ? ['합계', totals.ptCount, totals.ptWin, totals.ptDraw, totals.ptSupport, totals.settlementAmount]
      : ['합계', totals.ptCount, totals.ptWin, totals.ptDraw, totals.ptSupport],
    [],
    ['【 담당자별 상세 】'],
  ];
  SETTLEMENT_ASSIGNEES.forEach(a => {
    const items = byAssignee[a].ptItems;
    const subSum = items.reduce((s, r) => s + r.amount, 0);
    ptData.push([includeAmounts
      ? `■ ${a} (${items.length}건 · ${subSum.toLocaleString()}원)`
      : `■ ${a} (${items.length}건)`]);
    if (items.length === 0) {
      ptData.push(['  - 해당 분기 정산 대상 PT 없음']);
    } else {
      ptData.push(includeAmounts
        ? ['확정일', 'PT일', '공고번호', '단지명', '주소', '결과', '정산상태', '정산금액(원)', '비고']
        : ['확정일', 'PT일', '공고번호', '단지명', '주소', '결과', '정산상태', '비고']);
      items.forEach(r => ptData.push(includeAmounts
        ? [r.confirmDate, r.date, r.bidNo, r.siteName, r.address, r.result, r.settlementStatus, r.amount, r.note]
        : [r.confirmDate, r.date, r.bidNo, r.siteName, r.address, r.result, r.settlementStatus, r.note]));
    }
    ptData.push([]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(ptData);
  ws2['!cols'] = includeAmounts
    ? [{wch:12},{wch:12},{wch:14},{wch:28},{wch:30},{wch:6},{wch:10},{wch:14},{wch:25}]
    : [{wch:12},{wch:12},{wch:14},{wch:28},{wch:30},{wch:6},{wch:10},{wch:25}];
  XLSX.utils.book_append_sheet(wb, ws2, 'PT상세');

  // ----- Sheet3: 금액 미반영 내역 (0원 · 집계 제외 건 + 사유) -----
  const exData = [
    [`${year}년 ${range.label} 금액 미반영 내역`],
    [`총 ${excludedItems.length}건 — PT 진행일이 분기 내인 건 중 정산금액에 반영되지 않은 건과 그 사유`],
    [],
    ['PT일', '단지명', '주소', '담당자', '결과', '미반영 사유'],
  ];
  if (excludedItems.length === 0) {
    exData.push(['해당 분기 금액 미반영 건 없음']);
  } else {
    excludedItems.forEach(x => exData.push([
      x.date, x.siteName, x.address, x.assignee, x.result || '-', x.reason,
    ]));
  }
  const ws3 = XLSX.utils.aoa_to_sheet(exData);
  ws3['!cols'] = [{wch:12},{wch:28},{wch:30},{wch:10},{wch:8},{wch:44}];
  ws3['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, '금액미반영');

  const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// === HTML 보고서 (PDF 변환용) — 4 섹션 ===
export function buildReportHTML(report) {
  const { range, summary, byAssignee, totals, year } = report;
  const today = new Date().toISOString().slice(0, 10);

  // ① 담당자별 PT 상세 섹션
  const ptDetailSectionsHtml = SETTLEMENT_ASSIGNEES.map(a => {
    const items = byAssignee[a].ptItems;
    const subSum = items.reduce((s, r) => s + r.amount, 0);
    if (items.length === 0) return '';
    const rows = items.map(r => {
      const resultColor = r.result === '승' ? '#16a34a' : r.result === '무' ? '#2563eb' : '#7c3aed';
      const resultBg = r.result === '승' ? '#dcfce7' : r.result === '무' ? '#dbeafe' : '#ede9fe';
      const exceptionBadge = r.isException
        ? (() => {
            const meta = EXCEPTION_TYPES[r.exceptionType] || { label: '예외', badge: { bg: '#fef3c7', text: '#92400e' } };
            return `<span style="display:inline-block;margin-left:4px;padding:1px 6px;background:${meta.badge.bg};color:${meta.badge.text};border-radius:6px;font-size:10px;font-weight:600;">예외승인 · ${meta.label}</span>`;
          })()
        : '';
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 12px;font-family:'Consolas',monospace;color:#475569;font-size:12px;font-weight:600;">${r.confirmDate}</td>
          <td style="padding:8px 12px;font-family:'Consolas',monospace;color:#94a3b8;font-size:11px;">${r.date}</td>
          <td style="padding:8px 12px;color:#1e293b;font-weight:500;font-size:12px;">${escapeHtml(r.siteName)}${exceptionBadge}</td>
          <td style="padding:8px 12px;text-align:center;"><span style="display:inline-block;padding:2px 8px;background:${resultBg};color:${resultColor};border-radius:8px;font-size:11px;font-weight:700;">${r.result}</span></td>
          <td style="padding:8px 12px;text-align:right;color:${r.amount > 0 ? '#1e293b' : '#94a3b8'};font-weight:600;font-size:12px;">${r.amount.toLocaleString()}원</td>
          <td style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;">${r.settlementStatus}</td>
        </tr>
      `;
    }).join('');
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
          <div style="font-size:13px;font-weight:700;color:#1e293b;">${escapeHtml(a)}</div>
          <div style="font-size:11px;color:#64748b;">${items.length}건 · <span style="color:#0F4C75;font-weight:600;">${subSum.toLocaleString()}원</span></div>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;color:#64748b;border-bottom:1px solid #e2e8f0;">
              <th style="padding:7px 12px;text-align:left;font-weight:600;font-size:11px;">확정일</th>
              <th style="padding:7px 12px;text-align:left;font-weight:600;font-size:11px;">PT일</th>
              <th style="padding:7px 12px;text-align:left;font-weight:600;font-size:11px;">단지명</th>
              <th style="padding:7px 12px;text-align:center;font-weight:600;font-size:11px;">결과</th>
              <th style="padding:7px 12px;text-align:right;font-weight:600;font-size:11px;">정산금액</th>
              <th style="padding:7px 12px;text-align:center;font-weight:600;font-size:11px;">상태</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  // ② 담당자 요약 행
  const summaryRowsHtml = summary.map(r => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 14px;font-weight:600;color:#1e293b;">${escapeHtml(r.assignee)}</td>
      <td style="padding:10px 14px;text-align:center;color:#475569;">${r.ptCount}건</td>
      <td style="padding:10px 14px;text-align:center;color:#16a34a;font-weight:700;">${r.ptWin}</td>
      <td style="padding:10px 14px;text-align:center;color:#2563eb;font-weight:700;">${r.ptDraw}</td>
      <td style="padding:10px 14px;text-align:center;color:#7c3aed;font-weight:700;">${r.ptSupport}</td>
      <td style="padding:10px 14px;text-align:right;color:#0F4C75;font-weight:700;">${r.settlementAmount.toLocaleString()}원</td>
      <td style="padding:10px 14px;text-align:center;color:#475569;font-weight:700;">${r.weekendCount || 0}회</td>
      <td style="padding:10px 14px;text-align:center;color:#b45309;font-weight:700;">${(r.annualLeaveDays || 0).toFixed(1)}일</td>
    </tr>
  `).join('');

  return `
<div style="width:1100px;background:#ffffff;font-family:-apple-system,'Pretendard','Malgun Gothic',sans-serif;color:#1e293b;line-height:1.5;">

  <!-- ===== 표지 ===== -->
  <div style="background:#ffffff;padding:40px 48px 28px;border-bottom:1px solid #e2e8f0;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:6px;">POUR영업운영시스템</div>
        <div style="font-size:28px;font-weight:700;color:#1e293b;letter-spacing:-0.5px;">${year}년 ${range.label} PT 실적 보고서</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">분기정산 대상 기준 집계</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;">
        <div>발송일 ${today}</div>
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:24px;font-size:13px;color:#475569;">
      <div><span style="color:#94a3b8;">기간</span> <span style="font-weight:600;color:#1e293b;margin-left:6px;">${range.start} ~ ${range.end}</span></div>
      <div><span style="color:#94a3b8;">수신</span> <span style="font-weight:600;color:#1e293b;margin-left:6px;">김유림 (yurim@netformrnd.com)</span></div>
    </div>
  </div>

  <!-- ===== ① 분기 요약 KPI ===== -->
  <div style="padding:24px 48px;background:#f8fafc;">
    <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.05em;margin-bottom:10px;">① 분기 요약</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">총 정산 대상 건수</div>
        <div style="font-size:28px;font-weight:700;color:#0F4C75;margin-top:8px;">${totals.ptCount}<span style="font-size:14px;color:#94a3b8;font-weight:500;margin-left:4px;">건</span></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">승/무/지원/감리 — 패·미입력 제외</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">결과 분포</div>
        <div style="font-size:20px;font-weight:700;margin-top:8px;">
          <span style="color:#16a34a;">승 ${totals.ptWin}</span>
          <span style="color:#94a3b8;margin:0 6px;">·</span>
          <span style="color:#2563eb;">무 ${totals.ptDraw}</span>
          <span style="color:#94a3b8;margin:0 6px;">·</span>
          <span style="color:#7c3aed;">지원 ${totals.ptSupport}</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">확정일 ${range.start} ~ ${range.end} 구간</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">총 정산금액</div>
        <div style="font-size:24px;font-weight:700;color:#0F4C75;margin-top:8px;">${totals.settlementAmount.toLocaleString()}<span style="font-size:14px;color:#94a3b8;font-weight:500;margin-left:4px;">원</span></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">승 × 50만 · 무/지원 × 25만</div>
      </div>
    </div>
  </div>

  <!-- ===== ② 담당자별 실적 ===== -->
  <div style="padding:24px 48px 8px;">
    <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.05em;margin-bottom:10px;">② 담당자별 실적</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;border-bottom:1px solid #e2e8f0;">
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">담당자</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">PT 건수</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">승</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">무</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">지원</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;font-size:12px;">정산금액</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">주말출근</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">연차환산<br/><span style="font-size:10px;color:#94a3b8;font-weight:500;">(1.5배)</span></th>
        </tr>
      </thead>
      <tbody>${summaryRowsHtml}</tbody>
      <tfoot>
        <tr style="background:#f8fafc;border-top:1px solid #cbd5e1;">
          <td style="padding:10px 14px;font-weight:700;color:#1e293b;">합계</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#475569;">${totals.ptCount}건</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#16a34a;">${totals.ptWin}</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#2563eb;">${totals.ptDraw}</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#7c3aed;">${totals.ptSupport}</td>
          <td style="padding:10px 14px;text-align:right;font-weight:700;color:#0F4C75;">${totals.settlementAmount.toLocaleString()}원</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#475569;">${totals.weekendCount || 0}회</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#b45309;">${(totals.annualLeaveDays || 0).toFixed(1)}일</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ===== ③ PT 상세 리스트 ===== -->
  <div style="padding:24px 48px 8px;">
    <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.05em;margin-bottom:10px;">③ PT 상세 리스트 — 담당자별</div>
    ${ptDetailSectionsHtml || '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;background:#f8fafc;border-radius:8px;">해당 분기 정산 대상 PT 없음</div>'}
  </div>

  <!-- ===== ④ PT 결과 판정 기준 ===== -->
  <div style="padding:24px 48px;">
    <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.05em;margin-bottom:10px;">④ PT 결과 판정 기준</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;border-bottom:1px solid #e2e8f0;">
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;width:80px;">결과</th>
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">기준</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;font-size:12px;width:160px;">정산 단가</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#dcfce7;color:#16a34a;border-radius:8px;font-size:11px;font-weight:700;">승</span></td>
          <td style="padding:10px 14px;color:#475569;">POUR 공법 단독 입찰 — 경쟁 공법 없음</td>
          <td style="padding:10px 14px;text-align:right;color:#1e293b;font-weight:600;">500,000원</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#dbeafe;color:#2563eb;border-radius:8px;font-size:11px;font-weight:700;">무</span></td>
          <td style="padding:10px 14px;color:#475569;">POUR 공법 + 타공법 동시 입찰</td>
          <td style="padding:10px 14px;text-align:right;color:#1e293b;font-weight:600;">250,000원</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#ede9fe;color:#7c3aed;border-radius:8px;font-size:11px;font-weight:700;">지원</span></td>
          <td style="padding:10px 14px;color:#475569;">한 현장 2명 이상 — 주영업 외 지원<br /><span style="font-size:11px;color:#94a3b8;">주담당자 패배 시 지원자도 0원</span></td>
          <td style="padding:10px 14px;text-align:right;color:#1e293b;font-weight:600;">250,000원</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:11px;font-weight:700;">패</span></td>
          <td style="padding:10px 14px;color:#475569;">POUR 공법 미입찰</td>
          <td style="padding:10px 14px;text-align:right;color:#94a3b8;font-weight:600;">0원</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#f1f5f9;color:#475569;border-radius:8px;font-size:11px;font-weight:700;">감리</span></td>
          <td style="padding:10px 14px;color:#475569;">감리 공종 (공고문 요구 없음)</td>
          <td style="padding:10px 14px;text-align:right;color:#1e293b;font-weight:600;">수동 입력 금액</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:10px;font-size:11px;color:#94a3b8;line-height:1.6;">
      ※ 집계 기준: 관리자 분기정산 화면과 동일 (정산요청/수동검증 · 완료 제외)<br />
      ※ 협약사 자체PT · 본인영업 건은 정산 대상에서 제외 (0원)<br />
      ※ 취소공고 건은 집계 제외
    </div>
  </div>

  <!-- ===== 푸터 ===== -->
  <div style="padding:20px 48px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center;">
    POUR영업운영시스템 · 자동 생성 보고서 · 상세 데이터는 첨부 Excel 파일 참조
  </div>

</div>
  `;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// === 다운로드 헬퍼 ===
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// === HTML → PDF ===
async function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const sc = document.createElement('script');
    sc.src = src;
    sc.onload = resolve;
    sc.onerror = reject;
    document.head.appendChild(sc);
  });
}

export async function generateAndDownloadPDF(report, filename) {
  if (!window.html2canvas) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }
  if (!window.jspdf) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '0';
  container.style.background = '#fff';
  container.innerHTML = buildReportHTML(report);
  document.body.appendChild(container);

  try {
    const canvas = await window.html2canvas(container.firstElementChild, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

// === Mailto 링크 ===
export function buildMailtoLink(report, recipient = 'yurim@netformrnd.com') {
  const { year, range, totals } = report;
  const subject = `[POUR영업운영시스템] ${year}년 ${range.label} PT 실적 보고서`;
  const body = [
    `안녕하세요 김유림님,`,
    ``,
    `${year}년 ${range.label} (${range.start} ~ ${range.end}) PT 실적 보고서를 송부드립니다.`,
    ``,
    `■ 분기 요약`,
    `  · 총 정산 대상 건수: ${totals.ptCount}건 (승 ${totals.ptWin} / 무 ${totals.ptDraw} / 지원 ${totals.ptSupport})`,
    `  · 총 정산금액: ${totals.settlementAmount.toLocaleString()}원`,
    ``,
    `■ 첨부파일 (수동 첨부 부탁드립니다)`,
    `  1. POUR_분기보고서_${year}_${range.label}.xlsx`,
    `  2. POUR_분기보고서_${year}_${range.label}.pdf`,
    ``,
    `※ 집계 기준: 관리자 분기정산 화면과 동일 (정산요청/수동검증 · 완료 제외)`,
    `※ 자체PT · 본인영업 · 취소공고 건은 정산 제외`,
    `※ 정산 담당자: 황윤선, 이필선, 한준엽, 조재연, 정정훈, 김성민`,
    ``,
    `감사합니다.`,
    `POUR영업운영시스템`,
  ].join('\r\n');
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
