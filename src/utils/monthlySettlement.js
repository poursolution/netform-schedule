// 월정산 자동 집계 (P5)
// 마지막주 월요일 09:00 기준 월 단위 정산 레코드 생성.
//
// 운영 흐름:
//   1. cron or 수동 트리거 → runMonthlySettlement(targetMonth)
//   2. 해당 월 PT 전부 조회
//   3. 담당자별로 분류 → 승/무/지원/제외/검토필요 카운트 + 예상금액
//   4. Firebase monthlySettlements/{monthKey}/{assignee} 저장
//   5. 잔디 웹훅으로 담당자/관리자 알림

import { calculateSettlementAmount, getSettlementStatus, isSettlementEligible, SETTLEMENT_STATUS } from './settlement.js';

/**
 * targetMonth: "YYYY-MM" 형식 (예: "2026-04")
 * ptList: 전체 PT 배열 (pt.date 필드 기준 필터)
 * assigneeList: 정산 대상 담당자 이름 배열 (settlement 제외: admin 등)
 */
export function runMonthlySettlement(targetMonth, ptList, assigneeList, opts = {}) {
  if (!targetMonth || !Array.isArray(ptList)) {
    throw new Error('targetMonth (YYYY-MM) 및 ptList 필요');
  }
  const now = new Date().toISOString();
  const generatedBy = opts.generatedBy || 'system';

  // 담당자별 집계
  const perAssignee = {};  // { [assignee]: { totalCount, winCount, drawCount, supportCount, excludedCount, reviewCount, estimatedAmount, items } }

  for (const assignee of assigneeList) {
    perAssignee[assignee] = {
      monthKey: targetMonth,
      assignee,
      totalCount: 0,
      winCount: 0,
      drawCount: 0,
      supportCount: 0,
      excludedCount: 0,
      reviewCount: 0,
      estimatedAmount: 0,
      status: 'draft',
      generatedAt: now,
      generatedBy,
      items: [],  // 상세: [{ ptId, siteName, date, result, amount, status, reason }]
    };
  }

  // PT 순회 — targetMonth 에 해당하는 것만
  for (const pt of ptList) {
    if (!pt?.date?.startsWith(targetMonth)) continue;
    // 참여자 토큰
    const tokens = (pt.ptAssignee || '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean);
    for (const assignee of tokens) {
      if (!perAssignee[assignee]) continue;  // 대상 외

      const calc = calculateSettlementAmount(pt, assignee);
      const status = getSettlementStatus(pt, assignee);
      const agg = perAssignee[assignee];

      const item = {
        ptId: pt.id,
        siteName: pt.siteName,
        date: pt.date,
        result: calc.result,
        amount: calc.amount,
        status,
        reason: calc.reason || null,
      };
      agg.items.push(item);
      agg.totalCount++;

      if (status === SETTLEMENT_STATUS.EXCLUDED) {
        agg.excludedCount++;
        continue;
      }
      if (status === SETTLEMENT_STATUS.NEEDS_REVIEW) {
        agg.reviewCount++;
        // 검토필요도 예상금액에 포함 (현 시점 계산값)
        agg.estimatedAmount += calc.amount;
      } else {
        agg.estimatedAmount += calc.amount;
      }

      if (calc.result === '승') agg.winCount++;
      else if (calc.result === '무') agg.drawCount++;
      else if (calc.result === '지원') agg.supportCount++;
    }
  }

  // 전체 summary (관리자용)
  const totals = {
    monthKey: targetMonth,
    totalAssignees: 0,
    totalCount: 0,
    totalEstimated: 0,
    totalReview: 0,
    generatedAt: now,
    generatedBy,
  };
  for (const agg of Object.values(perAssignee)) {
    if (agg.totalCount === 0) continue;
    totals.totalAssignees++;
    totals.totalCount += agg.totalCount;
    totals.totalEstimated += agg.estimatedAmount;
    totals.totalReview += agg.reviewCount;
  }

  return { perAssignee, totals };
}

// ===== 잔디 알림 메시지 포맷 =====

export function buildAssigneeMonthlyMessage(agg) {
  const amountStr = (agg.estimatedAmount || 0).toLocaleString('ko-KR') + '원';
  return {
    body: `[${agg.monthKey} 정산 안내]`,
    connectColor: '#2563eb',
    connectInfo: [{
      title: `담당자: ${agg.assignee}`,
      description: [
        `정산대상: ${agg.totalCount}건`,
        `승 ${agg.winCount} / 무 ${agg.drawCount} / 지원 ${agg.supportCount}`,
        `예상 정산금액: ${amountStr}`,
        `검토필요: ${agg.reviewCount}건`,
        '',
        '👉 시스템에서 정산요청 상태를 확인해주세요.',
      ].join('\n'),
    }],
  };
}

export function buildAdminMonthlyMessage(totals, perAssignee) {
  const amountStr = (totals.totalEstimated || 0).toLocaleString('ko-KR') + '원';
  const perList = Object.values(perAssignee)
    .filter(a => a.totalCount > 0)
    .sort((a, b) => b.estimatedAmount - a.estimatedAmount)
    .map(a => `${a.assignee}: ${a.totalCount}건 · 예상 ${(a.estimatedAmount || 0).toLocaleString('ko-KR')}원 (검토 ${a.reviewCount})`)
    .slice(0, 15);
  return {
    body: `[${totals.monthKey} 월정산 생성 완료 — 관리자 확인 필요]`,
    connectColor: '#dc2626',
    connectInfo: [{
      title: `총 ${totals.totalAssignees}명 · ${totals.totalCount}건 · 예상 ${amountStr}`,
      description: [
        `검토필요 합계: ${totals.totalReview}건`,
        '',
        '담당자별:',
        ...perList,
        '',
        '👉 관리자 월정산 화면에서 정산확정/완료 처리하세요.',
      ].join('\n'),
    }],
  };
}
