// 분기 보고서 (PT 정산 + 주말출근 상세) 데이터 집계 + Excel/PDF 생성
// 발송 흐름: admin 확인 → 김유림(yurim@netformrnd.com) 발송
// 발송 시점: 해당 분기 끝난 다음달 마지막 주 월요일 14:00 KST

import * as XLSX from 'xlsx';

// 정산 대상 담당자 (7명)
// 이 명단에 포함된 담당자의 데이터만 보고서 집계에 사용
export const SETTLEMENT_ASSIGNEES = [
  '황윤선', '이필선', '한준엽', '한인규', '조재연', '정정훈', '김성민',
];
const SETTLEMENT_ASSIGNEES_SET = new Set(SETTLEMENT_ASSIGNEES);

// === 분기 날짜 범위 ===
export function getQuarterRange(year, quarter) {
  const y = parseInt(year);
  if (quarter === 1) return { start: `${y}-01-01`, end: `${y}-03-31`, label: '1분기' };
  if (quarter === 2) return { start: `${y}-04-01`, end: `${y}-06-30`, label: '2분기' };
  if (quarter === 3) return { start: `${y}-07-01`, end: `${y}-09-30`, label: '3분기' };
  if (quarter === 4) return { start: `${y}-10-01`, end: `${y}-12-31`, label: '4분기' };
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: '연간' };
}

// === 해당 월의 마지막 주 월요일 (1=월요일) ===
function getLastMondayOfMonth(year, month) {
  // month: 1~12
  const d = new Date(year, month, 0); // 해당 월의 마지막 날
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// === 분기 발송 시점 (분기 끝난 다음달 마지막 주 월요일 14:00) ===
export function getQuarterDeadline(year, quarter) {
  const y = parseInt(year);
  if (quarter === 1) return getLastMondayOfMonth(y, 4);     // 4월 마지막 주 월요일
  if (quarter === 2) return getLastMondayOfMonth(y, 7);     // 7월 마지막 주 월요일
  if (quarter === 3) return getLastMondayOfMonth(y, 10);    // 10월 마지막 주 월요일
  if (quarter === 4) return getLastMondayOfMonth(y + 1, 1); // 차년도 1월 마지막 주 월요일
  return null;
}

// === 헬퍼 ===
function inRange(dateStr, range) {
  if (!dateStr) return false;
  return dateStr >= range.start && dateStr <= range.end;
}

function parseAssignees(s) {
  if (!s) return [];
  return s.split(/[\/,+&]/).map(a => a.trim()).filter(a => a);
}

function isWeekend(dateStr) {
  const day = new Date(dateStr).getDay();
  return day === 0 || day === 6;
}

function dayName(dateStr) {
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr).getDay()];
}

function getPtResult(s, assignee) {
  if (s.results && s.results[assignee]) return s.results[assignee];
  const assignees = parseAssignees(s.ptAssignee);
  if (assignees.length > 1) return null;
  return s.result || null;
}

function isSelfSales(s, assignee) {
  return s.settlement?.[assignee]?.selfSales || false;
}

function isSettlementCompleted(s, assignee) {
  const set = s.settlement?.[assignee];
  return set?.completed || set?.selfSales || false;
}

function isSettlementRequested(s, assignee) {
  return s.settlement?.[assignee]?.requested || false;
}

function getSettlementAmount(s, assignee) {
  if (s.selfPT) return 0;
  if (isSelfSales(s, assignee)) return 0;
  const r = getPtResult(s, assignee);
  if (r === '승') return 500000;
  if (r === '무') return 250000;
  if (r === '지원') return 250000;
  return 0;
}

// === PT 검증 게이트 (Phase 1.6, 단순 룰) ===
function isPtVerified(s, assignee) {
  if (s.selfPT) return true;
  const r = getPtResult(s, assignee);
  if (!r) return false;
  if (r === '패') return true;
  if (!s.bidNo || !String(s.bidNo).trim()) return false;
  return true;
}

function getVerifyReason(s, assignee) {
  if (s.selfPT) return '';
  const r = getPtResult(s, assignee);
  if (!r) return '결과 미입력';
  if (r === '패') return '';
  if (!s.bidNo || !String(s.bidNo).trim()) return '공고번호 미입력';
  return '';
}

// === 메인 집계 ===
// 정산 대상 7명(SETTLEMENT_ASSIGNEES)만 집계
// 주말출근: PT 일정만 (현설·세미나·영업 모두 제외)
// PT 정산: 승/무/지원만 (패 제외)
export function aggregateQuarterlyReport(allData, year, quarter) {
  const range = getQuarterRange(year, quarter);
  const { ptSchedules = [] } = allData;

  // --- 주말 출근 집계 (PT 일정만, 정산담당자 7명만) ---
  const weekendItems = [];
  ptSchedules.forEach(s => {
    if (!s.date || !inRange(s.date, range)) return;
    if (s.dateType && s.dateType !== 'confirmed') return;
    if (s.selfPT) return;
    if (!isWeekend(s.date)) return;
    const assignees = parseAssignees(s.ptAssignee || '');
    assignees.forEach(a => {
      if (!SETTLEMENT_ASSIGNEES_SET.has(a)) return;
      weekendItems.push({
        date: s.date,
        dayName: dayName(s.date),
        siteName: s.siteName || '',
        assignee: a,
        weighted: 1.5,
      });
    });
  });

  // 담당자별 주말 출근 합계
  const weekendByAssignee = {};
  SETTLEMENT_ASSIGNEES.forEach(a => { weekendByAssignee[a] = { count: 0, weighted: 0 }; });
  weekendItems.forEach(w => {
    weekendByAssignee[w.assignee].count += 1;
    weekendByAssignee[w.assignee].weighted += 1.5;
  });

  // --- PT 집계 (정산담당자 7명만, 승/무/지원만 — 패 제외) ---
  // ⚠️ 정산 기준일: 결과 확정일(resultConfirmDate)
  //  - PT 진행일이 아닌 "승/무/패가 확정된 시점"이 분기 내 들어가야 함
  //  - 예: 3/28에 진행한 PT라도 결과가 4/2에 확정되면 → 2분기 정산
  //  - 예: 2/15에 진행한 PT가 3/30에 확정되면 → 1분기 정산
  //  - resultConfirmDate가 없으면 s.date로 fallback (레거시 데이터)
  const SETTLEMENT_RESULTS = new Set(['승', '무', '지원']);
  const ptVerified = [];        // 정산 대상 (승/무/지원 + 검증통과)
  const ptUnverified = [];      // 관리자 확인 필요
  ptSchedules.forEach(s => {
    if (!s.date) return;
    if (s.dateType && s.dateType !== 'confirmed') return;
    const assignees = parseAssignees(s.ptAssignee);
    assignees.forEach(a => {
      if (!SETTLEMENT_ASSIGNEES_SET.has(a)) return;
      const result = getPtResult(s, a);
      if (!SETTLEMENT_RESULTS.has(result)) return; // 패·미입력 제외
      // 정산 기준일: resultConfirmDate (없으면 s.date fallback)
      const confirmDate = (s.resultConfirmDate && s.resultConfirmDate[a]) || s.date;
      if (!inRange(confirmDate, range)) return;
      const verified = isPtVerified(s, a);
      const row = {
        date: s.date,
        confirmDate,
        bidNo: s.bidNo || '',
        siteName: s.siteName || '',
        assignee: a,
        result,
        settlementStatus: isSettlementCompleted(s, a) ? '정산완료'
          : (isSettlementRequested(s, a) ? '정산요청' : '미정산'),
        amount: getSettlementAmount(s, a),
        selfPT: !!s.selfPT,
        note: s.note || '',
        verifyReason: getVerifyReason(s, a),
      };
      if (verified) ptVerified.push(row);
      else ptUnverified.push(row);
    });
  });

  // --- 담당자별 그룹핑 (PT 정산 + 주말출근) ---
  // byAssignee[담당자] = { weekendItems, ptItems, weekendCount, weekendWeighted, ptCount, settlementAmount, ... }
  const byAssignee = {};
  SETTLEMENT_ASSIGNEES.forEach(a => {
    byAssignee[a] = {
      assignee: a,
      weekendItems: [],
      ptItems: [],
    };
  });
  weekendItems.forEach(w => { byAssignee[w.assignee].weekendItems.push(w); });
  ptVerified.forEach(p => { byAssignee[p.assignee].ptItems.push(p); });
  // 날짜순 정렬
  SETTLEMENT_ASSIGNEES.forEach(a => {
    byAssignee[a].weekendItems.sort((x, y) => x.date.localeCompare(y.date));
    byAssignee[a].ptItems.sort((x, y) => x.date.localeCompare(y.date));
  });

  // --- 담당자 요약 (7명 전원 표시) ---
  const summary = SETTLEMENT_ASSIGNEES.map(assignee => {
    const w = weekendByAssignee[assignee];
    const ptList = byAssignee[assignee].ptItems;
    return {
      assignee,
      weekendDays: w.count,
      weekendWeighted: w.weighted,
      ptCount: ptList.length,
      ptWin: ptList.filter(r => r.result === '승').length,
      ptDraw: ptList.filter(r => r.result === '무').length,
      ptSupport: ptList.filter(r => r.result === '지원').length,
      settlementAmount: ptList.reduce((s, r) => s + r.amount, 0),
    };
  });

  // --- 월별 매트릭스 (PT + 주말만) ---
  const months = quarter === 1 ? ['01','02','03']
    : quarter === 2 ? ['04','05','06']
    : quarter === 3 ? ['07','08','09']
    : ['10','11','12'];

  const monthly = {};
  SETTLEMENT_ASSIGNEES.forEach(a => {
    monthly[a] = {};
    months.forEach(m => { monthly[a][m] = { pt: 0, weekend: 0 }; });
  });
  ptVerified.forEach(r => { const m = r.date.slice(5,7); monthly[r.assignee][m].pt += 1; });
  weekendItems.forEach(w => { const m = w.date.slice(5,7); monthly[w.assignee][m].weekend += 1; });

  const totals = {
    weekendDays: summary.reduce((s, r) => s + r.weekendDays, 0),
    weekendWeighted: summary.reduce((s, r) => s + r.weekendWeighted, 0),
    ptCount: summary.reduce((s, r) => s + r.ptCount, 0),
    ptWin: summary.reduce((s, r) => s + r.ptWin, 0),
    ptDraw: summary.reduce((s, r) => s + r.ptDraw, 0),
    ptSupport: summary.reduce((s, r) => s + r.ptSupport, 0),
    settlementAmount: summary.reduce((s, r) => s + r.settlementAmount, 0),
  };

  return {
    range, summary, weekendItems, weekendByAssignee, byAssignee,
    ptVerified, ptUnverified, monthly, months, totals, year, quarter,
  };
}

// === Excel 생성 ===
export function generateExcelBlob(report) {
  const { range, summary, weekendByAssignee, byAssignee, monthly, months, totals, year } = report;
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `${year}년 ${range.label} 보고서`,
    Subject: 'PT 정산 + 주말출근',
    Author: 'POUR영업운영시스템',
    CreatedDate: new Date(),
  };

  // ----- Sheet1: 표지 + 담당자별 요약 -----
  const summaryRows = summary.map(r => [
    r.assignee, r.weekendDays, r.weekendWeighted,
    r.ptCount, r.ptWin, r.ptDraw, r.ptSupport, r.settlementAmount,
  ]);
  const totalRow = [
    '합계',
    totals.weekendDays, totals.weekendWeighted,
    totals.ptCount, totals.ptWin, totals.ptDraw, totals.ptSupport,
    totals.settlementAmount,
  ];

  const sheet1Data = [
    [`${year}년 ${range.label} 보고서`],
    [`기간: ${range.start} ~ ${range.end}`],
    [`발송일: ${new Date().toISOString().slice(0,10)} · 수신: 김유림(yurim@netformrnd.com)`],
    [],
    ['【 분기 핵심 지표 】'],
    ['항목', '값'],
    ['주말 출근 일수 (PT만)', totals.weekendDays + '일'],
    ['주말 환산 일수 (×1.5)', totals.weekendWeighted.toFixed(1) + '일'],
    ['PT 정산 건수 (승/무/지원)', totals.ptCount + '건'],
    ['PT 결과 분포', `승 ${totals.ptWin} / 무 ${totals.ptDraw} / 지원 ${totals.ptSupport}`],
    ['정산금액 합계', totals.settlementAmount.toLocaleString() + '원'],
    [],
    ['【 담당자별 요약 】'],
    ['담당자', '주말출근(일)', '환산(×1.5)', 'PT건수', '승', '무', '지원', '정산금액(원)'],
    ...summaryRows,
    totalRow,
    [],
    ['【 PT 결과 판정 기준 】'],
    ['결과', '기준', '정산 단가'],
    ['승', 'POUR 공법 단독 입찰', '500,000원'],
    ['무', 'POUR 공법 + 타공법 동시 입찰 (예: 4A시스템 등)', '250,000원'],
    ['지원', '한 현장 2명 이상 — 1명 승리(주영업), 나머지 지원', '250,000원'],
    [],
    ['※ 주말 출근 집계는 PT 일정만 포함 (현설·세미나·영업·개인 일정 제외)'],
    ['※ 패배 건은 정산금액 0원이므로 본 보고서에서 제외'],
    ['※ 협약사 자체PT(selfPT) 및 본인영업 건은 정산 대상에서 제외 (0원 처리)'],
    ['※ 주말 출근 1일 = 환산 1.5일 (보상연차 환산)'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
    { wch: 6 }, { wch: 6 }, { wch: 8 }, { wch: 16 },
  ];
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } },
    { s: { r: 12, c: 0 }, e: { r: 12, c: 7 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, '표지·요약');

  // ----- Sheet2: 주말 출근 (담당자별 합계 + 상세) -----
  const weekendData = [
    ['주말 출근 (PT 일정만 집계 · 연차 지급 기준)'],
    ['※ 주말 1일 = 환산 1.5일 (보상연차)'],
    [],
    ['【 담당자별 합계 】'],
    ['담당자', '건수', '환산일수(×1.5)'],
    ...SETTLEMENT_ASSIGNEES.map(a => {
      const w = weekendByAssignee[a];
      return [a, w.count, w.weighted];
    }),
    ['합계', totals.weekendDays, totals.weekendWeighted],
    [],
    ['【 담당자별 상세 】'],
  ];
  SETTLEMENT_ASSIGNEES.forEach(a => {
    const items = byAssignee[a].weekendItems;
    weekendData.push([`■ ${a} (${items.length}건 · 환산 ${(items.length * 1.5).toFixed(1)}일)`]);
    if (items.length === 0) {
      weekendData.push(['  - 해당 분기 주말 출근 없음']);
    } else {
      weekendData.push(['날짜', '요일', '현장명', '환산일수']);
      items.forEach(r => weekendData.push([r.date, r.dayName, r.siteName, r.weighted]));
    }
    weekendData.push([]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(weekendData);
  ws2['!cols'] = [{wch:14},{wch:8},{wch:32},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws2, '주말출근');

  // ----- Sheet3: PT 정산 상세 (담당자별 그룹) -----
  const ptData = [
    ['PT 정산 상세 (승/무/지원 · 정산금액 합산 대상)'],
    ['※ 자체PT(selfPT)는 정산 제외 / 본인영업은 정산금액 0원 / 패배 건 제외'],
    [],
    ['【 담당자별 합계 】'],
    ['담당자', 'PT 건수', '승', '무', '지원', '정산금액(원)'],
    ...summary.map(r => [r.assignee, r.ptCount, r.ptWin, r.ptDraw, r.ptSupport, r.settlementAmount]),
    totalRow.filter((_,i)=>[0,3,4,5,6,7].includes(i)),
    [],
    ['【 담당자별 상세 】'],
  ];
  SETTLEMENT_ASSIGNEES.forEach(a => {
    const items = byAssignee[a].ptItems;
    const subSum = items.reduce((s, r) => s + r.amount, 0);
    ptData.push([`■ ${a} (${items.length}건 · ${subSum.toLocaleString()}원)`]);
    if (items.length === 0) {
      ptData.push(['  - 해당 분기 정산 대상 PT 없음']);
    } else {
      ptData.push(['날짜', '공고번호', '단지명', '결과', '정산상태', '정산금액(원)', '자체PT', '비고']);
      items.forEach(r => ptData.push([
        r.date, r.bidNo, r.siteName, r.result,
        r.settlementStatus, r.amount, r.selfPT ? 'O' : '', r.note,
      ]));
    }
    ptData.push([]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(ptData);
  ws3['!cols'] = [{wch:12},{wch:14},{wch:28},{wch:6},{wch:10},{wch:14},{wch:8},{wch:25}];
  XLSX.utils.book_append_sheet(wb, ws3, 'PT정산상세');

  // ----- Sheet4: 월별 집계 매트릭스 (PT + 주말) -----
  const monthLabels = months.map(m => parseInt(m) + '월');
  const monthHeader = ['담당자', ...monthLabels.flatMap(m => [`${m} PT`, `${m} 주말`])];
  const monthRows = SETTLEMENT_ASSIGNEES.map(a => {
    const row = [a];
    months.forEach(m => {
      const v = monthly[a][m] || { pt: 0, weekend: 0 };
      row.push(v.pt, v.weekend);
    });
    return row;
  });
  const sheet4Data = [
    [`월별 집계 매트릭스 (${range.label} · 담당자 × 월)`],
    [],
    monthHeader,
    ...monthRows,
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
  const colW = [{wch:12}];
  months.forEach(() => colW.push({wch:8},{wch:8}));
  ws4['!cols'] = colW;
  ws4['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: monthHeader.length - 1 } }];
  XLSX.utils.book_append_sheet(wb, ws4, '월별집계');

  const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// === HTML 보고서 (PDF 변환용) ===
export function buildReportHTML(report) {
  const { range, summary, byAssignee, weekendByAssignee, totals, year } = report;
  const today = new Date().toISOString().slice(0, 10);

  // 담당자별 주말출근 합계 카드 (7개)
  const weekendAssigneeCardsHtml = SETTLEMENT_ASSIGNEES.map(a => {
    const w = weekendByAssignee[a];
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;">
        <div style="font-size:12px;color:#475569;font-weight:600;">${escapeHtml(a)}</div>
        <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:baseline;">
          <div style="font-size:11px;color:#94a3b8;">${w.count}건 →</div>
          <div style="font-size:18px;font-weight:700;color:${w.weighted > 0 ? '#2563eb' : '#cbd5e1'};">${w.weighted.toFixed(1)}<span style="font-size:11px;color:#94a3b8;font-weight:500;margin-left:2px;">일</span></div>
        </div>
      </div>
    `;
  }).join('');

  // 담당자별 주말출근 상세 섹션
  const weekendDetailSectionsHtml = SETTLEMENT_ASSIGNEES.map(a => {
    const items = byAssignee[a].weekendItems;
    if (items.length === 0) return '';
    const rows = items.map(r => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px 12px;font-family:'Consolas',monospace;color:#475569;font-size:12px;">${r.date} <span style="color:#2563eb;font-weight:600;">(${r.dayName})</span></td>
        <td style="padding:8px 12px;color:#1e293b;font-size:12px;">${escapeHtml(r.siteName)}</td>
        <td style="padding:8px 12px;text-align:right;color:#2563eb;font-weight:700;font-size:13px;">${r.weighted.toFixed(1)}일</td>
      </tr>
    `).join('');
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
          <div style="font-size:13px;font-weight:700;color:#1e293b;">${escapeHtml(a)}</div>
          <div style="font-size:11px;color:#64748b;">${items.length}건 · 환산 ${(items.length * 1.5).toFixed(1)}일</div>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;color:#64748b;border-bottom:1px solid #e2e8f0;">
              <th style="padding:7px 12px;text-align:left;font-weight:600;font-size:11px;">날짜</th>
              <th style="padding:7px 12px;text-align:left;font-weight:600;font-size:11px;">현장명</th>
              <th style="padding:7px 12px;text-align:right;font-weight:600;font-size:11px;">환산</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  // 담당자별 PT 정산 상세 섹션
  const ptDetailSectionsHtml = SETTLEMENT_ASSIGNEES.map(a => {
    const items = byAssignee[a].ptItems;
    const subSum = items.reduce((s, r) => s + r.amount, 0);
    if (items.length === 0) return '';
    const rows = items.map(r => {
      const resultColor = r.result === '승' ? '#16a34a' : r.result === '무' ? '#2563eb' : '#7c3aed';
      const resultBg = r.result === '승' ? '#dcfce7' : r.result === '무' ? '#dbeafe' : '#ede9fe';
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 12px;font-family:'Consolas',monospace;color:#475569;font-size:12px;">${r.date}</td>
          <td style="padding:8px 12px;font-family:'Consolas',monospace;color:#64748b;font-size:11px;">${escapeHtml(r.bidNo) || '-'}</td>
          <td style="padding:8px 12px;color:#1e293b;font-weight:500;font-size:12px;">${escapeHtml(r.siteName)}</td>
          <td style="padding:8px 12px;text-align:center;"><span style="display:inline-block;padding:2px 8px;background:${resultBg};color:${resultColor};border-radius:8px;font-size:11px;font-weight:700;">${r.result}</span></td>
          <td style="padding:8px 12px;text-align:right;color:${r.amount > 0 ? '#1e293b' : '#94a3b8'};font-weight:600;font-size:12px;">${r.amount.toLocaleString()}원</td>
          <td style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;">${r.settlementStatus}</td>
        </tr>
      `;
    }).join('');
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
          <div style="font-size:13px;font-weight:700;color:#1e293b;">${escapeHtml(a)}</div>
          <div style="font-size:11px;color:#64748b;">${items.length}건 · <span style="color:#2563eb;font-weight:600;">${subSum.toLocaleString()}원</span></div>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;color:#64748b;border-bottom:1px solid #e2e8f0;">
              <th style="padding:7px 12px;text-align:left;font-weight:600;font-size:11px;">날짜</th>
              <th style="padding:7px 12px;text-align:left;font-weight:600;font-size:11px;">공고번호</th>
              <th style="padding:7px 12px;text-align:left;font-weight:600;font-size:11px;">단지명</th>
              <th style="padding:7px 12px;text-align:center;font-weight:600;font-size:11px;">결과</th>
              <th style="padding:7px 12px;text-align:right;font-weight:600;font-size:11px;">정산금액</th>
              <th style="padding:7px 12px;text-align:center;font-weight:600;font-size:11px;">상태</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  // 담당자 요약 테이블 행
  const summaryRowsHtml = summary.map(r => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 14px;font-weight:600;color:#1e293b;">${escapeHtml(r.assignee)}</td>
      <td style="padding:10px 14px;text-align:center;color:#475569;">${r.weekendDays}일</td>
      <td style="padding:10px 14px;text-align:center;color:#2563eb;font-weight:700;">${r.weekendWeighted.toFixed(1)}일</td>
      <td style="padding:10px 14px;text-align:center;color:#475569;">${r.ptCount}건</td>
      <td style="padding:10px 14px;text-align:center;color:#64748b;font-size:12px;">${r.ptWin}/${r.ptDraw}/${r.ptSupport}</td>
      <td style="padding:10px 14px;text-align:right;color:#2563eb;font-weight:700;">${r.settlementAmount.toLocaleString()}원</td>
    </tr>
  `).join('');

  return `
<div style="width:1100px;background:#ffffff;font-family:-apple-system,'Pretendard','Malgun Gothic',sans-serif;color:#1e293b;line-height:1.5;">

  <!-- ===== 표지 ===== -->
  <div style="background:#ffffff;padding:40px 48px 28px;border-bottom:1px solid #e2e8f0;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:6px;">POUR영업운영시스템</div>
        <div style="font-size:28px;font-weight:700;color:#1e293b;letter-spacing:-0.5px;">${year}년 ${range.label} 보고서</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">PT 정산 · 주말 출근</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;">
        <div>발송일 ${today}</div>
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:24px;font-size:13px;color:#475569;">
      <div><span style="color:#94a3b8;">기간</span> <span style="font-weight:600;color:#1e293b;margin-left:6px;">${range.start} ~ ${range.end}</span></div>
      <div><span style="color:#94a3b8;">수신</span> <span style="font-weight:600;color:#1e293b;margin-left:6px;">김유림 (yurim@netformrnd.com)</span></div>
    </div>
  </div>

  <!-- ===== KPI 카드 ===== -->
  <div style="padding:24px 48px;background:#f8fafc;">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">주말 출근 환산일수</div>
        <div style="font-size:28px;font-weight:700;color:#2563eb;margin-top:8px;">${totals.weekendWeighted.toFixed(1)}<span style="font-size:14px;color:#94a3b8;font-weight:500;margin-left:4px;">일</span></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">실제 ${totals.weekendDays}일 × 1.5배 (PT만)</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">정산 PT 건수</div>
        <div style="font-size:28px;font-weight:700;color:#2563eb;margin-top:8px;">${totals.ptCount}<span style="font-size:14px;color:#94a3b8;font-weight:500;margin-left:4px;">건</span></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">승 ${totals.ptWin} · 무 ${totals.ptDraw} · 지원 ${totals.ptSupport}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">정산금액 합계</div>
        <div style="font-size:24px;font-weight:700;color:#2563eb;margin-top:8px;">${totals.settlementAmount.toLocaleString()}<span style="font-size:14px;color:#94a3b8;font-weight:500;margin-left:4px;">원</span></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">승 × 50만 · 무/지원 × 25만</div>
      </div>
    </div>
  </div>

  <!-- ===== 담당자 요약 ===== -->
  <div style="padding:24px 48px 8px;">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px;">담당자별 분기 요약</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;border-bottom:1px solid #e2e8f0;">
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">담당자</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">주말출근</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">환산(×1.5)</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">PT 건수</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">승/무/지원</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;font-size:12px;">정산금액</th>
        </tr>
      </thead>
      <tbody>${summaryRowsHtml}</tbody>
      <tfoot>
        <tr style="background:#f8fafc;border-top:1px solid #cbd5e1;">
          <td style="padding:10px 14px;font-weight:700;color:#1e293b;">합계</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#475569;">${totals.weekendDays}일</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#2563eb;">${totals.weekendWeighted.toFixed(1)}일</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#475569;">${totals.ptCount}건</td>
          <td style="padding:10px 14px;text-align:center;font-weight:700;color:#64748b;">${totals.ptWin}/${totals.ptDraw}/${totals.ptSupport}</td>
          <td style="padding:10px 14px;text-align:right;font-weight:700;color:#2563eb;">${totals.settlementAmount.toLocaleString()}원</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ===== 주말 출근 (담당자별 합계 카드) ===== -->
  <div style="padding:20px 48px 8px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;color:#1e293b;">주말 출근 — 담당자별 합계</div>
      <div style="font-size:11px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:8px;">PT 일정만 · 1일 = 1.5일 환산</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
      ${weekendAssigneeCardsHtml}
    </div>
  </div>

  <!-- ===== 주말 출근 상세 (담당자별 그룹) ===== -->
  ${weekendDetailSectionsHtml ? `
  <div style="padding:20px 48px 8px;">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px;">주말 출근 상세</div>
    ${weekendDetailSectionsHtml}
  </div>` : ''}

  <!-- ===== PT 정산 상세 (담당자별 그룹) ===== -->
  <div style="padding:20px 48px 8px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;color:#1e293b;">PT 정산 상세 — 담당자별</div>
      <div style="font-size:11px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:8px;">승/무/지원만 표시 (패 제외)</div>
    </div>
    ${ptDetailSectionsHtml || '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;background:#f8fafc;border-radius:8px;">해당 분기 정산 대상 PT 없음</div>'}
  </div>

  <!-- ===== 승리 판정 기준 ===== -->
  <div style="padding:16px 48px 8px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;color:#1e293b;">PT 결과 판정 기준</div>
      <div style="font-size:11px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:8px;">참고 정의</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;border-bottom:1px solid #e2e8f0;">
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;width:80px;">결과</th>
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">기준</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;font-size:12px;width:120px;">정산 단가</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#dcfce7;color:#16a34a;border-radius:8px;font-size:11px;font-weight:700;">승</span></td>
          <td style="padding:10px 14px;color:#475569;">POUR 공법 단독 입찰 (경쟁 공법 없음)</td>
          <td style="padding:10px 14px;text-align:right;color:#1e293b;font-weight:600;">500,000원</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#dbeafe;color:#2563eb;border-radius:8px;font-size:11px;font-weight:700;">무</span></td>
          <td style="padding:10px 14px;color:#475569;">POUR 공법 + 타공법 동시 입찰 (예: 4A시스템 등)</td>
          <td style="padding:10px 14px;text-align:right;color:#1e293b;font-weight:600;">250,000원</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:11px;font-weight:700;">패</span></td>
          <td style="padding:10px 14px;color:#475569;">POUR 공법으로 안올라온 공고 (입찰 미참여)</td>
          <td style="padding:10px 14px;text-align:right;color:#94a3b8;font-weight:600;">0원</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:2px 10px;background:#ede9fe;color:#7c3aed;border-radius:8px;font-size:11px;font-weight:700;">지원</span></td>
          <td style="padding:10px 14px;color:#475569;">한 현장 2명 이상 — 1명 승리(주영업), 나머지 지원</td>
          <td style="padding:10px 14px;text-align:right;color:#1e293b;font-weight:600;">250,000원</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:8px;font-size:11px;color:#94a3b8;line-height:1.6;">
      ※ 협약사 자체PT(selfPT) 및 본인영업 건은 정산 대상에서 제외 (0원 처리)<br />
      ※ 주말 출근 1일 = 환산 1.5일 (보상연차 환산)
    </div>
  </div>

  <!-- ===== 푸터 ===== -->
  <div style="padding:20px 48px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center;">
    POUR영업운영시스템 · 자동 생성 보고서 · 상세 데이터는 첨부 Excel 파일 참조
  </div>

</div>
  `;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// === 다운로드 헬퍼 ===
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// === HTML → PDF (jsPDF + html2canvas) ===
async function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const sc = document.createElement('script');
    sc.src = src;
    sc.onload = resolve;
    sc.onerror = reject;
    document.head.appendChild(sc);
  });
}

export async function generateAndDownloadPDF(report, filename) {
  if (!window.html2canvas) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }
  if (!window.jspdf) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '0';
  container.style.background = '#fff';
  container.innerHTML = buildReportHTML(report);
  document.body.appendChild(container);

  try {
    const canvas = await window.html2canvas(container.firstElementChild, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

// === Mailto 링크 (수동 첨부 안내 본문) ===
export function buildMailtoLink(report, recipient = 'yurim@netformrnd.com') {
  const { year, range, totals } = report;
  const subject = `[POUR영업운영시스템] ${year}년 ${range.label} 보고서 (PT 정산 + 주말출근)`;
  const body = [
    `안녕하세요 김유림님,`,
    ``,
    `${year}년 ${range.label} (${range.start} ~ ${range.end}) 보고서를 송부드립니다.`,
    ``,
    `■ 분기 핵심 지표`,
    `  · 주말 출근 환산일수: ${totals.weekendWeighted.toFixed(1)}일 (실제 ${totals.weekendDays}일 × 1.5, PT 일정만 집계)`,
    `  · 정산 PT 건수: ${totals.ptCount}건 (승 ${totals.ptWin} / 무 ${totals.ptDraw} / 지원 ${totals.ptSupport})`,
    `  · 정산금액 합계: ${totals.settlementAmount.toLocaleString()}원`,
    ``,
    `■ 첨부파일 (수동 첨부 부탁드립니다)`,
    `  1. POUR_분기보고서_${year}_${range.label}.xlsx`,
    `  2. POUR_분기보고서_${year}_${range.label}.pdf`,
    ``,
    `※ 주말 출근 1일 = 환산 1.5일 (보상연차 환산)`,
    `※ 주말 출근 집계는 PT 일정만 포함 (현설/세미나/영업/개인 제외)`,
    `※ PT 정산은 승/무/지원만 표시 (패 제외)`,
    `※ 정산 담당자: 황윤선, 이필선, 한준엽, 한인규, 조재연, 정정훈, 김성민`,
    ``,
    `감사합니다.`,
    `POUR영업운영시스템`,
  ].join('\r\n');
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
