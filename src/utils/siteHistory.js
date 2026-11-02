// 같은 단지 전체 내역 — 정산 검토에서 "이 단지로 이미 받은 건이 있나" 를 한눈에 보기 위한 util.
// 같은 단지 판정: 주소가 같거나, 정규화한 단지명이 서로 포함(차수·단지 번호가 다르면 다른 단지).
// 중복 의심: 같은 담당자 · 같은 공종(mainCategory) 이고 상대가 정산완료/확정/요청 중인 건.

import { normalizeApartmentName } from './apartmentMatch.js';
import { getSettlementStatus, calculateSettlementAmount, SETTLEMENT_STATUS } from './settlement.js';

const REGION_PREFIX = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(특별자치시|특별자치도|특별시|광역시|도|시)?/;

export function normalizeSiteAddress(address) {
  let s = String(address || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '');
  s = s.replace(REGION_PREFIX, '');
  return s.replace(/[-,.]/g, '');
}

export function normalizeSiteName(name) {
  return normalizeApartmentName(String(name || '').replace(/^감리_/, '').replace(/^재공고\)?/, ''));
}

const unitOf = (n) => (n.match(/\d+(차|단지)/g) || []).join(',');

export function isSameSite(a, b) {
  const addrA = normalizeSiteAddress(a?.address);
  const addrB = normalizeSiteAddress(b?.address);
  if (addrA.length >= 6 && /\d/.test(addrA) && addrA === addrB) return true;
  const nA = normalizeSiteName(a?.siteName);
  const nB = normalizeSiteName(b?.siteName);
  if (!nA || !nB) return false;
  // "OO 1단지" vs "OO 2단지" 처럼 번호가 둘 다 있고 다르면 다른 단지 (정규화가 "N단지" 를 지우므로 원래 이름으로 비교)
  const uA = unitOf(String(a?.siteName || '').replace(/\s+/g, ''));
  const uB = unitOf(String(b?.siteName || '').replace(/\s+/g, ''));
  if (uA && uB && uA !== uB) return false;
  if (nA === nB) return true;
  const [short, long] = nA.length <= nB.length ? [nA, nB] : [nB, nA];
  return short.length >= 4 && long.includes(short);
}

const STATUS_LABEL = {
  [SETTLEMENT_STATUS.COMPLETED]: '정산완료',
  [SETTLEMENT_STATUS.CONFIRMED]: '정산확정',
  [SETTLEMENT_STATUS.REQUESTED]: '정산요청',
  [SETTLEMENT_STATUS.NEEDS_REVIEW]: '검토필요',
  [SETTLEMENT_STATUS.EXCLUDED]: '제외',
  [SETTLEMENT_STATUS.UNSETTLED]: '미정산',
};
const PAID_LIKE = new Set([SETTLEMENT_STATUS.COMPLETED, SETTLEMENT_STATUS.CONFIRMED, SETTLEMENT_STATUS.REQUESTED]);

function entryStatus(pt, assignee) {
  const stl = pt?.settlement?.[assignee] || {};
  if (stl.superseded === true || stl.status === 'superseded') return { key: 'superseded', label: '중복대체' };
  const key = getSettlementStatus(pt, assignee);
  return { key, label: STATUS_LABEL[key] || key };
}

function assigneesOf(pt) {
  const names = new Set([...Object.keys(pt?.results || {}), ...Object.keys(pt?.settlement || {})]);
  return [...names].filter(Boolean);
}

/**
 * target PT 와 같은 단지의 PT 를 담당자별 한 줄씩, 날짜순으로 돌려준다(target 포함).
 * 반환 행: { id, assignee, date, siteName, workType, mainCategory, result, statusKey, statusLabel, amount, isTarget, duplicateSuspect }
 */
export function buildSiteHistory(pts, target, assignee) {
  if (!target) return [];
  const list = Array.isArray(pts) ? pts : Object.values(pts || {});
  const rows = [];
  for (const pt of list) {
    if (!pt?.id || (pt.id !== target.id && !isSameSite(pt, target))) continue;
    for (const a of assigneesOf(pt)) {
      const result = pt.results?.[a] || '';
      if (!result && pt.id !== target.id) continue;
      const st = entryStatus(pt, a);
      const calc = calculateSettlementAmount(pt, a);
      rows.push({
        id: pt.id, assignee: a, date: pt.date || '', siteName: pt.siteName || '', workType: pt.workType || '',
        mainCategory: pt.mainCategory || '', result, statusKey: st.key, statusLabel: st.label,
        amount: PAID_LIKE.has(st.key) ? (calc.amount || pt.settlement?.[a]?.calculatedAmount || 0) : 0,
        isTarget: pt.id === target.id && a === assignee,
      });
    }
  }
  // 이 건이 이미 중복대체·제외면 경고할 게 없다
  const me = rows.find(r => r.isTarget && r.statusKey !== 'superseded' && r.statusKey !== SETTLEMENT_STATUS.EXCLUDED);
  for (const r of rows) {
    r.duplicateSuspect = !!me && !r.isTarget && r.assignee === me.assignee && !!r.mainCategory
      && r.mainCategory === me.mainCategory && PAID_LIKE.has(r.statusKey);
  }
  return rows.sort((x, y) => x.date.localeCompare(y.date) || x.assignee.localeCompare(y.assignee));
}
