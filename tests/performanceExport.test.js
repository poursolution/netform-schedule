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
  assert.equal(jo[15], '정산 제외 대상');
  assert.equal(jo[13], 0, '제외 대상은 대기 금액도 0');
  const sum = summary.reduce((s, r) => s + r[10], 0);
  assert.equal(total[10], sum);
  assert.equal(total[1], 5); // 참여 토큰 기준 PT
});

test('분기정산 금액 — 정산요청된 건만 (분기정산 화면 기준)', () => {
  const req = [
    { id: 'r', date: '2026-07-10', siteName: 'R단지', ptAssignee: '김성민', result: '승', settlement: { 김성민: { requested: true } } },
    { id: 'n', date: '2026-07-11', siteName: 'N단지', ptAssignee: '김성민', result: '승' },
  ];
  const { detail, summary, total } = buildPerformanceRows(req, '2026-Q3');
  assert.deepEqual(detail.map(r => r[14]), ['O', '']);
  const kim = summary.find(r => r[0] === '김성민');
  assert.equal(kim[11], calculateSettlementAmount(req[0], '김성민').amount);
  assert.equal(kim[10], kim[11] * 2);
  assert.equal(total[11], kim[11]);
});

test('공고 확정 대기 — 금액 있고 공고 근거 없고 대상 아닌 건만, 분기정산 금액과 겹치지 않음', () => {
  const rows = [
    { id: 'r', date: '2026-07-10', siteName: '요청됨', ptAssignee: '김성민', result: '승', settlement: { 김성민: { requested: true } } },  // 대상 → 대기 아님
    { id: 'n', date: '2026-07-11', siteName: '대기', ptAssignee: '김성민', result: '승', announcementRecheck: { reason: 'jandi_document_not_found' } },
    { id: 'k', date: '2026-07-12', siteName: 'K확인', ptAssignee: '김성민', result: '무', kaptVerified: { status: 'verified' } },        // 근거 K-APT
    { id: 'e', date: '2026-07-13', siteName: '잔디', ptAssignee: '정정훈', result: '승', evidenceFiles: { f: { filename: 'x' } } },     // 근거 잔디
    { id: 'l', date: '2026-07-14', siteName: '패', ptAssignee: '정정훈', result: '패' },                                                  // 금액 0
  ];
  const { detail, summary, total, pending } = buildPerformanceRows(rows, '2026-Q3');
  assert.deepEqual(pending.map(r => r[1]), ['대기']);
  assert.equal(pending[0][9], '잔디 공고문 못 찾음');
  // 요청된 건은 근거가 없어도 대기 목록엔 안 들어감(이미 분기정산 금액에 포함) — 칸에는 미확인으로 표시
  assert.deepEqual(detail.map(r => r[15]), ['미확인 · 정산요청됨', '대기', 'K-APT', '잔디 공고문', '']);
  const kim = summary.find(r => r[0] === '김성민');
  assert.equal(kim[12], 1);
  assert.equal(kim[13], 500000);
  assert.equal(kim[14], kim[11] + kim[13]);
  assert.equal(total[13], 500000);
  assert.ok(summary.every(r => r.length === SUMMARY_HEADER.length) && detail.every(r => r.length === DETAIL_HEADER.length));
});
