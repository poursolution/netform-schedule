import { calculateSettlementAmount } from './settlement.js';

export const SETTLEMENT_ASSIGNEES = [
  '황윤선', '이필선', '한준엽', '조재연', '정정훈', '김성민',
];

export const SETTLEMENT_ASSIGNEE_SET = new Set(SETTLEMENT_ASSIGNEES);

const EXCLUDED_REASONS = new Set([
  'loss',
  'vendor_self_pt',
  'self_sales',
  'draw_support_excluded',
  'cancelled_notice',
  'settlement_excluded',
]);

export function parseAssigneeTokens(value) {
  return [...new Set(
    String(value || '')
      .split(/[\/,+&;\n]/)
      .map(t => t.trim())
      .filter(Boolean)
  )];
}

export function parseQuarterKey(quarterKey) {
  const m = String(quarterKey || '').match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const quarter = parseInt(m[2], 10);
  return {
    year,
    quarter,
    startMonth: (quarter - 1) * 3 + 1,
    endMonth: quarter * 3,
  };
}

export function getQuarterBounds(quarterKey) {
  const parsed = parseQuarterKey(quarterKey);
  if (!parsed) return null;
  const start = `${parsed.year}-${String(parsed.startMonth).padStart(2, '0')}-01`;
  const endDay = parsed.endMonth === 3 || parsed.endMonth === 12 ? 31 : 30;
  const end = `${parsed.year}-${String(parsed.endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  return { ...parsed, start, end };
}

export function isQuarterSettlementTarget(pt, assignee, quarterKey, opts = {}) {
  if (!pt || !assignee || !quarterKey) return false;
  if (pt.selfPT) return false;
  if (!pt.date) return false;
  if (!SETTLEMENT_ASSIGNEE_SET.has(assignee)) return false;

  const bounds = getQuarterBounds(quarterKey);
  if (!bounds) return false;

  const inRange = pt.date >= bounds.start && pt.date <= bounds.end;
  const carryoverExcluded = new Set(opts.carryoverExcludedAssignees || []);
  // 이전 분기에서 지급되지 않은 정산요청 건은 완료 처리될 때까지 이월한다.
  const includeLegacyCarryover = opts.includeLegacyCarryover === true
    && pt.date < bounds.start
    && !carryoverExcluded.has(assignee);
  if (!inRange && !includeLegacyCarryover) return false;

  const stl = pt.settlement?.[assignee] || {};
  if (!(stl.requested === true || stl.manualVerified === true)) return false;
  if (stl.completed === true || stl.status === 'completed') return false;
  if (stl.superseded === true || stl.status === 'superseded') return false;
  const calc = calculateSettlementAmount(pt, assignee);
  if (!calc.result || EXCLUDED_REASONS.has(calc.reason)) return false;
  return true;
}

export function aggregateQuarterSettlement(ptSchedules, quarterKey, opts = {}) {
  if (!Array.isArray(ptSchedules) || !parseQuarterKey(quarterKey)) return null;

  const perAssignee = {};
  for (const pt of ptSchedules) {
    const tokens = parseAssigneeTokens(pt?.ptAssignee);
    for (const assignee of tokens) {
      if (!isQuarterSettlementTarget(pt, assignee, quarterKey, opts)) continue;

      const stl = pt.settlement?.[assignee] || {};
      const calc = calculateSettlementAmount(pt, assignee);
      if (!calc.result) continue;
      if (EXCLUDED_REASONS.has(calc.reason)) continue;

      if (!perAssignee[assignee]) {
        perAssignee[assignee] = {
          assignee,
          quarterKey,
          totalCount: 0,
          winCount: 0,
          drawCount: 0,
          supportCount: 0,
          supervisionPendingCount: 0,
          excludedCount: 0,
          reviewCount: 0,
          estimatedAmount: 0,
          status: opts.defaultStatus || 'draft',
          items: [],
        };
      }

      const agg = perAssignee[assignee];
      agg.totalCount++;
      agg.items.push({
        ptId: pt.id,
        siteName: pt.siteName,
        ptDate: pt.date,
        result: calc.result,
        amount: calc.amount,
        reason: calc.reason || null,
      });

      if (calc.reason === 'supervision_pending_input') {
        agg.supervisionPendingCount++;
      }

      const needsReview = pt.kaptVerified?.status === 'needs_review'
        && !(pt.evidenceFiles && Object.keys(pt.evidenceFiles).length > 0)
        && stl.manualVerified !== true;
      if (needsReview) agg.reviewCount++;

      agg.estimatedAmount += calc.amount || 0;
      if (calc.result === '승') agg.winCount++;
      else if (calc.result === '무') agg.drawCount++;
      else if (calc.result === '지원') agg.supportCount++;
    }
  }

  const rows = Object.values(perAssignee);
  const totals = {
    quarterKey,
    totalAssignees: rows.length,
    totalCount: rows.reduce((s, x) => s + x.totalCount, 0),
    totalEstimated: rows.reduce((s, x) => s + x.estimatedAmount, 0),
    totalReview: rows.reduce((s, x) => s + x.reviewCount, 0),
    totalSupervisionPending: rows.reduce((s, x) => s + (x.supervisionPendingCount || 0), 0),
    aggregationBasis: 'quarterlySettlementCore',
  };

  return { perAssignee, totals };
}
