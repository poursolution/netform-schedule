import test from 'node:test';
import assert from 'node:assert/strict';

import { stageGroup, filterPipeline, flow, teamRows, eok } from '../src/utils/mainDashboard.js';

const pipe = [
  { stage: '대기고객', dealValue: 100000000, assigneeName: '한준엽', processList: '석민이앤씨', 공사계획년도: '2026' },
  { stage: '입찰단계', dealValue: 200000000, assigneeName: '한준엽', processList: 'POUR솔루션', 공사계획년도: '2026' },
  { stage: '계약단계', dealValue: 300000000, assigneeName: '이필선', processList: 'POUR솔루션', 공사계획년도: '2026' },
  { stage: '수주 성공', dealValue: 100000000, assigneeName: '조현식', processList: '아파트스퀘어', stageType: 'won', 공사계획년도: '2026' },
  { stage: '수주 실패', dealValue: 50000000, assigneeName: '조현식', processList: '아파트스퀘어', stageType: 'lost', 공사계획년도: '2025' },
];
const pts = [
  { date: '2026-01-02', ptAssignee: '한준엽', results: { 한준엽: '승' } },
  { date: '2026-02-02', ptAssignee: '한준엽', results: { 한준엽: '패' } },
  { date: '2026-03-02', ptAssignee: '이필선', results: { 이필선: '무' } },
  { date: '2026-04-02', ptAssignee: '조현식' },
];

test('stage groups follow the existing dashboard mapping', () => {
  assert.equal(stageGroup('입찰단계'), 'compete');
  assert.equal(stageGroup('준공단계'), 'contract');
  assert.equal(stageGroup('알 수 없음'), 'early');
});

test('flow numbers: PT win rate excludes draws, expected revenue adds half of high probability', () => {
  const f = flow(filterPipeline(pipe, { year: '2026' }), pts);
  assert.equal(f.sales.total, 4);
  assert.equal(f.sales.revenue, 400000000);
  assert.equal(f.ptRate, 75);               // 경쟁 이상 3 / 4
  assert.deepEqual([f.pt.w, f.pt.d, f.pt.l, f.pt.p], [1, 1, 1, 1]);
  assert.equal(f.pt.rate, 50);              // 1 / (1 + 1)
  assert.equal(f.contract.count, 2);
  assert.equal(f.contractRate, 67);         // 계약 2 / PT결과 3
  assert.equal(f.expected.total, 400000000 + 100000000);
});

test('company filter narrows pipeline; team rows and total', () => {
  const p = filterPipeline(pipe, { year: '2026', company: 'POUR솔루션' });
  assert.equal(p.length, 2);
  const { rows, total } = teamRows(filterPipeline(pipe, { year: '2026' }), pts, [
    { name: '1팀', members: ['한준엽'] }, { name: '2팀', members: ['이필선'] }, { name: '3팀', members: ['조현식'] },
  ]);
  assert.equal(rows[0].sales.total, 2);
  assert.equal(rows[0].pt.rate, 50);
  assert.equal(total.sales.total, 4);
  assert.equal(total.pt.total, 4);
  assert.equal(eok(150000000), '1.5억');
});
