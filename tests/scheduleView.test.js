import test from 'node:test';
import assert from 'node:assert/strict';
import { isMine, nextItemAfter } from '../src/utils/scheduleView.js';

test('내 일정 — 주담·지원·참석자 모두 포함', () => {
  assert.equal(isMine({ type: 'pt', ptAssignee: '정정훈/조재연' }, '조재연'), true);
  assert.equal(isMine({ type: 'pt', ptAssignee: '정정훈' }, '조재연'), false);
  assert.equal(isMine({ type: 'meeting', attendees: ['김성민'] }, '김성민'), true);
  assert.equal(isMine({ type: 'pt', ptAssignee: '정정훈' }, null), false);
});

test('빈 날 다음 일정 — 그 날 이후 가장 빠른 날·시간', () => {
  const items = [
    { id: 'a', date: '2026-10-27', time: '10:00' },
    { id: 'b', date: '2026-11-02', time: '15:00' },
    { id: 'c', date: '2026-11-02', time: '09:30' },
    { id: 'd', date: '2026-11-05' },
  ];
  assert.equal(nextItemAfter(items, '2026-10-28').id, 'c');
  assert.equal(nextItemAfter(items, '2026-11-05'), null);
});
