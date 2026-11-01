import test from 'node:test';
import assert from 'node:assert/strict';
import { exceptionWaitDays, exceptionKey, exceptionSummary, approvedWinAmount, buildExceptionDecisionPatch } from '../src/utils/exceptions.js';
import { calculateSettlementAmount, getSettlementStatus, shouldAutoTransitionToTarget } from '../src/utils/settlement.js';
import { aggregateQuarterSettlement } from '../src/utils/quarterlySettlementCore.js';
import { calcAmountWorker } from '../cloudflare-worker/src/index.js';

const approved = { status: 'approved', type: 'tie_to_win', reviewedBy: '관리자' };
const pending = { status: 'pending', type: 'tie_to_win', reason: '영업 조건' };

test('예외 승인 = 승 · 단독 50만 (앱·Worker 같은 금액), 대기·거절은 원래 결과', () => {
  const base = { id: 'p1', date: '2026-10-10', siteName: 'A', ptAssignee: '김성민', result: '무' };
  for (const [req, amount, result] of [[approved, 500000, '승'], [pending, 250000, '무'], [{ ...approved, status: 'rejected' }, 250000, '무']]) {
    const pt = { ...base, exceptionRequests: { 김성민: req } };
    assert.equal(calculateSettlementAmount(pt, '김성민').amount, amount);
    assert.equal(calculateSettlementAmount(pt, '김성민').result, result);
    assert.equal(calcAmountWorker(pt, '김성민').amount, amount, 'Worker 도 같아야 함');
  }
});

test('예외 승인 — 여러 명 PT는 승 분할 25만, 지원자 예외승인은 지원 25만, 본인영업은 그대로 0', () => {
  const multi = { id: 'p2', date: '2026-10-10', ptAssignee: '김성민/정정훈', results: { 김성민: '무', 정정훈: '지원' }, exceptionRequests: { 김성민: approved } };
  assert.equal(calculateSettlementAmount(multi, '김성민').amount, 250000);
  assert.equal(calcAmountWorker(multi, '김성민').amount, 250000);
  const sup = { ...multi, exceptionRequests: { 정정훈: approved } };
  assert.equal(calculateSettlementAmount(sup, '정정훈').result, '지원');
  assert.equal(calcAmountWorker(sup, '정정훈').result, '지원');
  const self = { id: 'p3', date: '2026-10-10', ptAssignee: '김성민', result: '패', settlement: { 김성민: { selfSales: true } }, exceptionRequests: { 김성민: approved } };
  assert.equal(calculateSettlementAmount(self, '김성민').amount, 0);
  assert.equal(approvedWinAmount({ ...self, exceptionRequests: {} }, '김성민'), 0);
});

test('예외 승인은 K-APT 검토필요를 통과로 — 상태·자동 전환·분기정산 집계', () => {
  const pt = { id: 'p4', date: '2026-10-10', siteName: 'B', ptAssignee: '김성민', result: '무', kaptVerified: { status: 'needs_review' }, exceptionRequests: { 김성민: approved } };
  assert.notEqual(getSettlementStatus(pt, '김성민'), 'needs_review');
  assert.equal(shouldAutoTransitionToTarget(pt, '김성민'), true);
  // 승인만으로는 분기정산 대상이 아님 — 승인 저장 시 requested 가 같이 들어감
  assert.equal(aggregateQuarterSettlement([pt], '2026-Q4').perAssignee['김성민'], undefined);
  const saved = { ...pt, settlement: { 김성민: { requested: true, manualVerified: true } } };
  const agg = aggregateQuarterSettlement([saved], '2026-Q4');
  assert.equal(agg.perAssignee['김성민'].estimatedAmount, 500000);
  assert.equal(agg.perAssignee['김성민'].reviewCount, 0);
});

test('승인 저장 patch — 예외 상태 + 정산 대상 전환 + 되돌리기 patch, 지급된 건은 정산 상태 보존', () => {
  const pt = { id: 'p5', date: '2026-10-10', ptAssignee: '김성민', result: '무', exceptionRequests: { 김성민: pending }, settlement: { 김성민: { calculatedAmount: 250000 } } };
  const at = '2026-11-01T00:00:00.000Z';
  const { patch, undo } = buildExceptionDecisionPatch(pt, '김성민', 'approved', { reviewedBy: '관리자', at });
  assert.equal(patch['exceptionRequests/김성민'].status, 'approved');
  assert.equal(patch['settlement/김성민/requested'], true);
  assert.equal(patch['settlement/김성민/manualVerified'], true);
  assert.equal(patch['settlement/김성민/calculatedAmount'], 500000);
  assert.deepEqual(undo['exceptionRequests/김성민'], pending);
  assert.equal(undo['settlement/김성민/calculatedAmount'], 250000);
  assert.equal(undo['settlement/김성민/requested'], null);

  const paid = { ...pt, settlement: { 김성민: { completed: true, status: 'completed' } } };
  const p2 = buildExceptionDecisionPatch(paid, '김성민', 'approved', { reviewedBy: '관리자', at }).patch;
  assert.equal(p2['settlement/김성민/requested'], undefined);
  assert.equal(p2['settlement/김성민/status'], undefined);
  assert.equal(p2['settlement/김성민/calculatedAmount'], undefined, '지급된 건은 금액 캐시도 그대로');

  const rej = buildExceptionDecisionPatch(pt, '김성민', 'rejected', { reviewedBy: '관리자', reviewNote: '근거 부족', at }).patch;
  assert.deepEqual(Object.keys(rej), ['exceptionRequests/김성민']);
  assert.equal(rej['exceptionRequests/김성민'].reviewNote, '근거 부족');
});

test('예외 신청 대기일 — 날짜 기준, 잘못된 값은 0', () => {
  const now = new Date(2026, 9, 29, 9, 0);
  assert.equal(exceptionWaitDays('2026-10-27T23:50:00', now), 2);
  assert.equal(exceptionWaitDays('2026-07-20T10:00:00', now), 101);
  assert.equal(exceptionWaitDays('', now), 0);
  assert.equal(exceptionWaitDays('nope', now), 0);
});

test('예외 승인 큐 요약 — 대기·승인·거절 건수와 승인 정산 합계', () => {
  const items = [
    { scheduleId: 'a', assignee: '김성민' },
    { scheduleId: 'b', assignee: '한준엽' },
    { scheduleId: 'c', assignee: '이필선' },
  ];
  const dec = { [exceptionKey(items[0])]: 'ok', [exceptionKey(items[1])]: 'no' };
  assert.deepEqual(exceptionSummary(items, dec, () => 250000), { pending: 1, ok: 1, no: 1, amount: 250000 });
  assert.deepEqual(exceptionSummary(items, {}), { pending: 3, ok: 0, no: 0, amount: 0 });
});
