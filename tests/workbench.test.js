import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRow, FILTERS, kpis, settlementTargets, staffStats, quarterMeta, quarterPts, sortByPriority, sortByDate, matchesWho, isPtOver,
  settlementStep, nextReviewId,
} from '../src/utils/workbench.js';

const TODAY = '2026-10-28';

const pts = [
  { id: 'a', date: '2026-10-26', ptAssignee: '김성민', results: { 김성민: '승' }, kaptVerified: { status: 'needs_review' } },
  { id: 'b', date: '2026-10-20', ptAssignee: '한준엽', results: { 한준엽: '승' }, kaptVerified: { status: 'verified' }, settlement: { 한준엽: { requested: true } } },
  { id: 'c', date: '2026-10-19', ptAssignee: '조재연/한준엽', results: { 조재연: '무', 한준엽: '지원' }, kaptVerified: { status: 'verified' } },
  { id: 'd', date: '2026-10-18', ptAssignee: '이필선', results: { 이필선: '패' } },
  { id: 'e', date: '2026-10-11', ptAssignee: '김성민' },
  { id: 'f', date: '2026-11-04', ptAssignee: '조재연' },
  { id: 'g', date: '2026-07-02', ptAssignee: '김성민', results: { 김성민: '승' }, kaptVerified: { status: 'verified' } },
];

test('row uses the main assignee and settlement.js status and amount', () => {
  const a = buildRow(pts[0], TODAY);
  assert.equal(a.main, '김성민');
  assert.equal(a.stl, 'needs_review');
  assert.equal(a.amount, 500000);
  assert.equal(a.isReview, true);

  const c = buildRow(pts[2], TODAY);
  assert.equal(c.multi, true);
  assert.deepEqual(c.sups, ['한준엽']);
  assert.equal(c.amount, 250000);
});

test('pending means no result and PT date not after today; future PTs are not pending', () => {
  assert.equal(buildRow(pts[4], TODAY).isPending, true);
  const f = buildRow(pts[5], TODAY);
  assert.equal(f.isPending, false);
  assert.equal(f.isFuture, true);
});

test('win rate excludes draws', () => {
  const rows = pts.slice(0, 6).map(p => buildRow(p, TODAY));
  const k = kpis(rows);
  assert.deepEqual([k.w, k.d, k.l, k.p], [2, 1, 1, 2]);
  assert.equal(k.rate, 67); // 2 / (2 + 1)
});

test('quarter filter follows the PT date', () => {
  assert.equal(quarterPts(pts, '2026-Q4').length, 6);
  assert.equal(quarterPts(pts, '2026-Q3').length, 1);
});

test('settlement targets count every participant and skip excluded ones', () => {
  const t = settlementTargets(quarterPts(pts, '2026-Q4'));
  // a 500k(검토필요) + b 500k(요청) + c 조재연 무 250k ; c 한준엽 지원은 주담 무 → 제외, d 패 제외
  assert.equal(t.count, 3);
  assert.equal(t.amount, 1250000);
  assert.equal(t.byStatus.excluded, 2);
  assert.equal(t.byStatus.needs_review, 1);
});

test('filters and who-matching include supporters', () => {
  const rows = pts.map(p => buildRow(p, TODAY));
  assert.equal(rows.filter(FILTERS.sup).length, 1);
  assert.equal(rows.filter(FILTERS.requested).length, 1);
  assert.equal(rows.filter(r => matchesWho(r, '한준엽')).length, 2);
});

test('priority sort puts review, then pending, then requested first', () => {
  const rows = sortByPriority(pts.slice(0, 5).map(p => buildRow(p, TODAY)));
  assert.deepEqual(rows.slice(0, 3).map(r => r.id), ['a', 'e', 'b']);
});

test('staff stats use the supporter rule and win rate without draws', () => {
  const s = staffStats(quarterPts(pts, '2026-Q4'), ['한준엽', '김성민']);
  const han = s.find(x => x.name === '한준엽');
  assert.deepEqual([han.w, han.d, han.l], [1, 0, 0]);
  assert.equal(han.est, 500000); // 지원 건은 주담 무 → 제외
  const kim = s.find(x => x.name === '김성민');
  assert.equal(kim.p, 1);
  assert.equal(kim.review, 1);
});

test('quarter meta gives the closing date, payroll month and D-day', () => {
  const m = quarterMeta('2026-Q3', new Date(2026, 9, 28));
  assert.equal(m.closingFull, '2026-10-30');
  assert.equal(m.payrollMonth, '2026-10');
  assert.equal(m.ddayText, 'D-2');
});

test('date sort lists the latest PT first, like the previous performance list', () => {
  const rows = sortByDate([
    { date: '2026-09-01', time: '10:00' },
    { date: '2026-09-30', time: '09:00' },
    { date: '2026-09-30', time: '18:00' },
  ]);
  assert.deepEqual(rows.map(r => `${r.date} ${r.time}`), ['2026-09-30 18:00', '2026-09-30 09:00', '2026-09-01 10:00']);
});

test('today PT becomes 미입력 once its time passes', () => {
  const now = new Date(2026, 9, 28, 15, 30);
  const today = '2026-10-28';
  assert.equal(isPtOver({ date: '2026-10-28', time: '14:00' }, today, now), true);
  assert.equal(isPtOver({ date: '2026-10-28', time: '16:00' }, today, now), false);
  assert.equal(isPtOver({ date: '2026-10-28', time: '15시 30분' }, today, now), true);
  assert.equal(isPtOver({ date: '2026-10-28' }, today, now), true);
  assert.equal(isPtOver({ date: '2026-10-27', time: '23:00' }, today, now), true);
  assert.equal(isPtOver({ date: '2026-10-29', time: '09:00' }, today, now), false);
  const row = buildRow({ id: 'x', date: '2026-10-28', time: '16:00', ptAssignee: 'A' }, today, now);
  assert.deepEqual([row.isPending, row.isFuture], [false, true]);
});

test('date sort keeps upcoming PTs below finished ones', () => {
  const rows = sortByDate([
    { date: '2026-12-23', time: '18:00', isFuture: true },
    { date: '2026-10-28', time: '10:00', isFuture: false },
    { date: '2026-10-30', time: '09:00', isFuture: true },
    { date: '2026-10-27', time: '14:00', isFuture: false },
  ]);
  assert.deepEqual(rows.map(r => r.date), ['2026-10-28', '2026-10-27', '2026-10-30', '2026-12-23']);
});

test('정산 단계 — 결과 없음 0 · 검토필요 1 · 미정산 2 · 정산요청 3', () => {
  const step = id => settlementStep(buildRow(pts.find(p => p.id === id), TODAY));
  assert.equal(step('e'), 0);
  assert.equal(step('a'), 1);
  assert.equal(step('b'), 3);
});

test('다음 검토 건 — 다음 검토필요 행, 끝이면 처음, 혼자면 null', () => {
  const rows = [{ id: 'x', isReview: true }, { id: 'y' }, { id: 'z', isReview: true }];
  assert.equal(nextReviewId(rows, 'x'), 'z');
  assert.equal(nextReviewId(rows, 'z'), 'x');
  assert.equal(nextReviewId(rows, 'y'), 'x');
  assert.equal(nextReviewId([{ id: 'x', isReview: true }], 'x'), null);
});