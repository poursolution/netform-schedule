import test from 'node:test';
import assert from 'node:assert/strict';
import { extractKaptBidNo } from '../src/utils/kaptBidNo.js';

test('공고번호 그대로', () => {
  assert.equal(extractKaptBidNo(' 20260401144113799 '), '20260401144113799');
  assert.equal(extractKaptBidNo('kg2b_128097'), 'kg2b_128097');
});

test('상세 URL 에서 추출', () => {
  assert.equal(extractKaptBidNo('https://www.k-apt.go.kr/bid/bidDetail.do?bidNum=20260401144113799&x=1'), '20260401144113799');
  assert.equal(extractKaptBidNo('https://www.k-apt.go.kr/bid/bidDetail.do?type=3&bidNo=&m=128097'), null);
  assert.equal(extractKaptBidNo('https://www.k-apt.go.kr/bid/bidDetail.do?bidcode=kg2b_55'), 'kg2b_55');
});

test('형식이 안 맞으면 null', () => {
  assert.equal(extractKaptBidNo(''), null);
  assert.equal(extractKaptBidNo('12345'), null);
  assert.equal(extractKaptBidNo('송도 더샵'), null);
});
