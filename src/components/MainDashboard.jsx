import React, { useMemo, useState } from 'react';
import AppSidebar from './AppSidebar.jsx';
import { filterPipeline, filterPtByYear, flow, teamRows, eok } from '../utils/mainDashboard.js';
import { buildRow, FILTERS, settlementTargets, quarterPts, quarterMeta, defaultQuarterKey } from '../utils/workbench.js';
import { unassignedUpcoming } from '../utils/morningBrief.js';
import { getQuarterKey } from '../utils/settlement.js';

// 메인 (#6a) — 흐름 한 줄 + 처리할 것 + 팀별 현황. 수치 정의는 기존 메인과 같다 (utils/mainDashboard.js).

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', ink: '#1e293b',
  line: '#e2e8f0', line2: '#f1f5f9', line3: '#f8fafc', strong: '#cbd5e1', muted: '#f8fafc', arrowBg: '#fafbfc',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const COMPANIES = ['전체', '석민이앤씨', 'POUR솔루션', '아파트스퀘어'];
const TEAM_GRID = '200px repeat(4, minmax(0, 1fr)) minmax(0, 1fr) minmax(0, 1fr) repeat(5, minmax(0, 0.8fr))';
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12 };
const big = { fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', marginTop: 4, lineHeight: 1.1 };
const unit = { fontSize: 14, fontWeight: 600, color: C.text3, marginLeft: 3 };
const label = { fontSize: 12, fontWeight: 600, color: C.text3 };

function Arrow({ text }) {
  return (
    <div aria-hidden={!text} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: C.text4, borderLeft: `1px solid ${C.line2}`, borderRight: `1px solid ${C.line2}`, background: C.arrowBg }}>
      <span style={{ fontSize: 16 }}>→</span>
      {text && <span style={{ fontSize: 10.5, fontWeight: 600 }}>{text}</span>}
    </div>
  );
}

export default function MainDashboard({
  pipeline, ptSchedules, schedules, todayStr,
  year, years, onYearChange,
  totals,               // { all, confirmed, pending }
  teams,
  confirmStateOf,       // (quarterKey, name) => '최종확정' 등
  assigneeNames,
  sidebar,
  onGoReview, onGoUnassigned, onGoPending, onGoSettlement, onGoTeam,
  onSearch, onMeeting, onAdd,
  exceptionCount = 0, exceptionOldestDays = 0, onGoExceptions, // 예외 승인 대기(#11a)
}) {
  const [company, setCompany] = useState('전체');
  const [search, setSearch] = useState('');
  const today = new Date(todayStr + 'T00:00:00');

  const pipeYear = useMemo(() => filterPipeline(pipeline, { year }), [pipeline, year]);
  const ptYear = useMemo(() => filterPtByYear(ptSchedules, year), [ptSchedules, year]);
  const f = useMemo(() => flow(pipeYear, ptYear), [pipeYear, ptYear]);
  const team = useMemo(() => teamRows(filterPipeline(pipeline, { year, company }), ptYear, teams), [pipeline, year, company, ptYear, teams]);

  // 실적 작업대가 처음 여는 분기(이번 분기)와 같은 기준 — 카드 숫자와 넘어간 목록 건수가 같게
  const qKey = getQuarterKey(today);
  // 분기정산 카드는 마감 처리할 분기(지난 분기 마감 전이면 지난 분기)
  const stlKey = defaultQuarterKey(today);
  const reviewCount = useMemo(() => quarterPts(ptSchedules || [], qKey).map(pt => buildRow(pt, todayStr)).filter(FILTERS.review).length, [ptSchedules, qKey, todayStr]);
  const unassignedCount = useMemo(() => unassignedUpcoming(schedules, todayStr).length, [schedules, todayStr]);
  const reviewQ = quarterMeta(qKey, today)?.quarter;
  const qMeta = quarterMeta(stlKey, today);
  const qAmount = useMemo(() => settlementTargets(quarterPts(ptSchedules || [], stlKey)).amount, [ptSchedules, stlKey]);
  const finalCount = (assigneeNames || []).filter(n => confirmStateOf && confirmStateOf(stlKey, n) === '최종확정').length;

  const pt = f.pt;
  const barW = n => `${pt.total ? n / pt.total * 100 : 0}%`;
  const expDen = f.expected.contractedRevenue + f.expected.highProbRevenue;
  const expPct = n => `${expDen ? Math.round(n / expDen * 100) : 0}%`;
  const yLabel = year === 'all' ? '전체' : `${year}년`;

  const queueBtn = warn => ({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '14px 16px', minWidth: 0, background: warn ? '#fffbeb' : '#fff', border: `1px solid ${warn ? '#fde68a' : C.line}`, borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: C.text });
  const queueNum = n => <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1, color: C.ink }}>{n.toLocaleString('ko-KR')}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2, color: C.text3 }}>건</span></span>;
  const dot = bg => <span style={{ width: 7, height: 7, borderRadius: '50%', background: bg, flex: 'none' }} />;
  const right = { textAlign: 'right' };
  const wl = s => (
    <span style={right}><b style={{ color: '#15803d' }}>{s.winRate}</b><span style={{ color: C.strong }}> / </span><span style={{ color: '#b91c1c' }}>{s.lossRate}</span></span>
  );
  const teamCells = (r, total) => (
    <>
      <span style={right}>{r.sales.total}</span>
      <span style={right}>{eok(r.sales.revenue)}</span>
      <span style={right}>{r.sales.progressRate}%</span>
      {wl(r.sales)}
      <span style={right}>{r.sales.contractCount}</span>
      <span style={right}>{eok(r.sales.revenue)}</span>
      <span style={{ ...right, fontWeight: total ? 700 : 600 }}>{r.pt.total}</span>
      <span style={{ ...right, color: '#15803d', fontWeight: 600 }}>{r.pt.w}</span>
      <span style={{ ...right, color: '#b45309' }}>{r.pt.d}</span>
      <span style={{ ...right, color: '#b91c1c' }}>{r.pt.l}</span>
      <span style={{ ...right, fontWeight: 700, color: total ? C.brand : C.text }}>{r.pt.rate}%</span>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.muted, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
      <AppSidebar {...sidebar} />
      <main style={{ flex: 1, minWidth: 0, background: C.muted, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>메인</h1>
          <label htmlFor="md-year" style={srOnly}>연도</label>
          <select id="md-year" value={year} onChange={e => onYearChange(e.target.value)} style={{ height: 32, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', flex: 'none' }}>
            {(years || []).map(y => <option key={y} value={y}>{y === 'all' ? '전체' : `${y}년`}</option>)}
          </select>
          <span style={{ fontSize: 12, color: C.text4, whiteSpace: 'nowrap' }}>{today.getMonth() + 1}월 {today.getDate()}일 {KDAY[today.getDay()]}요일 · 파이프라인 데이터 기준 (Relate.so)</span>
          <div style={{ flex: 1 }} />
          <form role="search" onSubmit={e => { e.preventDefault(); if (search.trim() && onSearch) onSearch(search.trim()); }}>
            <label htmlFor="md-search" style={srOnly}>현장·담당자 검색 (일정에서 찾기)</label>
            <input id="md-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="현장·담당자 검색 → 일정" style={{ height: 34, width: 220, minWidth: 0, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </form>
          {onMeeting && <button type="button" onClick={onMeeting} style={{ height: 34, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 13, color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}>영업회의</button>}
          {onAdd && <button type="button" onClick={onAdd} style={{ height: 34, padding: '0 14px', border: 0, borderRadius: 8, background: C.brand, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ 일정 추가</button>}
        </div>

        <div style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 블록 1 — 흐름 */}
          <section aria-label={`${yLabel} 흐름`} style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', borderBottom: `1px solid ${C.line2}` }}>
              <h2 style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{yLabel} 흐름</h2>
              <span style={{ marginLeft: 8, fontSize: 12, color: C.text4 }}>영업 → PT → 계약 → 매출</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: C.text3 }}>수의계약 {f.contract.count}건 · {eok(f.contract.revenue)} 별도 집계</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(0, 1.3fr) 56px minmax(0, 1fr) 56px minmax(0, 1.2fr)', alignItems: 'stretch' }}>
              <div style={{ padding: '18px 20px' }}>
                <div style={label}>영업 (파이프라인)</div>
                <div style={big}>{f.sales.total}<span style={unit}>건</span></div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: C.text3, marginTop: 10, flexWrap: 'wrap' }}>
                  <span>매출 <b style={{ color: C.ink }}>{eok(f.sales.revenue)}</b></span>
                  <span>진행률 <b style={{ color: C.ink }}>{f.sales.progressRate}%</b></span>
                </div>
              </div>
              <Arrow text={`PT ${f.ptRate}%`} />
              <div style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <div style={label}>PT</div>
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand }}>승률 {pt.rate}%</span>
                </div>
                <div style={big}>{pt.total}<span style={unit}>건</span></div>
                <div role="img" aria-label={`승 ${pt.w}, 무 ${pt.d}, 패 ${pt.l}, 진행 ${pt.p}`} style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: C.line2, marginTop: 10 }}>
                  <div style={{ width: barW(pt.w), background: '#16a34a' }} />
                  <div style={{ width: barW(pt.d), background: '#d97706' }} />
                  <div style={{ width: barW(pt.l), background: '#b91c1c' }} />
                  <div style={{ width: barW(pt.p), background: C.strong }} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: C.text3, marginTop: 6, flexWrap: 'wrap' }}>
                  <span><b style={{ color: '#15803d' }}>{pt.w}</b> 승</span>
                  <span><b style={{ color: '#b45309' }}>{pt.d}</b> 무</span>
                  <span><b style={{ color: '#b91c1c' }}>{pt.l}</b> 패</span>
                  <span><b style={{ color: C.text4 }}>{pt.p}</b> 진행</span>
                </div>
              </div>
              <Arrow text={`계약 ${f.contractRate}%`} />
              <div style={{ padding: '18px 20px' }}>
                <div style={label}>계약 확정</div>
                <div style={{ ...big, color: '#15803d' }}>{f.contract.count}<span style={unit}>건</span></div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: C.text3, marginTop: 10, flexWrap: 'wrap' }}>
                  <span>매출 <b style={{ color: C.ink }}>{eok(f.contract.revenue)}</b></span>
                  <span>PT→계약 <b style={{ color: C.ink }}>{f.contractRate}%</b></span>
                </div>
              </div>
              <Arrow />
              <div style={{ padding: '18px 20px', background: C.brand, color: '#fff' }}>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: .8 }}>예상매출 합계</div>
                <div style={big}>{(f.expected.total / 100000000).toFixed(1)}<span style={{ fontSize: 14, fontWeight: 600, opacity: .8, marginLeft: 3 }}>억</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '3px 8px', fontSize: 12, marginTop: 10, alignItems: 'center' }}>
                  <span style={{ opacity: .8 }}>확정</span>
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.2)' }}><div style={{ width: expPct(f.expected.contractedRevenue), height: '100%', borderRadius: 3, background: '#fff' }} /></div>
                  <b>{eok(f.expected.contractedRevenue)} · {f.expected.contractedCount}건</b>
                  <span style={{ opacity: .8 }}>고확률</span>
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.2)' }}><div style={{ width: expPct(f.expected.highProbRevenue), height: '100%', borderRadius: 3, background: C.accent }} /></div>
                  <b>{eok(f.expected.highProbRevenue)} · {f.expected.highProbCount}건</b>
                </div>
                <div style={{ fontSize: 11, opacity: .7, marginTop: 6 }}>확정 + 고확률 × 50%</div>
              </div>
            </div>
          </section>

          {/* 블록 2 — 처리할 것 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <button type="button" onClick={onGoReview} style={queueBtn(reviewCount > 0)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#b45309', whiteSpace: 'nowrap' }}>{dot('#d97706')}검토필요 · K-APT 미매칭 · Q{reviewQ}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', width: '100%' }}>{queueNum(reviewCount)}<span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand }}>실적에서 처리 →</span></span>
            </button>
            <button type="button" onClick={onGoUnassigned} style={{ ...queueBtn(false), ...(unassignedCount > 0 ? { background: '#fef2f2', border: '1px solid #fecaca' } : {}) }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: unassignedCount > 0 ? '#b91c1c' : C.text3, whiteSpace: 'nowrap' }}>{dot(unassignedCount > 0 ? '#b91c1c' : C.strong)}담당 미배정 PT</span>
              <span style={{ display: 'flex', alignItems: 'baseline', width: '100%' }}>{queueNum(unassignedCount)}<span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand }}>일정에서 배정 →</span></span>
            </button>
            <button type="button" onClick={onGoPending} style={queueBtn(false)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.text3, whiteSpace: 'nowrap' }}>{dot(C.strong)}미확정 일정</span>
              <span style={{ display: 'flex', alignItems: 'baseline', width: '100%', gap: 6 }}>{queueNum(totals.pending)}<span style={{ marginLeft: 'auto', fontSize: 12, color: C.text4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>총 {totals.all.toLocaleString('ko-KR')} · 확정 {totals.confirmed.toLocaleString('ko-KR')}</span></span>
            </button>
            <button type="button" onClick={onGoSettlement} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '14px 16px', background: C.brand, border: 0, borderRadius: 12, color: '#fff', minWidth: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 12, fontWeight: 600, opacity: .75, whiteSpace: 'nowrap' }}>Q{qMeta?.quarter} 분기정산 · 마감 {qMeta?.ddayText}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', width: '100%' }}>
                <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{qAmount.toLocaleString('ko-KR')}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2, opacity: .8 }}>원</span></span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.accent, whiteSpace: 'nowrap' }}>확정 {finalCount}/{(assigneeNames || []).length} →</span>
              </span>
            </button>
          </div>
          {/* 예외 승인 대기(#11a 진입점) — 있을 때만 한 줄 */}
          {exceptionCount > 0 && onGoExceptions && (
            <button type="button" onClick={onGoExceptions} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: C.text }}>
              {dot('#d97706')}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>예외 승인 대기 {exceptionCount}건</span>
              <span style={{ fontSize: 12.5, color: C.text3 }}>영업적 승리 · 공고문 없는 현장 신청{exceptionOldestDays ? ` · 가장 오래된 건 ${exceptionOldestDays}일 대기` : ''}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand, whiteSpace: 'nowrap' }}>검토 →</span>
            </button>
          )}

          {/* 블록 3 — 팀별 현황 */}
          <section aria-label="팀별 현황" style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap' }}>
              <h2 style={{ margin: '0 8px 0 0', fontWeight: 700, fontSize: 14 }}>팀별 현황</h2>
              {COMPANIES.map(c => (
                <button key={c} type="button" aria-pressed={company === c} onClick={() => setCompany(c)} style={{ padding: '5px 10px', borderRadius: 999, border: `1px solid ${company === c ? C.brand : C.line}`, background: company === c ? C.brand : '#fff', color: company === c ? '#fff' : C.text2, fontSize: 12, fontWeight: company === c ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>{c}</button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: C.text4 }}>회사 필터는 영업·수의계약에만 적용 · 팀 클릭 → 실적</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 900 }}>
                <div style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, padding: '0 18px', fontSize: 11, fontWeight: 600, color: C.text4, borderBottom: `1px solid ${C.line2}` }}>
                  <span style={{ padding: '8px 0' }}>팀 · 구성원</span>
                  <span style={{ gridColumn: 'span 4', padding: '6px 0 0', textAlign: 'center', color: C.text2, borderBottom: `2px solid ${C.strong}`, margin: '0 6px' }}>영업</span>
                  <span style={{ gridColumn: 'span 2', padding: '6px 0 0', textAlign: 'center', color: C.text2, borderBottom: `2px solid ${C.strong}`, margin: '0 6px' }}>수의계약</span>
                  <span style={{ gridColumn: 'span 5', padding: '6px 0 0', textAlign: 'center', color: C.brand, borderBottom: `2px solid ${C.brand}`, margin: '0 6px' }}>PT</span>
                  <span />
                  {['건수', '매출', '진행률', '승/패', '건수', '매출', '건수', '승', '무', '패', '승률'].map((h, i) => <span key={i} style={{ textAlign: 'right', padding: '6px 0' }}>{h}</span>)}
                </div>
                {team.rows.map(r => (
                  <button key={r.name} type="button" onClick={() => onGoTeam && onGoTeam(r)} style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, alignItems: 'center', width: '100%', padding: '11px 18px', border: 0, borderBottom: `1px solid ${C.line3}`, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: C.text }}>
                    <span>
                      <span style={{ display: 'block', fontWeight: 700 }}>{r.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: C.text4 }}>{r.members.join(' · ')}</span>
                    </span>
                    {teamCells(r, false)}
                  </button>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, alignItems: 'center', padding: '11px 18px', fontSize: 13, fontWeight: 700, background: C.muted }}>
                  <span title="팀에 속한 담당자 기준 합계 — 위 흐름 카드(전체)와 다를 수 있습니다">팀 합계</span>
                  {teamCells(team.total, true)}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
