import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPerformanceRows, DETAIL_HEADER, SUMMARY_HEADER } from '../src/utils/performanceExport.js';
import { calculateSettlementAmount } from '../src/utils/settlement.js';

const pts = [
  { id: 'a', date: '2026-07-10', time: '14:00', siteName: 'A단지', ptAssignee: '김성민', result: '승' },
  { id: 'b', date: '2026-08-02', siteName: 'B단지', ptAssignee: '김성민/정정훈', results: { 김성민: '무', 정정훈: '무' } },
  { id: 'c', date: '2026-09-30', siteName: 'C단지', ptAssignee: '정정훈' },                  // 결과 미입력
  { id: 'd', date: '2026-10-01', siteName: 'D단지', ptAssignee: '김성민', result: '승' },    // 다음 분기
  { id: 'e', date: '2026-07-20', siteName: 'E단지', ptAssignee: '조현식', result: '승' },    // 정산 제외 대상
  { id: 'f', date: '2026-07-21', siteName: 'F단지', ptAssignee: '김성민', result: '승', isDuplicate: true },
];

test('분기 안 PT만, 참여 토큰마다 한 행, 날짜순', () => {
  const { detail, ptCount } = buildPerformanceRows(pts, '2026-Q3');
  assert.equal(ptCount, 4);
  assert.deepEqual(detail.map(r => `${r[2]}:${r[5]}:${r[6]}`), ['A단지:김성민:주담', 'E단지:조현식:주담', 'B단지:김성민:주담', 'B단지:정정훈:지원', 'C단지:정정훈:주담']);
  assert.ok(detail.every(r => r.length === DETAIL_HEADER.length));
  assert.equal(detail.find(r => r[2] === 'C단지')[10], '미입력');
  assert.equal(detail.find(r => r[2] === 'C단지')[13], 0);
});

test('금액은 settlement.js 계산 그대로, 제외 대상은 합계에서 빠짐', () => {
  const { detail, summary, total } = buildPerformanceRows(pts, '2026-Q3');
  const a = detail.find(r => r[2] === 'A단지');
  assert.equal(a[13], calculateSettlementAmount(pts[0], '김성민').amount);
  assert.ok(summary.every(r => r.length === SUMMARY_HEADER.length));
  const jo = summary.find(r => r[0] === '조현식');
  assert.equal(jo[10], 0);
  assert.equal(jo[11], '정산 제외 대상');
  const sum = summary.reduce((s, r) => s + r[10], 0);
  assert.equal(total[10], sum);
  assert.equal(total[1], 5); // 참여 토큰 기준 PT
});
