import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderQuarterKey, quarterDeadline } from '../src/utils/reminderQuarter.js';

// KST 시각 → Date
const kst = (s) => new Date(new Date(s + '+09:00').getTime());

test('리마인드 대상 분기 — 분기 초·중반엔 지난 분기(마감 전까지), 마지막 달엔 이번 분기', () => {
  assert.equal(reminderQuarterKey(kst('2026-10-29T09:00:00')), '2026-Q3');   // Q3 마감 10/30 전
  assert.equal(reminderQuarterKey(kst('2026-10-31T09:00:00')), null);         // Q3 마감 지남, Q4 는 아직 진행 중
  assert.equal(reminderQuarterKey(kst('2026-11-15T17:00:00')), null);
  assert.equal(reminderQuarterKey(kst('2026-12-28T09:00:00')), '2026-Q4');   // 분기 마지막 달(정산 생성 후)
  assert.equal(reminderQuarterKey(kst('2027-01-20T09:00:00')), '2026-Q4');   // Q4 마감 1/30 전
  assert.equal(reminderQuarterKey(kst('2027-02-01T09:00:00')), null);
});

test('분기 마감일 — 분기 다음 달 30일', () => {
  assert.equal(quarterDeadline('2026-Q3').toISOString().slice(0, 10), '2026-10-30');
  assert.equal(quarterDeadline('2026-Q4').toISOString().slice(0, 10), '2027-01-30');
  assert.equal(quarterDeadline('bad'), null);
});
