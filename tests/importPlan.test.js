import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport, undoUpdates } from '../src/utils/importPlan.js';

const existing = [{
  id: 'pt_1', type: 'pt', dateType: 'confirmed', date: '2026-11-10', siteName: 'A단지', address: '수원',
  ptAssignee: '김성민', workType: '재도장', note: '앱 메모',
  results: { 김성민: '승' }, settlement: { 김성민: { requested: true } },
  kaptVerified: { status: 'verified' }, evidenceFiles: { x: 1 }, resultReasons: { 김성민: { reason: 'r' } },
}];
const row = (o) => ({ id: 'pt_new_0', type: 'pt', dateType: 'confirmed', date: '2026-11-10', siteName: 'A단지', address: '수원', ptAssignee: '', workType: '재도장', note: '', ...o });

test('병합 — 시트 칸만 칸 단위로 쓰고 결과·정산·K-APT·증빙은 그대로', () => {
  const { updates, backup, next, counts } = planImport(existing, [row({ address: '수원시 영통구', time: '14:00' })], 'merge');
  assert.deepEqual(updates, { 'pt/pt_1/address': '수원시 영통구', 'pt/pt_1/time': '14:00' });
  assert.equal(counts.updated, 1);
  assert.deepEqual(backup.pt_1, existing[0]);
  const n = next.find(s => s.id === 'pt_1');
  assert.deepEqual(n.results, { 김성민: '승' });
  assert.deepEqual(n.kaptVerified, { status: 'verified' });
  assert.equal(n.ptAssignee, '김성민', '빈 시트 칸이 앱에서 배정한 담당자를 지우면 안 됨');
  assert.equal(n.note, '앱 메모');
});

test('병합 — 바뀐 게 없으면 쓰지 않음, 새 행은 통째로 추가', () => {
  const { updates, counts, backup } = planImport(existing, [row({}), row({ id: 'pt_new_1', siteName: 'B단지' })], 'merge');
  assert.deepEqual(Object.keys(updates), ['pt/pt_new_1']);
  assert.deepEqual(counts, { added: 1, updated: 0, unchanged: 1, skipped: 0, removed: 0 });
  assert.equal(backup.pt_new_1, null);
  assert.equal('pt_1' in backup, false);
});

test('새 항목만 — 기존 PT는 한 칸도 안 씀', () => {
  const { updates, counts } = planImport(existing, [row({ address: '다른 주소' }), row({ id: 'pt_new_1', siteName: 'B단지' })], 'addNew');
  assert.deepEqual(Object.keys(updates), ['pt/pt_new_1']);
  assert.equal(counts.skipped, 1);
});

test('전체 교체 — 없는 PT는 삭제, 백업은 기존 전부', () => {
  const { updates, backup, counts } = planImport(existing, [row({ id: 'pt_new_1', siteName: 'B단지' })], 'replace');
  assert.equal(updates['pt/pt_1'], null);
  assert.ok(updates['pt/pt_new_1']);
  assert.equal(counts.removed, 1);
  assert.deepEqual(undoUpdates(backup), { 'pt/pt_new_1': null, 'pt/pt_1': existing[0] });
});

test('시트 날짜가 월만으로 바뀌면 날짜 칸은 빈 값도 함께 반영', () => {
  const sheet = row({ dateType: 'monthOnly', date: '', expectedMonth: '2026-11' });
  // 같은 키(현장명+월)로 잡힌 기존 PT의 옛 메모성 날짜(dateNote)는 시트대로 비움 — undefined 가 아니라 ''
  const ex = [{ ...existing[0], dateType: 'monthOnly', date: '', expectedMonth: '2026-11', dateNote: '연기' }];
  const { updates } = planImport(ex, [sheet], 'merge');
  assert.equal(updates['pt/pt_1/dateNote'], '');
  assert.ok(Object.values(updates).every(v => v !== undefined));
});
