import test from 'node:test';
import assert from 'node:assert/strict';

import { isSameSite, normalizeSiteAddress, buildSiteHistory } from '../src/utils/siteHistory.js';

// 운영에서 실제로 있었던 해운대 센텀트루엘 케이스를 단순화
const t167 = { id: 't167', siteName: '센텀트루엘 아파트', address: '부산시 해운대구 삼어로 133번나길 17', date: '2025-07-22', mainCategory: '재도장', results: { 한준엽: '승' }, settlement: { 한준엽: { completed: true, status: 'completed', calculatedAmount: 500000 } } };
const t173 = { id: 't173', siteName: '해운대 센텀 트루엘 1단지 아파트', address: '부산 해운대구 삼어로133번나길 17', date: '2025-07-30', mainCategory: '재도장', results: { 한준엽: '승' }, kaptVerified: { status: 'needs_review' }, settlement: { 한준엽: {} } };
const t268 = { id: 't268', siteName: '해운대 센텀 트루엘 1단지 아파트', address: '부산 해운대구 삼어로133번나길 17', date: '2025-11-25', mainCategory: '에폭시', results: { 한준엽: '승' }, settlement: { 한준엽: { completed: true, status: 'completed', calculatedAmount: 500000 } } };
const other = { id: 'x', siteName: '센텀삼환아파트', address: '부산 해운대구 다른길 1', date: '2026-09-08', mainCategory: '재도장', results: { 한준엽: '승' } };

test('주소 정규화 — 시/광역시 표기·공백 차이 무시', () => {
  assert.equal(normalizeSiteAddress('부산시 해운대구 삼어로 133번나길 17'), normalizeSiteAddress('부산광역시 해운대구 삼어로133번나길 17'));
});

test('같은 단지 판정', () => {
  assert.ok(isSameSite(t167, t173), '주소 같음');
  assert.ok(isSameSite({ siteName: '센텀트루엘' }, { siteName: '해운대센텀트루엘1단지아파트' }), '이름 포함');
  assert.ok(!isSameSite({ siteName: '동탄시범한화꿈에그린' }, { siteName: '동탄역한화꿈에그린' }), '다른 단지');
  assert.ok(!isSameSite({ siteName: '센텀트루엘1단지' }, { siteName: '센텀트루엘2단지' }), '단지 번호 다름');
  assert.ok(!isSameSite(t173, other));
});

test('전체 내역 + 중복 의심 — 같은 담당·같은 공종이 이미 정산완료면 표시', () => {
  const rows = buildSiteHistory([t268, other, t173, t167], t173, '한준엽');
  assert.deepEqual(rows.map(r => r.id), ['t167', 't173', 't268'], '날짜순, 다른 단지 제외');
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(byId.t173.isTarget, true);
  assert.equal(byId.t167.duplicateSuspect, true, '7/22 재도장 정산완료 → 중복 의심');
  assert.equal(byId.t268.duplicateSuspect, false, '에폭시는 공종 다름');
  assert.equal(byId.t167.statusLabel, '정산완료');
  assert.equal(byId.t167.amount, 500000);
});

test('중복대체·정산예외 건은 중복 의심에서 빠진다', () => {
  const sup = { ...t167, settlement: { 한준엽: { superseded: true, status: 'superseded' } } };
  const exc = { ...t167, id: 'exc', settlement: { 한준엽: { settlementExcluded: true } } };
  const rows = buildSiteHistory([sup, exc, t173], t173, '한준엽');
  assert.equal(rows.find(r => r.id === 't167').statusLabel, '중복대체');
  assert.equal(rows.find(r => r.id === 'exc').statusLabel, '제외');
  assert.ok(rows.every(r => !r.duplicateSuspect));
});

test('이 건이 이미 중복대체면 경고하지 않는다', () => {
  const me = { ...t173, settlement: { 한준엽: { superseded: true, status: 'superseded', requested: true } } };
  const rows = buildSiteHistory([t167, me], me, '한준엽');
  assert.ok(rows.every(r => !r.duplicateSuspect));
});
