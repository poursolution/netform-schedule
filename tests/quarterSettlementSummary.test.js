import test from 'node:test';
import assert from 'node:assert/strict';
import { quarterSettlementSummary, settlementRowsOf } from '../src/utils/quarterlySettlementCore.js';

const per = {
  김성민: { assignee: '김성민', totalCount: 3, estimatedAmount: 300000, reviewCount: 1 },
  정정훈: { assignee: '정정훈', totalCount: 2, estimatedAmount: 200000, reviewCount: 0 },
  조현식: { assignee: '조현식', totalCount: 4, estimatedAmount: 900000, reviewCount: 2 }, // 정산 제외 담당자
  한인규: { assignee: '한인규', totalCount: 0, estimatedAmount: 0, reviewCount: 0 },     // 대상 없음
};

test('정산 행 — 대상 0건·제외 담당자 빼기', () => {
  assert.deepEqual(settlementRowsOf(per).map(r => r.assignee).sort(), ['김성민', '정정훈']);
  assert.deepEqual(settlementRowsOf(null), []);
});

test('분기정산 요약 — 메인 카드와 분기정산 화면이 같은 숫자', () => {
  const s = quarterSettlementSummary(per, { 김성민: { confirmed: true }, 조현식: { confirmed: true, finalConfirmed: true } });
  assert.deepEqual(s, { assignees: 2, targetCount: 5, amount: 500000, reviewTotal: 1, confirmedCount: 1, finalConfirmedCount: 0 });
});
