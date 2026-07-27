import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSettlementAmount,
  getAssigneeQuarterKey,
  getQuarterClosingDate,
  getSettlementStatus,
  SETTLEMENT_STATUS,
} from '../src/utils/settlement.js';
import { getSettlementQuarterForPt } from '../src/utils/quarterlyReport.js';
import {
  aggregateQuarterSettlement,
  isQuarterSettlementTarget,
  parseAssigneeTokens,
} from '../src/utils/quarterlySettlementCore.js';
import {
  calcAmountWorker,
} from '../cloudflare-worker/src/index.js';

function makePt(overrides = {}) {
  return {
    id: 'pt-1',
    date: '2026-05-10',
    siteName: '테스트 아파트',
    ptAssignee: '한준엽',
    result: '승',
    kaptVerified: { status: 'verified' },
    settlement: {
      한준엽: { requested: true, status: 'requested' },
    },
    ...overrides,
  };
}

test('client and Worker use 250,000 won for a multi-assignee win', () => {
  const pt = makePt({
    ptAssignee: '한준엽/조재연',
    results: { 한준엽: '승', 조재연: '지원' },
  });

  assert.equal(calculateSettlementAmount(pt, '한준엽').amount, 250000);
  assert.equal(calcAmountWorker(pt, '한준엽').amount, 250000);
});

test('supporter is not payable before the main assignee result is entered', () => {
  const pt = makePt({
    ptAssignee: '한준엽/조재연',
    result: null,
    results: { 조재연: '지원' },
    settlement: {
      조재연: { requested: true },
    },
  });

  assert.equal(calculateSettlementAmount(pt, '조재연').result, null);
  assert.equal(calcAmountWorker(pt, '조재연').result, null);
});

test('settlement-excluded and cancelled records are excluded in both calculators', () => {
  const excluded = makePt({
    settlement: {
      한준엽: {
        requested: true,
        status: 'requested',
        settlementExcluded: true,
      },
    },
  });
  const cancelled = makePt({ kaptVerified: { status: 'cancelled' } });

  for (const pt of [excluded, cancelled]) {
    assert.equal(calculateSettlementAmount(pt, '한준엽').amount, 0);
    assert.equal(calcAmountWorker(pt, '한준엽').amount, 0);
    assert.equal(isQuarterSettlementTarget(pt, '한준엽', '2026-Q2'), false);
  }
});

test('settlement exclusion overrides a stale requested status', () => {
  const pt = makePt({
    settlement: {
      한준엽: {
        requested: true,
        status: 'requested',
        settlementExcluded: true,
      },
    },
  });

  assert.equal(getSettlementStatus(pt, '한준엽'), SETTLEMENT_STATUS.EXCLUDED);
});

test('completed status alone prevents a record from returning to a quarter', () => {
  const pt = makePt({
    settlement: {
      한준엽: { requested: true, status: 'completed' },
    },
  });

  assert.equal(isQuarterSettlementTarget(pt, '한준엽', '2026-Q2'), false);
});

test('quarter attribution is based on PT date, not request date', () => {
  const pt = makePt({
    date: '2026-03-15',
    settlement: {
      한준엽: {
        requested: true,
        requestedAt: '2026-05-05T09:00:00.000Z',
      },
    },
  });

  assert.equal(getAssigneeQuarterKey(pt, '한준엽'), '2026-Q1');
  assert.deepEqual(getSettlementQuarterForPt(pt.date, '2026-05-05'), { year: 2026, quarter: 1 });
  assert.equal(isQuarterSettlementTarget(pt, '한준엽', '2026-Q1'), true);
  assert.equal(isQuarterSettlementTarget(pt, '한준엽', '2026-Q2'), false);
});

test('an unpaid prior-quarter request carries into the current quarter', () => {
  const priorQuarterPt = makePt({
    date: '2026-03-24',
    settlement: {
      한준엽: {
        requested: true,
        requestedAt: '2026-03-25T09:00:00.000Z',
      },
    },
  });

  assert.equal(
    isQuarterSettlementTarget(priorQuarterPt, '한준엽', '2026-Q2', {
      includeLegacyCarryover: true,
    }),
    true,
  );
  const result = aggregateQuarterSettlement([priorQuarterPt], '2026-Q2', {
    includeLegacyCarryover: true,
  });
  assert.equal(result.totals.totalCount, 1);
  assert.equal(result.totals.totalEstimated, 500000);
});

test('a paid prior-quarter request never carries into the current quarter', () => {
  const paidPriorQuarterPt = makePt({
    date: '2026-03-24',
    settlement: {
      한준엽: {
        requested: true,
        completed: true,
        status: 'completed',
      },
    },
  });

  assert.equal(
    isQuarterSettlementTarget(paidPriorQuarterPt, '한준엽', '2026-Q2', {
      includeLegacyCarryover: true,
    }),
    false,
  );
});

test('quarter confirmation deadline is the 30th of the following month', () => {
  const q2Deadline = getQuarterClosingDate('2026-Q2');
  assert.equal(q2Deadline.getFullYear(), 2026);
  assert.equal(q2Deadline.getMonth() + 1, 7);
  assert.equal(q2Deadline.getDate(), 30);
});

test('excluded records do not affect quarter count or amount', () => {
  const normal = makePt();
  const excluded = makePt({
    id: 'pt-2',
    settlement: {
      한준엽: { requested: true, settlementExcluded: true },
    },
  });

  const result = aggregateQuarterSettlement([normal, excluded], '2026-Q2');
  assert.equal(result.totals.totalCount, 1);
  assert.equal(result.totals.totalEstimated, 500000);
});

test('duplicate assignee tokens cannot duplicate a settlement payout', () => {
  const pt = makePt({ ptAssignee: '한준엽/한준엽; 한준엽' });

  assert.deepEqual(parseAssigneeTokens(pt.ptAssignee), ['한준엽']);
  const result = aggregateQuarterSettlement([pt], '2026-Q2');
  assert.equal(result.totals.totalCount, 1);
  assert.equal(result.totals.totalEstimated, 500000);
  assert.equal(calcAmountWorker(pt, '한준엽').amount, 500000);
});
