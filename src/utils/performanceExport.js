// 실적 엑셀 — 분기 마감 확인용 (.xlsx, 시트: 담당자별 요약 · 상세)
// 결과·금액·정산 상태는 settlement.js 그대로 — 분기정산 화면과 같은 계산.

import {
  SETTLEMENT_STATUS,
  calculateSettlementAmount,
  deriveAssigneeResult,
  getSettlementStatus,
  isWinExceptionApproved,
} from './settlement.js';
import { parseAssignees, quarterPts } from './workbench.js';
import { SETTLEMENT_EXCLUDED_NAMES, aggregateQuarterSettlement, isQuarterSettlementTarget } from './quarterlySettlementCore.js';

// App 의 getQuarterSettlementOptions 와 같은 기준 — 지급 안 된 이전 분기 정산요청은 이월
const SETTLEMENT_OPTS = { includeLegacyCarryover: true };

export const STATUS_TEXT = {
  [SETTLEMENT_STATUS.UNSETTLED]: '미정산',
  [SETTLEMENT_STATUS.NEEDS_REVIEW]: '검토필요',
  [SETTLEMENT_STATUS.REQUESTED]: '정산요청',
  [SETTLEMENT_STATUS.CONFIRMED]: '정산확정',
  [SETTLEMENT_STATUS.COMPLETED]: '정산완료',
  [SETTLEMENT_STATUS.EXCLUDED]: '제외',
};
const KAPT_TEXT = { verified: '확인', cancelled: '취소공고', needs_review: '검토필요' };

// 공고 확인 근거 — 하나라도 있으면 확인됨(OPERATIONS §7). 없으면 '' (= 공고 확정 대기)
export function announcementBasis(pt, name) {
  const stl = pt?.settlement?.[name] || {};
  if (/감리/.test(`${pt?.workType || ''}|${pt?.siteName || ''}`)) return '감리(불필요)';
  if (pt?.kaptVerified?.status === 'verified') return 'K-APT';
  if (Object.values(pt?.evidenceFiles || {}).some(f => f && !f.suppressed)) return '잔디 공고문';
  if (isWinExceptionApproved(pt, name)) return '예외 승인';
  if (stl.manualVerified || stl.reviewBypassedBy) return '관리자 승인';
  return '';
}
// 대기 건이 지금 어디서 막혀 있는지 — 매일 재확인 결과 우선
const RECHECK_TEXT = {
  jandi_document_not_found: '잔디 공고문 못 찾음',
  jandi_candidates_need_review: '공고문 후보 있음 · 검토 필요',
  jandi_multiple_documents_need_review: '공고문 여러 개 · 검토 필요',
  site_not_found: 'K-APT 단지 못 찾음',
};
function pendingReason(pt) {
  const r = pt?.announcementRecheck;
  if (r?.reason && RECHECK_TEXT[r.reason]) return RECHECK_TEXT[r.reason];
  if (pt?.kaptVerified?.status === 'needs_review') return 'K-APT 미매칭';
  return '아직 확인 전';
}

export const DETAIL_HEADER = ['날짜', '시간', '현장명', '주소', '공종', '담당자', '역할', '요청사', '경쟁사', '공고문 공법', '결과', 'K-APT', '정산 상태', '예상 금액', '분기정산 대상', '공고 확인', '비고'];
export const SUMMARY_HEADER = ['담당자', 'PT', '승', '무', '패', '지원', '결과 미입력', '승률', '검토필요', '정산요청', '예상 금액', '분기정산 금액', '공고 확정 대기', '대기 금액', '확정 시 합계', '비고'];
export const PENDING_HEADER = ['날짜', '현장명', '주소', '공종', '담당자', '역할', '결과', '금액', '정산 상태', '지금 상태'];

/**
 * 분기 PT → 담당자(참여 토큰)별 상세 행 + 담당자별 요약 행 + 공고 확정 대기 행.
 *  예상 금액: 결과가 있는 모든 건(제외는 0). 분기정산 금액: 분기정산 화면과 같은 대상(정산요청·수동확인, 이월 포함)만.
 *  공고 확정 대기: 금액이 있는데(승·무·지원) 공고 확인 근거가 없고 아직 분기정산 대상이 아닌 건 — 확인되면 정산으로 넘어갈 몫.
 *    (이미 분기정산 대상인 건은 분기정산 금액에 들어 있으므로 대기 금액에 넣지 않는다 — 중복 없음)
 *  정산 제외 명단(SETTLEMENT_EXCLUDED_NAMES)은 비고에 표시하고 합계 금액에서 뺀다.
 */
export function buildPerformanceRows(pts, quarterKey, opts = SETTLEMENT_OPTS) {
  const agg = aggregateQuarterSettlement((pts || []).filter(Boolean), quarterKey, opts)?.perAssignee || {};
  const list = quarterPts((pts || []).filter(pt => pt && pt.date && !pt.isDuplicate), quarterKey)
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')));
  const detail = [];
  const pending = [];
  const by = {};
  for (const pt of list) {
    const names = parseAssignees(pt.ptAssignee);
    for (const [i, name] of names.entries()) {
      const result = deriveAssigneeResult(pt, name) || '';
      const status = result ? getSettlementStatus(pt, name) : null;
      const amount = result && status !== SETTLEMENT_STATUS.EXCLUDED ? calculateSettlementAmount(pt, name).amount || 0 : 0;
      const excludedName = SETTLEMENT_EXCLUDED_NAMES.includes(name);
      const target = !excludedName && isQuarterSettlementTarget(pt, name, quarterKey, opts);
      const basis = amount > 0 ? announcementBasis(pt, name) : '';
      const paid = status === SETTLEMENT_STATUS.COMPLETED || status === SETTLEMENT_STATUS.CONFIRMED;
      const isPending = amount > 0 && !basis && !target && !paid && !excludedName;
      const note = [
        pt.settlement?.[name]?.selfSales && '본인영업',
        pt.selfPT && '협약사 자체PT',
        excludedName && '정산 제외 대상',
      ].filter(Boolean).join(', ');
      detail.push([
        pt.date, pt.time || '', pt.siteName || '', pt.address || '', pt.workType || '', name, i === 0 ? '주담' : '지원',
        pt.requester || '', pt.resultReasons?.[name]?.competitor || pt.competitor || '', pt.announcementMethods || '',
        result || '미입력', KAPT_TEXT[pt.kaptVerified?.status] || '', status ? STATUS_TEXT[status] : '', amount,
        target ? 'O' : '', amount > 0 ? (basis || (target || paid ? '미확인 · 정산요청됨' : '대기')) : '', note,
      ]);
      if (isPending) {
        pending.push([pt.date, pt.siteName || '', pt.address || '', pt.workType || '', name, i === 0 ? '주담' : '지원',
          result, amount, status ? STATUS_TEXT[status] : '', pendingReason(pt)]);
      }
      const s = by[name] || (by[name] = { name, pt: 0, w: 0, d: 0, l: 0, sup: 0, p: 0, review: 0, requested: 0, amount: 0, inTarget: 0, pend: 0, pendAmount: 0, excludedName });
      if (isPending) { s.pend += 1; s.pendAmount += amount; }
      if (target) s.inTarget += calculateSettlementAmount(pt, name).amount || 0;
      s.pt += 1;
      if (!result) s.p += 1;
      else if (result === '승') s.w += 1;
      else if (result === '무') s.d += 1;
      else if (result === '패') s.l += 1;
      else if (result === '지원') s.sup += 1;
      if (status === SETTLEMENT_STATUS.NEEDS_REVIEW) s.review += 1;
      if (status === SETTLEMENT_STATUS.REQUESTED) s.requested += 1;
      s.amount += amount;
    }
  }
  // 이전 분기 이월만 있는 담당자도 분기정산 금액이 있으면 요약에 넣는다
  for (const name of Object.keys(agg)) {
    if (!by[name]) by[name] = { name, pt: 0, w: 0, d: 0, l: 0, sup: 0, p: 0, review: 0, requested: 0, amount: 0, inTarget: 0, pend: 0, pendAmount: 0, excludedName: SETTLEMENT_EXCLUDED_NAMES.includes(name) };
  }
  for (const s of Object.values(by)) {
    s.stlAmount = s.excludedName ? 0 : agg[s.name]?.estimatedAmount || 0;
    const carry = s.stlAmount - s.inTarget;
    s.carryNote = carry > 0 ? `이전 분기 이월 ${carry.toLocaleString('ko-KR')}원 포함` : '';
  }
  const stats = Object.values(by).sort((a, b) => b.stlAmount - a.stlAmount || b.amount - a.amount || b.pt - a.pt);
  const rate = s => (s.w + s.l ? `${Math.round(s.w / (s.w + s.l) * 100)}%` : '—');
  const summary = stats.map(s => [s.name, s.pt, s.w, s.d, s.l, s.sup, s.p, rate(s), s.review, s.requested, s.excludedName ? 0 : s.amount, s.stlAmount,
    s.pend, s.pendAmount, s.stlAmount + s.pendAmount, s.excludedName ? '정산 제외 대상' : s.carryNote]);
  const t = stats.reduce((a, s) => ({
    pt: a.pt + s.pt, w: a.w + s.w, d: a.d + s.d, l: a.l + s.l, sup: a.sup + s.sup, p: a.p + s.p,
    review: a.review + s.review, requested: a.requested + s.requested, amount: a.amount + (s.excludedName ? 0 : s.amount), stl: a.stl + s.stlAmount,
    pend: a.pend + s.pend, pendAmount: a.pendAmount + s.pendAmount,
  }), { pt: 0, w: 0, d: 0, l: 0, sup: 0, p: 0, review: 0, requested: 0, amount: 0, stl: 0, pend: 0, pendAmount: 0 });
  const total = ['합계', t.pt, t.w, t.d, t.l, t.sup, t.p, rate(t), t.review, t.requested, t.amount, t.stl, t.pend, t.pendAmount, t.stl + t.pendAmount, ''];
  return { detail, summary, total, pending, ptCount: list.length };
}

export async function downloadPerformanceXlsx(pts, quarterKey, now = new Date()) {
  const { default: XLSX } = await import('xlsx-js-style');
  const { detail, summary, total, pending, ptCount } = buildPerformanceRows(pts, quarterKey);
  const [y, q] = String(quarterKey).split('-');
  const title = `${y}년 ${q.replace('Q', '')}분기 PT 실적`;
  const made = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 기준 · PT ${ptCount}건`;

  const head = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F4C75' } }, alignment: { horizontal: 'center', vertical: 'center' } };
  const bold = { font: { bold: true } };
  const won = '#,##0"원"';

  const sheet = (aoa, header, widths, moneyCols, boldLast) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths.map(wch => ({ wch }));
    const top = 3; // 제목 · 기준 · 빈 줄 다음이 헤더
    header.forEach((_, c) => { const ref = XLSX.utils.encode_cell({ r: top, c }); if (ws[ref]) ws[ref].s = head; });
    ws.A1.s = { font: { bold: true, sz: 14 } };
    for (let r = top + 1; r < aoa.length; r += 1) {
      for (const c of moneyCols) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref] && typeof ws[ref].v === 'number') { ws[ref].z = won; ws[ref].s = { numFmt: won }; }
      }
    }
    if (boldLast) {
      const r = aoa.length - 1;
      header.forEach((_, c) => { const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref]) ws[ref].s = { ...(ws[ref].s || {}), ...bold }; });
    }
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: top, c: 0 }, e: { r: Math.max(top, aoa.length - (boldLast ? 2 : 1)), c: header.length - 1 } }) };
    return ws;
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([[`${title} — 담당자별 요약`], [`${made} · 확정 시 합계 = 분기정산 금액 + 공고 확정 대기 금액`], [], SUMMARY_HEADER, ...summary, total], SUMMARY_HEADER, [10, 6, 6, 6, 6, 6, 10, 8, 9, 9, 14, 14, 12, 14, 14, 18], [10, 11, 13, 14], true), '담당자별 요약');
  const pendSum = pending.reduce((s, r) => s + (r[7] || 0), 0);
  XLSX.utils.book_append_sheet(wb, sheet([[`${title} — 공고 확정 대기`], [`${made} · 대기 ${pending.length}건 · ${pendSum.toLocaleString('ko-KR')}원 · 공고문이 확인되면 정산 대상으로 넘어가요`], [], PENDING_HEADER, ...pending], PENDING_HEADER, [11, 24, 30, 12, 8, 6, 7, 12, 10, 26], [7], false), '공고 확정 대기');
  XLSX.utils.book_append_sheet(wb, sheet([[`${title} — 상세`], [made], [], DETAIL_HEADER, ...detail], DETAIL_HEADER, [11, 7, 24, 30, 12, 8, 6, 16, 14, 16, 7, 9, 10, 12, 12, 12, 16], [13], false), '상세');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `PT실적_${y}_${q.replace('Q', '')}분기_${made.slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
