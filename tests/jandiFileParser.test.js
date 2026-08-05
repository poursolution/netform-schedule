import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseJandiFilename,
  scoreJandiEvidenceCandidate,
  stripJandiFilenameSuffix,
} from '../src/utils/jandiFileParser.js';

test('재공고 표식을 단지명에서 제거한다', () => {
  const parsed = parseJandiFilename('328_진영자이아파트(금속기와)_재공고.pdf');
  assert.equal(parsed.siteName, '진영자이아파트');
  assert.equal(parsed.method, '금속기와');
  assert.equal(parsed.seq, 328);
});

test('공법 prefix와 수정 날짜를 함께 처리한다', () => {
  const parsed = parseJandiFilename('015_DO공법_삼부르네상스1단지아파트(기타-캐노피방수)_수정공고_0604.hwp');
  assert.equal(parsed.siteName, '삼부르네상스1단지아파트');
  assert.equal(parsed.methodPrefix, 'DO공법');
  assert.equal(parsed.method, '기타-캐노피방수');
});

test('여러 개의 후행 표식을 반복 제거한다', () => {
  assert.equal(stripJandiFilenameSuffix('OO아파트(방수)_재공고_06.04'), 'OO아파트(방수)');
});

test('단지명 앞의 재공고 표식도 제거한다', () => {
  const parsed = parseJandiFilename('225_재공고)남서울힐스테이트아파트(옥상방수).hwp');
  assert.equal(parsed.siteName, '남서울힐스테이트아파트');
  assert.equal(parsed.method, '옥상방수');
});

test('검토 후보는 단지명이 같은 증빙을 가장 높게 정렬한다', () => {
  const exact = scoreJandiEvidenceCandidate(
    { filename: '101_동탄시험한화꿈에그린아파트(우레탄).pdf' },
    { siteName: '동탄시험한화꿈에그린아파트', workType: '옥상 우레탄 방수' },
  );
  const other = scoreJandiEvidenceCandidate(
    { filename: '102_위례그린파크푸르지오아파트(우레탄).pdf' },
    { siteName: '동탄시험한화꿈에그린아파트', workType: '옥상 우레탄 방수' },
  );
  assert.ok(exact.score > other.score);
  assert.ok(exact.score >= 0.95);
});
