import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMethods, joinMethods } from '../src/utils/methods.js';
import { judgeResultByMethods } from '../src/utils/technologies.js';

test('공고문 공법 문자열 → 칩/기타 분류', () => {
  assert.deepEqual(parseMethods('POUR공법, 4A시스템, 특수방수'), { chips: ['POUR', '4A시스템'], etc: ['특수방수'] });
  assert.deepEqual(parseMethods('금영 ENC, DO'), { chips: ['금영ENC', 'DO'], etc: [] });
  assert.deepEqual(parseMethods(''), { chips: [], etc: [] });
  assert.equal(joinMethods(['POUR', '금영ENC'], ['XX']), 'POUR, 금영ENC, XX');
});

test('칩 조합의 자동 판정은 technologies.js 그대로', () => {
  assert.equal(judgeResultByMethods(['POUR', 'CNC']), '승');
  assert.equal(judgeResultByMethods(['POUR', '4A시스템']), '무');
  assert.equal(judgeResultByMethods(['금영ENC']), '패');
});
