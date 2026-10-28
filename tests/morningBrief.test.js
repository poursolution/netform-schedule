import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nextBusinessDays, briefRows, buildBriefText, buildBriefJandiMessage, briefRecipients, kTime, kDate,
} from '../src/utils/morningBrief.js';

test('next business days skip weekends and holidays', () => {
  // 2026-10-29 목, 10-30 금, 10-31 토, 11-01 일, 11-02 월
  assert.deepEqual(nextBusinessDays('2026-10-28', 2), ['2026-10-29', '2026-10-30']);
  assert.deepEqual(nextBusinessDays('2026-10-29', 2), ['2026-10-30', '2026-11-02']);
  assert.deepEqual(nextBusinessDays('2026-10-28', 2, d => d === '2026-10-29'), ['2026-10-30', '2026-11-02']);
});

test('korean time and date labels', () => {
  assert.equal(kTime('14:00'), '오후 2:00');
  assert.equal(kTime('9시'), '오전 9:00');
  assert.equal(kTime('12:30'), '오후 12:30');
  assert.equal(kTime('미정'), '미정');
  assert.equal(kDate('2026-10-29'), '2026-10-29(목)');
});

const pts = [
  { id: 'a', date: '2026-10-30', time: '15:00', siteName: '청주 복대', workType: '아스콘', ptAssignee: '김성민', dateType: 'confirmed' },
  { id: 'b', date: '2026-10-29', time: '10:00', siteName: '아산 탕정', workType: '옥상 방수', ptAssignee: '김성민/정정훈님', dateType: 'confirmed' },
  { id: 'c', date: '2026-10-30', time: '09:30', siteName: '파주 운정', workType: '', ptAssignee: '' },
  { id: 'd', date: '2026-10-31', time: '10:00', siteName: '주말 건', ptAssignee: '한인규' },
  { id: 'e', date: '2026-10-29', time: '', siteName: '월예정', ptAssignee: '한인규', dateType: 'monthOnly' },
];
const days = ['2026-10-29', '2026-10-30'];

test('rows keep only confirmed PTs in range, sorted by date and time', () => {
  const rows = briefRows(pts, days);
  assert.deepEqual(rows.map(r => r.id), ['b', 'c', 'a']);
  assert.deepEqual(rows[0].assignees, ['김성민', '정정훈']);
  assert.deepEqual(briefRecipients(rows), ['김성민', '정정훈']);
});

test('text lists unassigned PTs and personal text only has that person', () => {
  const rows = briefRows(pts, days);
  const all = buildBriefText(rows, days);
  assert.match(all, /📋 PT 일정 안내 \(10\/29~10\/30\)/);
  assert.match(all, /파주 운정 · ⚠ 미배정/);
  const mine = buildBriefText(rows, days, '정정훈');
  assert.match(mine, /아산 탕정/);
  assert.doesNotMatch(mine, /청주 복대|파주 운정/);
});

test('jandi message groups by day', () => {
  const msg = buildBriefJandiMessage(briefRows(pts, days), days, '김성민');
  assert.equal(msg.connectInfo.length, 3); // 10/29, 10/30, 안내
  assert.match(msg.body, /김성민님 · 2건/);
});
