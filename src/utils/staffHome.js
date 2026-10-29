// 담당자 홈(#3a) 파생값 — 로그인한 담당자 본인 기준.
// 금액·정산 상태는 settlement.js 를 그대로 쓰고 여기서 다시 계산하지 않는다.

import {
  SETTLEMENT_STATUS,
  EXCLUSION_REASONS,
  calculateSettlementAmount,
  deriveAssigneeResult,
  getSettlementStatus,
  isInQuarterSettlementScope,
} from './settlement.js';
import { parseAssignees, isPtOver } from './workbench.js';

export function rawResultOf(pt, me) {
  if (pt?.results && pt.results[me] !== undefined) return pt.results[me] || null;
  return parseAssignees(pt?.ptAssignee).length <= 1 ? (pt?.result || null) : null;
}

export function hasEvidence(pt) {
  return Object.values(pt?.evidenceFiles || {}).some(f => !f?.suppressed);
}

export function myPts(pts, me) {
  return (pts || []).filter(pt => parseAssignees(pt.ptAssignee).includes(me));
}

/**
 * 지금 할 일 — 주담당인 PT만 (지원 참여 PT는 주담이 입력).
 *  pending: 날짜 ≤ 오늘 && 결과 없음
 *  review : 결과 있음 && K-APT needs_review && 증빙 없음
 *           sent=true — 공고문을 올려 관리자 확인 대기(pending-admin-review)이거나 "공고 없었어요"를 보낸 건
 */
export function todoItems(pts, me, today, now = null) {
  const out = [];
  for (const pt of pts || []) {
    const tokens = parseAssignees(pt.ptAssignee);
    if (tokens[0] !== me || !pt.date) continue;
    const r = rawResultOf(pt, me);
    if (!r) {
      if (isPtOver(pt, today, now)) out.push({ kind: 'pending', pt });
      continue;
    }
    const uploaded = pt.kaptVerified?.status === 'pending-admin-review';
    if (uploaded || getSettlementStatus(pt, me) === SETTLEMENT_STATUS.NEEDS_REVIEW) {
      out.push({ kind: 'review', pt, result: r, sent: uploaded || !!pt.settlement?.[me]?.noNoticeClaimAt });
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'pending' ? -1 : 1)
    || b.pt.date.localeCompare(a.pt.date) || String(b.pt.time || '').localeCompare(String(a.pt.time || '')));
}

const REASON_TEXT = {
  [EXCLUSION_REASONS.SELF_PT]: '본인PT',
  [EXCLUSION_REASONS.VENDOR_SELF_PT]: '협약사 자체PT',
  [EXCLUSION_REASONS.SELF_SALES]: '본인영업',
  [EXCLUSION_REASONS.MAIN_LOST]: '주담 패',
  [EXCLUSION_REASONS.DRAW_SUPPORT_EXCLUDED]: '주담 무 지원',
  [EXCLUSION_REASONS.LOSS]: '패',
  [EXCLUSION_REASONS.CANCELLED_NOTICE]: '취소공고',
  [EXCLUSION_REASONS.SETTLEMENT_EXCLUDED]: '정산예외',
};

/** 내부 정산 상태 → 담당자 홈 쉬운 말 (핸드오프 "상태 라벨 매핑") */
export function easyStatus(pt, me, today, now = null) {
  const r = rawResultOf(pt, me);
  if (!r) {
    return isPtOver(pt, today, now)
      ? { label: '결과 입력 필요', bg: '#fef3c7', fg: '#b45309' }
      : { label: '예정', bg: '#f1f5f9', fg: '#64748b' };
  }
  const st = getSettlementStatus(pt, me);
  if (st === SETTLEMENT_STATUS.EXCLUDED) {
    const reason = calculateSettlementAmount(pt, me).reason;
    return { label: '지급 대상 아님', reason: REASON_TEXT[reason] || (r === '패' ? '패' : ''), bg: '#f8fafc', fg: '#94a3b8' };
  }
  if (st === SETTLEMENT_STATUS.NEEDS_REVIEW) return { label: '공고문 확인 필요', bg: '#fef3c7', fg: '#b45309' };
  if (st === SETTLEMENT_STATUS.REQUESTED) return { label: '지급 대기', bg: '#dbeafe', fg: '#0F4C75' };
  if (st === SETTLEMENT_STATUS.CONFIRMED) return { label: '지급 확정', bg: '#BBE1FA', fg: '#0F4C75' };
  if (st === SETTLEMENT_STATUS.COMPLETED) return { label: '지급 완료', bg: '#dcfce7', fg: '#15803d' };
  return { label: '입력 완료 · 확인 중', bg: '#f1f5f9', fg: '#475569' };
}

/**
 * 분기 내 받을 금액 — 본인 몫.
 *  확정 = confirmed + completed, 대기 = requested, 확인 중 = unsettled + needs_review
 *  결과 집계(승/무/지원 건수)도 함께.
 */
export function quarterMoney(pts, me, quarterKey, now = new Date()) {
  const out = { confirmed: 0, waiting: 0, checking: 0, total: 0, w: 0, d: 0, s: 0, count: 0 };
  for (const pt of pts || []) {
    if (!parseAssignees(pt.ptAssignee).includes(me)) continue;
    if (!isInQuarterSettlementScope(pt, me, quarterKey, now)) continue;
    const res = deriveAssigneeResult(pt, me);
    if (res === '승') out.w += 1; else if (res === '무') out.d += 1; else if (res === '지원') out.s += 1;
    const st = getSettlementStatus(pt, me);
    if (st === SETTLEMENT_STATUS.EXCLUDED) continue;
    const amt = calculateSettlementAmount(pt, me).amount || 0;
    if (!amt) continue;
    out.count += 1;
    if (st === SETTLEMENT_STATUS.CONFIRMED || st === SETTLEMENT_STATUS.COMPLETED) out.confirmed += amt;
    else if (st === SETTLEMENT_STATUS.REQUESTED) out.waiting += amt;
    else out.checking += amt;
  }
  out.total = out.confirmed + out.waiting;
  return out;
}

/** 올해 내 성적 — 승률은 무 제외 승/(승+패) */
export function yearRecord(pts, me, year) {
  let w = 0, d = 0, l = 0, p = 0;
  for (const pt of pts || []) {
    if (!String(pt.date || '').startsWith(String(year))) continue;
    if (!parseAssignees(pt.ptAssignee).includes(me)) continue;
    const r = rawResultOf(pt, me);
    if (r === '승') w += 1;
    else if (r === '무') d += 1;
    else if (r === '패') l += 1;
    else if (!r) p += 1;
  }
  return { w, d, l, p, total: w + d + l + p, rate: w + l ? Math.round(w / (w + l) * 100) : 0 };
}

export function teamRate(pts, names, year) {
  let w = 0, l = 0;
  for (const name of names || []) {
    const r = yearRecord(pts, name, year);
    w += r.w; l += r.l;
  }
  return w + l ? Math.round(w / (w + l) * 100) : 0;
}

export function upcomingPts(pts, me, today, limit = 3) {
  return myPts(pts, me)
    .filter(pt => pt.date && pt.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')))
    .slice(0, limit);
}

export function historyPts(pts, me, today, limit = 8) {
  return myPts(pts, me)
    .filter(pt => pt.date && pt.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.time || '').localeCompare(String(a.time || '')))
    .slice(0, limit);
}

export function prevQuarterKeys(quarterKey, n = 2) {
  const m = String(quarterKey || '').match(/^(\d{4})-Q([1-4])$/);
  if (!m) return [];
  let y = +m[1], q = +m[2];
  const out = [];
  for (let i = 0; i < n; i++) {
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
    out.push(`${y}-Q${q}`);
  }
  return out;
}

/**
 * 최종 확정 전에 먼저 풀어야 할 건 — 기존 마이페이지 "최종 확정 차단"과 같은 기준.
 *  unverified: 결과(패 제외) 있음 && 미검증(K-APT·공고문·수동승인 모두 없음)
 *  waitingSupport: 지원으로 참여했는데 주담 결과 없음
 */
export function finalConfirmBlockers(pts, me) {
  const unverified = [];
  const waitingSupport = [];
  for (const pt of myPts(pts, me)) {
    if (pt.selfPT) continue;
    const tokens = parseAssignees(pt.ptAssignee);
    if (tokens.length > 1 && tokens[0] !== me && pt.results?.[me] === '지원' && !(pt.results?.[tokens[0]] || pt.result)) waitingSupport.push(pt);
    if (/감리/.test((pt.workType || '') + '|' + (pt.siteName || ''))) continue;
    const r = rawResultOf(pt, me);
    if (!r || r === '패') continue;
    const stl = pt.settlement?.[me] || {};
    if (stl.completed || stl.selfSales) continue;
    const evidence = pt.evidenceFiles && Object.keys(pt.evidenceFiles).length > 0;
    if (!(pt.kaptVerified?.status === 'verified' || evidence || stl.manualVerified)) unverified.push(pt);
  }
  return { unverified, waitingSupport };
}

/** 월별 PT 건수 — 이번 달 포함 최근 n개월 (마이페이지 #9a) */
export function monthlyCounts(pts, me, now = new Date(), n = 10) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: `${d.getMonth() + 1}월`, count: 0, current: i === 0 });
  }
  const idx = Object.fromEntries(out.map((m, i) => [m.key, i]));
  for (const pt of myPts(pts, me)) {
    const i = idx[String(pt.date || '').slice(0, 7)];
    if (i !== undefined) out[i].count += 1;
  }
  return out;
}

/**
 * 분기별 정산 이력 — PT 진행일 기준 분기, 본인 몫(제외 건 빼고 금액 > 0).
 *  status: 해당 분기 대상이 모두 지급 완료(completed)면 'paid', 아니면 'open'
 *  paidAt: 지급 완료 건 중 가장 늦은 completedAt
 */
export function quarterHistory(pts, me, limit = 6) {
  const byQ = {};
  for (const pt of myPts(pts, me)) {
    const m = String(pt.date || '').match(/^(\d{4})-(\d{2})/);
    if (!m) continue;
    const st = getSettlementStatus(pt, me);
    if (st === SETTLEMENT_STATUS.EXCLUDED) continue;
    const amt = calculateSettlementAmount(pt, me).amount || 0;
    if (!amt) continue;
    const key = `${m[1]}-Q${Math.ceil(+m[2] / 3)}`;
    const q = byQ[key] || (byQ[key] = { key, count: 0, amount: 0, paid: 0, allPaid: true, paidAt: '' });
    q.count += 1;
    q.amount += amt;
    if (st === SETTLEMENT_STATUS.COMPLETED) {
      q.paid += amt;
      const at = String(pt.settlement?.[me]?.completedAt || '');
      if (at > q.paidAt) q.paidAt = at;
    } else q.allPaid = false;
  }
  const rows = Object.values(byQ).sort((a, b) => b.key.localeCompare(a.key));
  const totalPaid = rows.reduce((s, q) => s + q.paid, 0);
  return { rows: rows.slice(0, limit).map(q => ({ ...q, status: q.allPaid ? 'paid' : 'open' })), totalPaid };
}

/** 분기 확인 카드 단계 — quarterConfirmations/{q}/{me} 를 그대로 해석 */
export function confirmStage(conf) {
  const c = conf || {};
  if (c.finalConfirmed) return 'final-done';
  if (c.finalRequestedAt) return 'final-pending';
  if (c.confirmed) return 'ok';
  return 'pending';
}
