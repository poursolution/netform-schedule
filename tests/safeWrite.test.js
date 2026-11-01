import test from 'node:test';
import assert from 'node:assert/strict';
import { editableFields, isLiveRecord, softDeletePatch, resultSavePaths, hasOperationalRecord } from '../src/utils/safeWrite.js';

test('유형 변경 차단 판단 — 결과·정산·증빙·회의 응답·하이웍스가 있으면 운영 기록', () => {
  assert.equal(hasOperationalRecord({ id: 'a', siteName: 'A', results: {} }), false);
  assert.equal(hasOperationalRecord({ id: 'a', results: { 김성민: '승' } }), true);
  assert.equal(hasOperationalRecord({ id: 'a', settlement: { 김성민: { requested: true } } }), true);
  assert.equal(hasOperationalRecord({ id: 'a', source: 'hiworks' }), true);
  assert.equal(hasOperationalRecord({ id: 'a', responses: { 김성민: { status: '미정' } } }), false);
  assert.equal(hasOperationalRecord({ id: 'a', responses: { 김성민: { status: '참석' } } }), true);
});

test('수정창 저장 — 결과·정산·검증·증빙·이력 칸은 쓰지 않고, 일정 칸·공법·공고번호는 씀', () => {
  const out = editableFields({
    id: 'p1', siteName: 'A단지', date: '2026-11-10', ptAssignee: '김성민', announcementMethods: ['POUR'], bidNo: '123',
    results: { 김성민: '승' }, settlement: { 김성민: { requested: true } }, kaptVerified: { status: 'verified' },
    evidenceFiles: { f: 1 }, exceptionRequests: {}, deleted: true, note: undefined,
  });
  assert.deepEqual(out, { id: 'p1', siteName: 'A단지', date: '2026-11-10', ptAssignee: '김성민', announcementMethods: ['POUR'], bidNo: '123' });
});

test('숨김 삭제 — deleted 기록은 화면에서 빠지고, 삭제 patch 는 기록을 남김', () => {
  assert.equal(isLiveRecord({ id: 'a' }), true);
  assert.equal(isLiveRecord({ id: 'a', deleted: true }), false);
  assert.equal(isLiveRecord(null), false);
  assert.deepEqual(softDeletePatch({ by: '관리자', at: 't' }), { deleted: true, deletion: { by: '관리자', at: 't' } });
});

test('결과 일괄 저장 — 바뀐 담당자 결과 칸만, 정산은 담당자별 경로로', () => {
  const pt = { id: 'p1', ptAssignee: '김성민/정정훈', results: { 김성민: '무', 정정훈: '지원' }, resultConfirmDate: { 김성민: '2026-11-01' }, settlement: { 김성민: { requested: true } }, selfPT: false, kaptVerified: { status: 'verified' } };
  assert.deepEqual(resultSavePaths(pt, { changed: ['김성민'] }), {
    'results/김성민': '무', 'resultReasons/김성민': null, 'resultConfirmDate/김성민': '2026-11-01', inProgress: false,
  });
  const dirty = resultSavePaths(pt, { dirty: true, assignees: ['김성민', '정정훈'] });
  assert.deepEqual(dirty, { 'settlement/김성민': { requested: true }, selfPT: false });
  assert.equal('kaptVerified' in dirty, false, '검증 칸은 쓰지 않음');
});
