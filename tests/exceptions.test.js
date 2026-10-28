import test from 'node:test';
import assert from 'node:assert/strict';
import { exceptionWaitDays, exceptionKey, exceptionSummary } from '../src/utils/exceptions.js';

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
