// 실적 작업대(#2a) 파생값 — 화면 전용 계산.
// 금액·정산 상태는 settlement.js 를 그대로 쓰고 여기서 다시 계산하지 않는다.

import {
  SETTLEMENT_STATUS,
  calculateSettlementAmount,
  deriveAssigneeResult,
  getSettlementStatus,
  ptBelongsToQuarter,
  parseQuarterKey,
  getQuarterClosingDate,
  getPayrollMonthByQuarterKey,
} from './settlement.js';

export function parseAssignees(value) {
  return [...new Set(
    String(value || '').split(/[\/,+&;\n]/).map(t => t.trim()).filter(Boolean)
  )];
}

export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function mmdd(date) {
  return String(date || '').slice(5).replace('-', '/');
}

export function formatWon(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '0원';
  return n.toLocaleString('ko-KR') + '원';
}

// 분기 마감까지 남은 일수 (마감일 당일 = D-0)
export function quarterDday(quarterKey, now = new Date()) {
  const closing = getQuarterClosingDate(quarterKey);
  if (!closing) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((closing - start) / 86400000);
}

export function quarterMeta(quarterKey, now = new Date()) {
  const p = parseQuarterKey(quarterKey);
  if (!p) return null;
  const closing = getQuarterClosingDate(quarterKey);
  const dday = quarterDday(quarterKey, now);
  return {
    key: quarterKey,
    year: p.year,
    quarter: p.quarter,
    label: `${p.year} Q${p.quarter}`,
    months: `${p.startMonth}~${p.endMonth}월`,
    closing,
    closingText: closing ? `${closing.getMonth() + 1}/${closing.getDate()}` : '',
    closingFull: closing ? todayKey(closing) : '',
    payrollMonth: getPayrollMonthByQuarterKey(quarterKey),
    dday,
    ddayText: dday === null ? '' : dday >= 0 ? `D-${dday}` : `마감 ${-dday}일 지남`,
  };
}

/**
 * PT가 끝났는지 — 지난 날짜면 끝, 오늘이면 PT 시간이 지났을 때 끝(시간 없으면 오늘부터 끝으로 본다).
 *  now 없이 부르면 날짜만 본다 (예전 동작).
 */
export function isPtOver(pt, today = todayKey(), now = null) {
  const date = pt?.date || '';
  if (!date || date > today) return false;
  if (date < today || !now) return true;
  const m = String(pt.time || '').match(/(\d{1,2})\s*[:시]\s*(\d{2})?/);
  if (!m) return true;
  return now.getHours() * 60 + now.getMinutes() >= +m[1] * 60 + (m[2] ? +m[2] : 0);
}

/**
 * PT 1건 → 작업대 행. 담당 기준은 주담당(첫 토큰).
 */
export function buildRow(pt, today = todayKey(), now = null) {
  const tokens = parseAssignees(pt.ptAssignee);
  const main = tokens[0] || '';
  const sups = tokens.slice(1);
  const result = (main && pt.results?.[main]) || pt.result || null;
  const has = !!result;
  const kapt = pt.kaptVerified?.status || null;
  const verify = has ? kapt : null;
  const stl = has && main ? getSettlementStatus(pt, main) : null;
  const calc = has && main ? calculateSettlementAmount(pt, main) : null;
  const date = pt.date || '';
  return {
    id: pt.id,
    pt,
    date,
    time: pt.time || '',
    main,
    sups,
    multi: tokens.length > 1,
    result,
    has,
    verify,
    stl,
    amount: calc ? calc.amount : null,
    isPending: !has && isPtOver(pt, today, now),
    isFuture: !has && !!date && !isPtOver(pt, today, now),
    isReview: stl === SETTLEMENT_STATUS.NEEDS_REVIEW,
    isRequested: stl === SETTLEMENT_STATUS.REQUESTED,
  };
}

// 정산 단계 0~5 (결과 입력 / K-APT 검증 / 정산요청 / 정산확정 / 정산완료 / 끝) — 상세 패널·모바일 시트 공통
export const SETTLEMENT_STEPS = ['결과 입력', 'K-APT 검증', '정산요청', '정산확정', '정산완료'];
export function settlementStep(row) {
  if (!row?.has) return 0;
  if (row.stl === 'excluded') return 1;
  if (row.verify === 'needs_review' || row.stl === 'needs_review') return 1;
  return row.stl === 'unsettled' ? 2 : row.stl === 'requested' ? 3 : row.stl === 'confirmed' ? 4 : 5;
}

export function kaptCandidateText(pt) {
  const list = pt?.kaptVerified?.candidates?.list || [];
  if (list.length === 1) return `후보 1건 · ${list[0].bidKaptname || list[0].bidTitle || '확인 필요'}`;
  if (list.length > 1) return `후보 ${list.length}건 · 확인 필요`;
  return '일치하는 공고문 없음';
}

// "다음 검토 건 →" — 현재 행 다음의 검토필요 행(끝이면 처음부터), 현재 말고 없으면 null
export function nextReviewId(rows, currentId) {
  const list = (rows || []).filter(r => r.isReview);
  const i = list.findIndex(r => r.id === currentId);
  const next = list[i + 1] || list[0];
  return next && next.id !== currentId ? next.id : null;
}

export const FILTERS = {
  all: () => true,
  win: r => r.result === '승',
  draw: r => r.result === '무',
  loss: r => r.result === '패',
  sup: r => r.multi,
  pending: r => r.isPending,
  review: r => r.isReview,
  requested: r => r.isRequested,
  carry: r => !!r.carry,
};

// who: '전체' | 담당자 이름 | { label, names } (메인 팀별 현황에서 팀 단위로 넘어올 때)
export function matchesWho(row, who) {
  if (!who || who === '전체') return true;
  if (typeof who === 'object') return (who.names || []).some(n => row.main === n || row.sups.includes(n));
  return row.main === who || row.sups.includes(who);
}

export function matchesSearch(row, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const pt = row.pt;
  return [pt.siteName, pt.workType, pt.ptAssignee, pt.requester, pt.address]
    .some(v => String(v || '').toLowerCase().includes(s));
}

// 처리 우선 정렬: 검토필요 → 미입력 → 정산요청 → 나머지, 같은 묶음은 최근 PT 먼저
export function sortByPriority(rows) {
  const rank = r => r.isReview ? 0 : r.isPending ? 1 : r.isRequested ? 2 : 3;
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time)));
}

// 날짜순: 기존 실적 목록처럼 끝난 PT가 최근 것부터 위로 차곡차곡, 아직 안 한 예정 PT는 맨 아래(가까운 날짜 먼저)
export function sortByDate(rows) {
  const done = rows.filter(r => !r.isFuture).sort((a, b) => b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time)));
  const future = rows.filter(r => r.isFuture).sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
  return [...done, ...future];
}

export function kpis(rows) {
  const w = rows.filter(r => r.result === '승').length;
  const d = rows.filter(r => r.result === '무').length;
  const l = rows.filter(r => r.result === '패').length;
  const p = rows.filter(r => !r.has).length;
  return { total: rows.length, w, d, l, p, rate: w + l ? Math.round(w / (w + l) * 100) : 0 };
}

/**
 * 담당자별 정산 집계 — 참여 토큰 전원 기준(지원 포함).
 * 제외·결과없음은 빼고 금액 > 0 인 건만 대상.
 */
export function settlementTargets(pts) {
  let count = 0;
  let amount = 0;
  const byStatus = { unsettled: 0, needs_review: 0, requested: 0, confirmed: 0, completed: 0, excluded: 0 };
  for (const pt of pts) {
    for (const a of parseAssignees(pt.ptAssignee)) {
      if (!(pt.results?.[a] || pt.result)) continue;
      const st = getSettlementStatus(pt, a);
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (st === SETTLEMENT_STATUS.EXCLUDED || st === SETTLEMENT_STATUS.COMPLETED) continue;
      const amt = calculateSettlementAmount(pt, a).amount;
      if (amt > 0) { count += 1; amount += amt; }
    }
  }
  return { count, amount, byStatus };
}

export function staffStats(pts, names) {
  return names.map(name => {
    let w = 0, d = 0, l = 0, p = 0, review = 0, est = 0;
    for (const pt of pts) {
      if (!parseAssignees(pt.ptAssignee).includes(name)) continue;
      const res = deriveAssigneeResult(pt, name);
      if (!res) { p += 1; continue; }
      if (res === '승') w += 1;
      else if (res === '무') d += 1;
      else if (res === '패') l += 1;
      const st = getSettlementStatus(pt, name);
      if (st === SETTLEMENT_STATUS.NEEDS_REVIEW) review += 1;
      if (st !== SETTLEMENT_STATUS.EXCLUDED) est += calculateSettlementAmount(pt, name).amount;
    }
    const dec = w + d + l;
    return { name, w, d, l, p, dec, total: dec + p, rate: w + l ? Math.round(w / (w + l) * 100) : 0, review, est };
  }).sort((a, b) => b.rate - a.rate || b.total - a.total);
}

// 지난 분기 마감(다음 달 30일) 전이면 지난 분기를 먼저 — 마감 처리할 분기가 우선
export function defaultQuarterKey(now = new Date()) {
  const y = now.getFullYear();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const prev = q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
  const closing = getQuarterClosingDate(prev);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return closing && closing >= start ? prev : `${y}-Q${q}`;
}

export function quarterPts(pts, quarterKey) {
  if (!quarterKey || quarterKey === 'all') return pts;
  return pts.filter(pt => ptBelongsToQuarter(pt.date, quarterKey));
}

// 선택 분기보다 앞선 PT — 이 중 아직 확인이 안 끝난 건(이월)만 목록에 함께 띄운다
export function ptsBeforeQuarter(pts, quarterKey) {
  const p = parseQuarterKey(quarterKey);
  if (!p) return [];
  const start = `${p.year}-${String(p.startMonth).padStart(2, '0')}`;
  return pts.filter(pt => pt && pt.date && String(pt.date).slice(0, 7) < start);
}

// 이월: 결과 미입력(끝난 PT) 또는 정산 검토필요
export const isCarryover = row => !!row && (row.isPending || row.isReview);

// 메인 "검토필요" 큐 — 실적 목록과 같은 범위(이번 분기 + 이전 분기 미확인)
export function reviewQueueCounts(pts, quarterKey, today = todayKey()) {
  const cur = quarterPts(pts || [], quarterKey).map(pt => buildRow(pt, today)).filter(FILTERS.review).length;
  const carry = ptsBeforeQuarter(pts || [], quarterKey).map(pt => buildRow(pt, today)).filter(r => isCarryover(r) && FILTERS.review(r)).length;
  return { cur, carry, total: cur + carry };
}

export function quarterLabelOf(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1].slice(2)}Q${Math.ceil(+m[2] / 3)}` : '';
}
