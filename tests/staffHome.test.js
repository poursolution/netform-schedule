import test from 'node:test';
import assert from 'node:assert/strict';
import { todoItems, easyStatus, quarterMoney, yearRecord, finalConfirmBlockers, confirmStage, prevQuarterKeys } from '../src/utils/staffHome.js';

const today = '2026-10-28';

test('지금 할 일: 주담 PT 중 지난 미입력 + 검토필요, 지원 PT는 제외', () => {
  const pts = [
    { id: 'a', date: '2026-10-27', ptAssignee: '김성민' },                                   // 미입력
    { id: 'b', date: '2026-10-29', ptAssignee: '김성민' },                                   // 미래 — 제외
    { id: 'c', date: '2026-10-20', ptAssignee: '조재연/김성민' },                            // 지원 — 제외
    { id: 'd', date: '2026-10-10', ptAssignee: '김성민', result: '승', kaptVerified: { status: 'needs_review' } },
    { id: 'e', date: '2026-10-11', ptAssignee: '김성민', result: '승', kaptVerified: { status: 'pending-admin-review' } },
    { id: 'f', date: '2026-10-12', ptAssignee: '김성민', result: '승', kaptVerified: { status: 'verified' } },
  ];
  const t = todoItems(pts, '김성민', today);
  assert.deepEqual(t.map(x => [x.pt.id, x.kind, !!x.sent]), [['a', 'pending', false], ['e', 'review', true], ['d', 'review', false]]);
});

test('쉬운 상태 라벨', () => {
  assert.equal(easyStatus({ date: '2026-10-27', ptAssignee: 'A' }, 'A', today).label, '결과 입력 필요');
  assert.equal(easyStatus({ date: '2026-11-01', ptAssignee: 'A' }, 'A', today).label, '예정');
  assert.equal(easyStatus({ date: '2026-10-01', ptAssignee: 'A', result: '패' }, 'A', today).label, '지급 대상 아님');
  assert.equal(easyStatus({ date: '2026-10-01', ptAssignee: 'A', result: '승', settlement: { A: { requested: true } } }, 'A', today).label, '지급 대기');
  assert.equal(easyStatus({ date: '2026-10-01', ptAssignee: 'A', result: '승', settlement: { A: { completed: true } } }, 'A', today).label, '지급 완료');
});

test('분기 받을 금액: 확정/대기/확인 중 + 승·무·지원 건수', () => {
  const now = new Date('2026-10-28T12:00:00');
  const pts = [
    { date: '2026-08-01', ptAssignee: 'A', result: '승', settlement: { A: { confirmed: true } } },
    { date: '2026-08-02', ptAssignee: 'A', result: '무', settlement: { A: { requested: true } } },
    { date: '2026-08-03', ptAssignee: 'A', result: '승' },
    { date: '2026-08-04', ptAssignee: 'A', result: '패' },
    { date: '2026-10-05', ptAssignee: 'A', result: '승' }, // 다른 분기
  ];
  const m = quarterMoney(pts, 'A', '2026-Q3', now);
  assert.deepEqual([m.confirmed, m.waiting, m.checking, m.total, m.w, m.d], [500000, 250000, 500000, 750000, 2, 1]);
});

test('올해 성적 승률은 무 제외', () => {
  const pts = [
    { date: '2026-01-01', ptAssignee: 'A', result: '승' },
    { date: '2026-02-01', ptAssignee: 'A', result: '무' },
    { date: '2026-03-01', ptAssignee: 'A', result: '패' },
    { date: '2026-04-01', ptAssignee: 'A' },
  ];
  const r = yearRecord(pts, 'A', 2026);
  assert.deepEqual([r.w, r.d, r.l, r.p, r.rate], [1, 1, 1, 1, 50]);
});

test('최종 확정 차단 기준·확인 단계·지난 분기', () => {
  const pts = [
    { ptAssignee: 'A', result: '승' },
    { ptAssignee: 'A', result: '승', kaptVerified: { status: 'verified' } },
    { ptAssignee: 'B/A', results: { A: '지원' } },
  ];
  const b = finalConfirmBlockers(pts, 'A');
  assert.equal(b.unverified.length, 2);
  assert.equal(b.waitingSupport.length, 1);
  assert.equal(confirmStage({ confirmed: true }), 'ok');
  assert.equal(confirmStage({ confirmed: true, finalRequestedAt: 'x' }), 'final-pending');
  assert.deepEqual(prevQuarterKeys('2026-Q1', 2), ['2025-Q4', '2025-Q3']);
});
