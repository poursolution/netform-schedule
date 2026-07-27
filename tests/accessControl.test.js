import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_DATA_VIEWER_NAMES,
  hasFullDataViewAccess,
} from '../src/utils/accessControl.js';

test('designated users can view all data without gaining edit permissions', () => {
  for (const name of ['한준엽', '황윤선', '이승우']) {
    assert.equal(hasFullDataViewAccess({ name, isAdmin: false }), true);
  }
  assert.deepEqual(FULL_DATA_VIEWER_NAMES, ['한준엽', '황윤선', '이승우']);
});

test('other users remain limited unless they are administrators', () => {
  assert.equal(hasFullDataViewAccess({ name: '조재연', isAdmin: false }), false);
  assert.equal(hasFullDataViewAccess({ name: '관리자', isAdmin: true }), true);
  assert.equal(hasFullDataViewAccess(null), false);
});
