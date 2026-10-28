import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackStatus, feedbackScreen, feedbackDevice, feedbackCounts } from '../src/utils/feedback.js';

test('피드백 상태 — open·없음 = 새로, in_progress = 처리 중, resolved = 완료', () => {
  assert.equal(feedbackStatus({ status: 'open' }), 'new');
  assert.equal(feedbackStatus({}), 'new');
  assert.equal(feedbackStatus({ status: 'in_progress' }), 'doing');
  assert.equal(feedbackStatus({ status: 'resolved' }), 'done');
  assert.deepEqual(feedbackCounts([{}, { status: 'in_progress' }, { status: 'resolved' }, { status: 'open' }]), { new: 2, doing: 1, done: 1, all: 4 });
});

test('보낸 화면·기기 라벨', () => {
  assert.equal(feedbackScreen({ activeView: 'performance', activeModal: 'kapt-verify' }), '실적 › K-APT 확인');
  assert.equal(feedbackScreen({ activeView: 'other' }), '일정');
  assert.equal(feedbackScreen(null), '');
  assert.equal(feedbackDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1'), 'iOS · Safari');
  assert.equal(feedbackDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'), 'Windows · Chrome');
});
