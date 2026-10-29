import test from 'node:test';
import assert from 'node:assert/strict';
import { responseOf, responseCounts, displayTitle, defaultMeetingTitle, dday, nextMeeting, agendaItems, joinAgenda, minutesTemplate } from '../src/utils/meetings.js';

const m = { attendees: ['김성민', '한준엽', '이필선'], responses: { 김성민: { status: '참석' }, 한준엽: '불참', 이필선: { status: '미정' } } };

test('참석 응답 — 객체·문자열 응답 모두, 미응답 명단', () => {
  assert.equal(responseOf(m, '한준엽').status, '불참');
  assert.equal(responseOf(m, '없는사람').status, '미정');
  assert.deepEqual(responseCounts(m), { total: 3, yes: 1, no: 1, pending: 1, pendingNames: ['이필선'] });
});

test('제목 — YYMMDD 영업회의는 월로, 새 회의 기본 제목', () => {
  assert.equal(displayTitle({ title: '261106 영업회의' }), '11월 영업회의');
  assert.equal(displayTitle({ title: '분기 전략 회의' }), '분기 전략 회의');
  assert.equal(defaultMeetingTitle('2026-12-04'), '12월 영업회의');
  assert.equal(defaultMeetingTitle(''), '');
});

test('다음 회의 · D-day', () => {
  const list = [{ id: 'a', date: '2026-10-02' }, { id: 'b', date: '2026-11-06', time: '09:00' }, { id: 'c', date: '2026-12-04' }];
  assert.equal(nextMeeting(list, '2026-10-29').id, 'b');
  assert.equal(nextMeeting(list, '2026-12-05'), null);
  assert.equal(dday('2026-11-06', '2026-10-29'), 8);
});

test('안건 ↔ 회의록 틀', () => {
  assert.deepEqual(agendaItems('1. 4분기 실적\n- 신규 현장\n\n3) 기타'), ['4분기 실적', '신규 현장', '기타']);
  assert.equal(joinAgenda(['가', '나']), '1. 가\n2. 나');
  assert.equal(minutesTemplate('1. 가\n2. 나'), '1. 가\n- \n\n2. 나\n- ');
});
