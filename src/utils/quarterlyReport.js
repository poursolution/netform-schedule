// 분기 종합 보고서 (주말출근 + PT + 일정) 데이터 집계 + Excel/PDF 생성
// 발송 흐름: admin 확인 → 김유림(yurim@netformrnd.com) 발송
// 발송 시점: 해당 분기 끝난 다음달 마지막 주 월요일 14:00 KST

import * as XLSX from 'xlsx';

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
export function aggregateQuarterlyReport(allData, year, quarter) {
  const range = getQuarterRange(year, quarter);
  const {
    ptSchedules = [],
    briefingSchedules = [],
    personalSchedules = [],
    seminarSchedules = [],
    salesSchedules = [],
  } = allData;

  // 주말 출근 집계
  const weekendItems = [];
  function addWeekend(schedules, type) {
    schedules.forEach(s => {
      if (!s.date || !inRange(s.date, range)) return;
      if (s.dateType && s.dateType !== 'confirmed') return;
      if (s.selfPT) return;
      if (!isWeekend(s.date)) return;
      const assignees = parseAssignees(s.ptAssignee || s.assignee || '');
      if (assignees.length === 0) return;
      assignees.forEach(a => {
        weekendItems.push({
          date: s.date,
          dayName: dayName(s.date),
          type,
          siteName: s.siteName || s.title || '',
          assignee: a,
          weighted: 1.5,
        });
      });
    });
  }
  addWeekend(ptSchedules, 'PT');
  addWeekend(briefingSchedules, '현설');
  addWeekend(salesSchedules, '영업');
  addWeekend(seminarSchedules, '세미나');

  const weekendByAssignee = {};
  weekendItems.forEach(w => {
    if (!weekendByAssignee[w.assignee]) weekendByAssignee[w.assignee] = { count: 0, weighted: 0 };
    weekendByAssignee[w.assignee].count += 1;
    weekendByAssignee[w.assignee].weighted += 1.5;
  });

  // PT 데이터 (검증 분리)
  const ptVerified = [];
  const ptUnverified = [];
  ptSchedules.forEach(s => {
    if (!s.date || !inRange(s.date, range)) return;
    if (s.dateType && s.dateType !== 'confirmed') return;
    const assignees = parseAssignees(s.ptAssignee);
    assignees.forEach(a => {
      const verified = isPtVerified(s, a);
      const row = {
        date: s.date,
        bidNo: s.bidNo || '',
        siteName: s.siteName || '',
        assignee: a,
        result: getPtResult(s, a) || '',
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

  // 전체 일정
  const scheduleDetail = [];
  function addSch(schedules, type) {
    schedules.forEach(s => {
      if (!s.date || !inRange(s.date, range)) return;
      if (s.dateType && s.dateType !== 'confirmed') return;
      const assignees = parseAssignees(s.ptAssignee || s.assignee || '');
      scheduleDetail.push({
        date: s.date,
        dayName: dayName(s.date),
        type,
        siteName: s.siteName || s.title || '',
        assignee: assignees.join(', '),
        note: s.note || '',
      });
    });
  }
  addSch(ptSchedules, 'PT');
  addSch(briefingSchedules, '현설');
  addSch(personalSchedules, '개인');
  addSch(seminarSchedules, '세미나');
  addSch(salesSchedules, '영업');
  scheduleDetail.sort((a, b) => a.date.localeCompare(b.date));

  // 담당자 요약
  const allAssignees = new Set();
  Object.keys(weekendByAssignee).forEach(a => allAssignees.add(a));
  ptVerified.forEach(r => allAssignees.add(r.assignee));

  const summary = Array.from(allAssignees).sort().map(assignee => {
    const w = weekendByAssignee[assignee] || { count: 0, weighted: 0 };
    const ptList = ptVerified.filter(r => r.assignee === assignee);
    return {
      assignee,
      weekendDays: w.count,
      weekendWeighted: w.weighted,
      ptCount: ptList.length,
      ptWin: ptList.filter(r => r.result === '승').length,
      ptDraw: ptList.filter(r => r.result === '무').length,
      ptLose: ptList.filter(r => r.result === '패').length,
      ptSupport: ptList.filter(r => r.result === '지원').length,
      settlementAmount: ptList.reduce((s, r) => s + r.amount, 0),
      scheduleTotal: scheduleDetail.filter(r => (r.assignee || '').split(/,\s*/).includes(assignee)).length,
    };
  });

  // 월별 매트릭스
  const months = quarter === 1 ? ['01','02','03']
    : quarter === 2 ? ['04','05','06']
    : quarter === 3 ? ['07','08','09']
    : ['10','11','12'];

  const monthly = {};
  function ensure(a, m) {
    if (!monthly[a]) monthly[a] = {};
    if (!monthly[a][m]) monthly[a][m] = { pt: 0, weekend: 0, schedule: 0 };
  }
  ptVerified.forEach(r => { const m = r.date.slice(5,7); ensure(r.assignee, m); monthly[r.assignee][m].pt += 1; });
  weekendItems.forEach(w => { const m = w.date.slice(5,7); ensure(w.assignee, m); monthly[w.assignee][m].weekend += 1; });
  scheduleDetail.forEach(r => {
    const m = r.date.slice(5,7);
    (r.assignee || '').split(/,\s*/).forEach(a => { if (a) { ensure(a, m); monthly[a][m].schedule += 1; } });
  });

  const totals = {
    weekendDays: summary.reduce((s, r) => s + r.weekendDays, 0),
    weekendWeighted: summary.reduce((s, r) => s + r.weekendWeighted, 0),
    ptCount: summary.reduce((s, r) => s + r.ptCount, 0),
    ptWin: summary.reduce((s, r) => s + r.ptWin, 0),
    ptDraw: summary.reduce((s, r) => s + r.ptDraw, 0),
    ptLose: summary.reduce((s, r) => s + r.ptLose, 0),
    ptSupport: summary.reduce((s, r) => s + r.ptSupport, 0),
    settlementAmount: summary.reduce((s, r) => s + r.settlementAmount, 0),
    scheduleTotal: scheduleDetail.length,
  };

  return {
    range, summary, weekendItems, ptVerified, ptUnverified,
    scheduleDetail, monthly, months, totals, year, quarter,
  };
}

// === Excel 생성 (정돈된 양식) ===
export function generateExcelBlob(report) {
  const { range, summary, weekendItems, ptVerified, scheduleDetail, monthly, months, totals, year, quarter } = report;
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `${year}년 ${range.label} 종합 보고서`,
    Subject: '주말출근 + PT 정산 + 일정',
    Author: 'POUR영업운영시스템',
    CreatedDate: new Date(),
  };

  // ----- Sheet1: 표지 + 요약 -----
  const summaryRows = summary.map(r => [
    r.assignee, r.weekendDays, r.weekendWeighted,
    r.ptCount, r.ptWin, r.ptDraw, r.ptLose, r.ptSupport,
    r.settlementAmount, r.scheduleTotal,
  ]);
  // 합계 행
  const totalRow = [
    '합계',
    totals.weekendDays, totals.weekendWeighted,
    totals.ptCount, totals.ptWin, totals.ptDraw, totals.ptLose, totals.ptSupport,
    totals.settlementAmount, totals.scheduleTotal,
  ];

  const sheet1Data = [
    [`${year}년 ${range.label} 종합 보고서`],
    [`기간: ${range.start} ~ ${range.end}`],
    [`발송일: ${new Date().toISOString().slice(0,10)} · 수신: 김유림(yurim@netformrnd.com)`],
    [],
    ['【 분기 핵심 지표 】'],
    ['항목', '값'],
    ['주말 출근 일수', totals.weekendDays + '일'],
    ['주말 환산 일수 (×1.5)', totals.weekendWeighted.toFixed(1) + '일'],
    ['PT 정산 건수 (검증완료)', totals.ptCount + '건'],
    ['PT 결과 분포', `승 ${totals.ptWin} / 무 ${totals.ptDraw} / 패 ${totals.ptLose} / 지원 ${totals.ptSupport}`],
    ['정산금액 합계', totals.settlementAmount.toLocaleString() + '원'],
    ['전체 일정 건수', totals.scheduleTotal + '건'],
    [],
    ['【 담당자별 요약 】'],
    ['담당자', '주말출근(일)', '환산(×1.5)', 'PT건수', '승', '무', '패', '지원', '정산금액(원)', '전체일정'],
    ...summaryRows,
    totalRow,
    [],
    ['【 PT 결과 판정 기준 】'],
    ['결과', '기준', '정산 단가'],
    ['승', 'POUR 공법 단독 입찰', '500,000원'],
    ['무', 'POUR 공법 + 타공법 동시 입찰 (예: 4A시스템 등)', '250,000원'],
    ['패', 'POUR 공법으로 안올라온 공고 (입찰 미참여)', '0원'],
    ['지원', '한 현장 2명 이상 — 1명 승리(주영업), 나머지 지원', '250,000원'],
    [],
    ['※ 협약사 자체PT(selfPT) 및 본인영업 건은 정산 대상에서 제외 (0원 처리)'],
    ['※ 주말 출근 1일 = 환산 1.5일 (보상연차 환산)'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
    { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 8 },
    { wch: 16 }, { wch: 12 },
  ];
  // 셀 머지: 타이틀 행
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 9 } },
    { s: { r: 13, c: 0 }, e: { r: 13, c: 9 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, '표지·요약');

  // ----- Sheet2: 주말 출근 상세 -----
  const weekendSorted = [...weekendItems].sort((a, b) => a.date.localeCompare(b.date));
  const sheet2Data = [
    ['주말 출근 상세 (연차 지급 기준)'],
    ['※ 주말 1일 = 환산 1.5일 (보상연차)'],
    [],
    ['날짜', '요일', '구분', '현장/일정명', '담당자', '환산일수'],
    ...weekendSorted.map(r => [r.date, r.dayName, r.type, r.siteName, r.assignee, r.weighted]),
    [],
    ['합계', '', '', '', `총 ${weekendSorted.length}건`, totals.weekendWeighted.toFixed(1) + '일'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [{wch:12},{wch:6},{wch:8},{wch:30},{wch:14},{wch:10}];
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, '주말출근');

  // ----- Sheet3: PT 정산 상세 (검증완료) -----
  const ptSorted = [...ptVerified].sort((a, b) => a.date.localeCompare(b.date));
  const sheet3Data = [
    ['PT 정산 상세 (검증 완료 — 정산금액 합산 대상)'],
    ['※ 자체PT(selfPT)는 정산 제외 / 본인영업은 정산금액 0원 처리'],
    [],
    ['날짜', '공고번호', '단지명', '담당자', '결과', '정산상태', '정산금액(원)', '자체PT', '비고'],
    ...ptSorted.map(r => [r.date, r.bidNo, r.siteName, r.assignee, r.result, r.settlementStatus, r.amount, r.selfPT ? 'O' : '', r.note]),
    [],
    ['합계', '', '', '', '', `총 ${ptSorted.length}건`, totals.settlementAmount, '', ''],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  ws3['!cols'] = [{wch:12},{wch:14},{wch:28},{wch:12},{wch:6},{wch:10},{wch:14},{wch:8},{wch:25}];
  ws3['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'PT정산상세');

  // ----- Sheet4: 전체 일정 상세 -----
  const sheet4Data = [
    ['전체 일정 상세'],
    [],
    ['날짜', '요일', '구분', '현장/일정명', '담당자', '비고'],
    ...scheduleDetail.map(r => [r.date, r.dayName, r.type, r.siteName, r.assignee, r.note]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
  ws4['!cols'] = [{wch:12},{wch:6},{wch:8},{wch:30},{wch:18},{wch:25}];
  ws4['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  XLSX.utils.book_append_sheet(wb, ws4, '일정상세');

  // ----- Sheet5: 월별 집계 매트릭스 -----
  const monthLabels = months.map(m => parseInt(m) + '월');
  const monthHeader = ['담당자', ...monthLabels.flatMap(m => [`${m} PT`, `${m} 주말`, `${m} 일정`])];
  const monthRows = Object.keys(monthly).sort().map(a => {
    const row = [a];
    months.forEach(m => {
      const v = monthly[a][m] || { pt: 0, weekend: 0, schedule: 0 };
      row.push(v.pt, v.weekend, v.schedule);
    });
    return row;
  });
  const sheet5Data = [
    [`월별 집계 매트릭스 (${range.label} · 담당자 × 월)`],
    [],
    monthHeader,
    ...monthRows,
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(sheet5Data);
  const colW = [{wch:12}];
  months.forEach(() => { colW.push({wch:8},{wch:8},{wch:8}); });
  ws5['!cols'] = colW;
  ws5['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: monthHeader.length - 1 } }];
  XLSX.utils.book_append_sheet(wb, ws5, '월별집계');

  const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// === HTML 보고서 (PDF 변환용) — 깔끔한 디자인 ===
export function buildReportHTML(report) {
  const { range, summary, weekendItems, ptVerified, totals, year, quarter } = report;
  const today = new Date().toISOString().slice(0, 10);

  const summaryRowsHtml = summary.length === 0
    ? '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;">데이터 없음</td></tr>'
    : summary.map(r => `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:12px 14px;font-weight:600;color:#1e293b;">${escapeHtml(r.assignee)}</td>
        <td style="padding:12px 14px;text-align:center;color:#475569;">${r.weekendDays}일</td>
        <td style="padding:12px 14px;text-align:center;color:#7c3aed;font-weight:700;">${r.weekendWeighted.toFixed(1)}일</td>
        <td style="padding:12px 14px;text-align:center;color:#475569;">${r.ptCount}건</td>
        <td style="padding:12px 14px;text-align:right;color:#16a34a;font-weight:700;">${r.settlementAmount.toLocaleString()}원</td>
        <td style="padding:12px 14px;text-align:center;color:#64748b;font-size:13px;">${r.scheduleTotal}건</td>
      </tr>
    `).join('');

  const weekendSorted = [...weekendItems].sort((a, b) => a.date.localeCompare(b.date));
  const weekendRowsHtml = weekendSorted.length === 0
    ? '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;">주말 출근 일정 없음</td></tr>'
    : weekendSorted.map(r => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 14px;font-family:'Consolas',monospace;color:#475569;">${r.date} <span style="color:#7c3aed;font-weight:600;">(${r.dayName})</span></td>
        <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:3px 10px;background:#fef3c7;color:#92400e;border-radius:10px;font-size:11px;font-weight:600;">${r.type}</span></td>
        <td style="padding:10px 14px;color:#1e293b;">${escapeHtml(r.siteName)}</td>
        <td style="padding:10px 14px;color:#475569;font-weight:500;">${escapeHtml(r.assignee)}</td>
        <td style="padding:10px 14px;text-align:center;color:#7c3aed;font-weight:700;font-size:14px;">${r.weighted.toFixed(1)}일</td>
      </tr>
    `).join('');

  const ptSorted = [...ptVerified].sort((a, b) => a.date.localeCompare(b.date));
  const ptRowsHtml = ptSorted.length === 0
    ? '<tr><td colspan="7" style="padding:20px;text-align:center;color:#94a3b8;">정산 PT 없음</td></tr>'
    : ptSorted.slice(0, 30).map(r => {
        const resultColor = r.result === '승' ? '#16a34a' : r.result === '무' ? '#2563eb' : r.result === '패' ? '#dc2626' : '#7c3aed';
        const resultBg = r.result === '승' ? '#dcfce7' : r.result === '무' ? '#dbeafe' : r.result === '패' ? '#fee2e2' : '#ede9fe';
        return `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 14px;font-family:'Consolas',monospace;color:#475569;font-size:12px;">${r.date}</td>
            <td style="padding:10px 14px;font-family:'Consolas',monospace;color:#64748b;font-size:11px;">${escapeHtml(r.bidNo)}</td>
            <td style="padding:10px 14px;color:#1e293b;font-weight:500;">${escapeHtml(r.siteName)}</td>
            <td style="padding:10px 14px;color:#475569;">${escapeHtml(r.assignee)}</td>
            <td style="padding:10px 14px;text-align:center;"><span style="display:inline-block;padding:3px 10px;background:${resultBg};color:${resultColor};border-radius:10px;font-size:11px;font-weight:700;">${r.result}</span></td>
            <td style="padding:10px 14px;text-align:right;color:${r.amount>0?'#16a34a':'#94a3b8'};font-weight:700;">${r.amount.toLocaleString()}원</td>
            <td style="padding:10px 14px;text-align:center;font-size:11px;color:#64748b;">${r.settlementStatus}</td>
          </tr>
        `;
      }).join('') + (ptSorted.length > 30 ? `<tr><td colspan="7" style="padding:12px;text-align:center;background:#f8fafc;color:#64748b;font-size:12px;">… 그 외 ${ptSorted.length - 30}건은 첨부 Excel 참조</td></tr>` : '');

  return `
<div style="width:1100px;background:#ffffff;font-family:-apple-system,'Pretendard','Malgun Gothic',sans-serif;color:#1e293b;line-height:1.5;">

  <!-- ===== 표지 (라이트 톤, 기존 앱 스타일) ===== -->
  <div style="background:#ffffff;padding:40px 48px 28px;border-bottom:1px solid #e2e8f0;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:6px;">POUR영업운영시스템</div>
        <div style="font-size:28px;font-weight:700;color:#1e293b;letter-spacing:-0.5px;">${year}년 ${range.label} 종합 보고서</div>
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

  <!-- ===== KPI 카드 (기존 앱 스타일) ===== -->
  <div style="padding:24px 48px;background:#f8fafc;">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">주말 출근 환산일수</div>
        <div style="font-size:28px;font-weight:700;color:#2563eb;margin-top:8px;">${totals.weekendWeighted.toFixed(1)}<span style="font-size:14px;color:#94a3b8;font-weight:500;margin-left:4px;">일</span></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">실제 ${totals.weekendDays}일 × 1.5배</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">정산 PT 건수</div>
        <div style="font-size:28px;font-weight:700;color:#2563eb;margin-top:8px;">${totals.ptCount}<span style="font-size:14px;color:#94a3b8;font-weight:500;margin-left:4px;">건</span></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">승 ${totals.ptWin} · 무 ${totals.ptDraw} · 패 ${totals.ptLose} · 지원 ${totals.ptSupport}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <div style="font-size:13px;color:#64748b;font-weight:600;">정산금액 합계</div>
        <div style="font-size:24px;font-weight:700;color:#2563eb;margin-top:8px;">${totals.settlementAmount.toLocaleString()}<span style="font-size:14px;color:#94a3b8;font-weight:500;margin-left:4px;">원</span></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">전체 일정 ${totals.scheduleTotal}건</div>
      </div>
    </div>
  </div>

  <!-- ===== 담당자 요약 ===== -->
  <div style="padding:24px 48px 8px;">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px;">담당자별 분기 요약</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;border-bottom:1px solid #e2e8f0;">
          <th style="padding:12px 14px;text-align:left;font-weight:600;font-size:12px;">담당자</th>
          <th style="padding:12px 14px;text-align:center;font-weight:600;font-size:12px;">주말출근</th>
          <th style="padding:12px 14px;text-align:center;font-weight:600;font-size:12px;">환산(×1.5)</th>
          <th style="padding:12px 14px;text-align:center;font-weight:600;font-size:12px;">PT 건수</th>
          <th style="padding:12px 14px;text-align:right;font-weight:600;font-size:12px;">정산금액</th>
          <th style="padding:12px 14px;text-align:center;font-weight:600;font-size:12px;">전체일정</th>
        </tr>
      </thead>
      <tbody>${summaryRowsHtml}</tbody>
      ${summary.length > 0 ? `
      <tfoot>
        <tr style="background:#f8fafc;border-top:1px solid #cbd5e1;">
          <td style="padding:12px 14px;font-weight:700;color:#1e293b;">합계</td>
          <td style="padding:12px 14px;text-align:center;font-weight:700;color:#475569;">${totals.weekendDays}일</td>
          <td style="padding:12px 14px;text-align:center;font-weight:700;color:#2563eb;">${totals.weekendWeighted.toFixed(1)}일</td>
          <td style="padding:12px 14px;text-align:center;font-weight:700;color:#475569;">${totals.ptCount}건</td>
          <td style="padding:12px 14px;text-align:right;font-weight:700;color:#2563eb;">${totals.settlementAmount.toLocaleString()}원</td>
          <td style="padding:12px 14px;text-align:center;font-weight:700;color:#475569;">${totals.scheduleTotal}건</td>
        </tr>
      </tfoot>` : ''}
    </table>
  </div>

  <!-- ===== 주말 출근 상세 ===== -->
  <div style="padding:16px 48px 8px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;color:#1e293b;">주말 출근 상세</div>
      <div style="font-size:11px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:8px;">연차 지급 기준 · 1일 = 1.5일</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;border-bottom:1px solid #e2e8f0;">
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">날짜</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">구분</th>
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">현장/일정명</th>
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">담당자</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">환산</th>
        </tr>
      </thead>
      <tbody>${weekendRowsHtml}</tbody>
    </table>
  </div>

  <!-- ===== PT 정산 상세 ===== -->
  <div style="padding:16px 48px 8px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;color:#1e293b;">PT 정산 상세 (검증 완료)</div>
      <div style="font-size:11px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:8px;">상위 30건 · 전체는 Excel 참조</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;border-bottom:1px solid #e2e8f0;">
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">날짜</th>
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">공고번호</th>
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">단지명</th>
          <th style="padding:10px 14px;text-align:left;font-weight:600;font-size:12px;">담당자</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">결과</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;font-size:12px;">정산금액</th>
          <th style="padding:10px 14px;text-align:center;font-weight:600;font-size:12px;">상태</th>
        </tr>
      </thead>
      <tbody>${ptRowsHtml}</tbody>
    </table>
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
  const subject = `[POUR영업운영시스템] ${year}년 ${range.label} 종합 보고서`;
  const body = [
    `안녕하세요 김유림님,`,
    ``,
    `${year}년 ${range.label} (${range.start} ~ ${range.end}) 종합 보고서를 송부드립니다.`,
    ``,
    `■ 분기 핵심 지표`,
    `  · 주말 출근 환산일수: ${totals.weekendWeighted.toFixed(1)}일 (실제 ${totals.weekendDays}일 × 1.5)`,
    `  · 정산 PT 건수: ${totals.ptCount}건 (승 ${totals.ptWin} / 무 ${totals.ptDraw} / 패 ${totals.ptLose} / 지원 ${totals.ptSupport})`,
    `  · 정산금액 합계: ${totals.settlementAmount.toLocaleString()}원`,
    `  · 전체 일정 건수: ${totals.scheduleTotal}건`,
    ``,
    `■ 첨부파일 (수동 첨부 부탁드립니다)`,
    `  1. POUR_분기보고서_${year}_${range.label}.xlsx`,
    `  2. POUR_분기보고서_${year}_${range.label}.pdf`,
    ``,
    `※ 주말 출근 1일 = 환산 1.5일 (연차 지급 기준)`,
    `※ 본 보고서는 검증 완료된 데이터만 포함되어 있습니다`,
    ``,
    `감사합니다.`,
    `POUR영업운영시스템`,
  ].join('\r\n');
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
