// 실적 엑셀 — 분기 마감 확인용 (.xlsx, 시트: 담당자별 요약 · 상세)
// 결과·금액·정산 상태는 settlement.js 그대로 — 분기정산 화면과 같은 계산.

import {
  SETTLEMENT_STATUS,
  calculateSettlementAmount,
  deriveAssigneeResult,
  getSettlementStatus,
} from './settlement.js';
import { parseAssignees, quarterPts } from './workbench.js';
import { SETTLEMENT_EXCLUDED_NAMES } from './quarterlySettlementCore.js';

export const STATUS_TEXT = {
  [SETTLEMENT_STATUS.UNSETTLED]: '미정산',
  [SETTLEMENT_STATUS.NEEDS_REVIEW]: '검토필요',
  [SETTLEMENT_STATUS.REQUESTED]: '정산요청',
  [SETTLEMENT_STATUS.CONFIRMED]: '정산확정',
  [SETTLEMENT_STATUS.COMPLETED]: '정산완료',
  [SETTLEMENT_STATUS.EXCLUDED]: '제외',
};
const KAPT_TEXT = { verified: '확인', cancelled: '취소공고', needs_review: '검토필요' };

export const DETAIL_HEADER = ['날짜', '시간', '현장명', '주소', '공종', '담당자', '역할', '요청사', '경쟁사', '공고문 공법', '결과', 'K-APT', '정산 상태', '정산 금액', '비고'];
export const SUMMARY_HEADER = ['담당자', 'PT', '승', '무', '패', '지원', '결과 미입력', '승률', '검토필요', '정산요청', '정산 금액', '비고'];

/**
 * 분기 PT → 담당자(참여 토큰)별 상세 행 + 담당자별 요약 행.
 *  금액은 제외·결과없음이면 0. 정산 제외 명단(SETTLEMENT_EXCLUDED_NAMES)은 비고에 표시하고 합계 금액에서 뺀다.
 */
export function buildPerformanceRows(pts, quarterKey) {
  const list = quarterPts((pts || []).filter(pt => pt && pt.date && !pt.isDuplicate), quarterKey)
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')));
  const detail = [];
  const by = {};
  for (const pt of list) {
    const names = parseAssignees(pt.ptAssignee);
    for (const [i, name] of names.entries()) {
      const result = deriveAssigneeResult(pt, name) || '';
      const status = result ? getSettlementStatus(pt, name) : null;
      const amount = result && status !== SETTLEMENT_STATUS.EXCLUDED ? calculateSettlementAmount(pt, name).amount || 0 : 0;
      const excludedName = SETTLEMENT_EXCLUDED_NAMES.includes(name);
      const note = [
        pt.settlement?.[name]?.selfSales && '본인영업',
        pt.selfPT && '협약사 자체PT',
        excludedName && '정산 제외 대상',
      ].filter(Boolean).join(', ');
      detail.push([
        pt.date, pt.time || '', pt.siteName || '', pt.address || '', pt.workType || '', name, i === 0 ? '주담' : '지원',
        pt.requester || '', pt.resultReasons?.[name]?.competitor || pt.competitor || '', pt.announcementMethods || '',
        result || '미입력', KAPT_TEXT[pt.kaptVerified?.status] || '', status ? STATUS_TEXT[status] : '', amount, note,
      ]);
      const s = by[name] || (by[name] = { name, pt: 0, w: 0, d: 0, l: 0, sup: 0, p: 0, review: 0, requested: 0, amount: 0, excludedName });
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
  const stats = Object.values(by).sort((a, b) => b.amount - a.amount || b.pt - a.pt);
  const rate = s => (s.w + s.l ? `${Math.round(s.w / (s.w + s.l) * 100)}%` : '—');
  const summary = stats.map(s => [s.name, s.pt, s.w, s.d, s.l, s.sup, s.p, rate(s), s.review, s.requested, s.excludedName ? 0 : s.amount, s.excludedName ? '정산 제외 대상' : '']);
  const t = stats.reduce((a, s) => ({
    pt: a.pt + s.pt, w: a.w + s.w, d: a.d + s.d, l: a.l + s.l, sup: a.sup + s.sup, p: a.p + s.p,
    review: a.review + s.review, requested: a.requested + s.requested, amount: a.amount + (s.excludedName ? 0 : s.amount),
  }), { pt: 0, w: 0, d: 0, l: 0, sup: 0, p: 0, review: 0, requested: 0, amount: 0 });
  const total = ['합계', t.pt, t.w, t.d, t.l, t.sup, t.p, rate(t), t.review, t.requested, t.amount, ''];
  return { detail, summary, total, ptCount: list.length };
}

export async function downloadPerformanceXlsx(pts, quarterKey, now = new Date()) {
  const { default: XLSX } = await import('xlsx-js-style');
  const { detail, summary, total, ptCount } = buildPerformanceRows(pts, quarterKey);
  const [y, q] = String(quarterKey).split('-');
  const title = `${y}년 ${q.replace('Q', '')}분기 PT 실적`;
  const made = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 기준 · PT ${ptCount}건`;

  const head = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F4C75' } }, alignment: { horizontal: 'center', vertical: 'center' } };
  const bold = { font: { bold: true } };
  const won = '#,##0"원"';

  const sheet = (aoa, header, widths, moneyCol, boldLast) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths.map(wch => ({ wch }));
    const top = 3; // 제목 · 기준 · 빈 줄 다음이 헤더
    header.forEach((_, c) => { const ref = XLSX.utils.encode_cell({ r: top, c }); if (ws[ref]) ws[ref].s = head; });
    ws.A1.s = { font: { bold: true, sz: 14 } };
    for (let r = top + 1; r < aoa.length; r += 1) {
      const ref = XLSX.utils.encode_cell({ r, c: moneyCol });
      if (ws[ref] && typeof ws[ref].v === 'number') { ws[ref].z = won; ws[ref].s = { numFmt: won }; }
    }
    if (boldLast) {
      const r = aoa.length - 1;
      header.forEach((_, c) => { const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref]) ws[ref].s = { ...(ws[ref].s || {}), ...bold }; });
    }
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: top, c: 0 }, e: { r: Math.max(top, aoa.length - (boldLast ? 2 : 1)), c: header.length - 1 } }) };
    return ws;
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([[`${title} — 담당자별 요약`], [made], [], SUMMARY_HEADER, ...summary, total], SUMMARY_HEADER, [10, 6, 6, 6, 6, 6, 10, 8, 9, 9, 14, 14], 10, true), '담당자별 요약');
  XLSX.utils.book_append_sheet(wb, sheet([[`${title} — 상세`], [made], [], DETAIL_HEADER, ...detail], DETAIL_HEADER, [11, 7, 24, 30, 12, 8, 6, 16, 14, 16, 7, 9, 10, 12, 16], 13, false), '상세');

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
