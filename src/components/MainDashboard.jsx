import React, { useEffect, useMemo, useState } from 'react';
import AppSidebar from './AppSidebar.jsx';
import { filterPipeline, filterPtByYear, flow, teamRows, eok } from '../utils/mainDashboard.js';
import { buildRow, FILTERS, settlementTargets, quarterPts, quarterMeta, defaultQuarterKey } from '../utils/workbench.js';
import { unassignedUpcoming } from '../utils/morningBrief.js';
import { isUnassignedPT, titleOf, shortTime } from '../utils/scheduleView.js';
import { getQuarterKey } from '../utils/settlement.js';

// 메인 (#6a → #15a 1920) — 좌: 흐름 · 처리할 것 4 · 팀별 현황 / 우 400px: 오늘·내일 PT · 분기정산 · 최근 활동.
// 수치 정의는 기존 메인과 같다 (utils/mainDashboard.js). 표 행은 내용 높이 — 컨테이너를 늘려 행을 키우지 않는다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', ink: '#1e293b',
  line: '#e2e8f0', line2: '#f1f5f9', line3: '#f8fafc', strong: '#cbd5e1', muted: '#f8fafc', arrowBg: '#f8fafc',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const COMPANIES = ['전체', '석민이앤씨', 'POUR솔루션', '아파트스퀘어'];
const TEAM_GRID = '220px repeat(5, minmax(0, 1fr)) repeat(2, minmax(0, 1fr)) repeat(5, minmax(0, 1fr))';
const WIDE = 1440;
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12 };
const big = { fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', marginTop: 2, lineHeight: 1.15 };
const unit = { fontSize: 13, fontWeight: 600, color: C.text3, marginLeft: 3 };
const label = { fontSize: 12, fontWeight: 600, color: C.text3 };
const cardHead = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${C.line2}` };
const linkBtn = { marginLeft: 'auto', padding: 0, border: 0, background: 'none', fontSize: 12, fontWeight: 600, color: C.brand, cursor: 'pointer', fontFamily: 'inherit' };

function Arrow({ text }) {
  return (
    <div aria-hidden={!text} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: C.text3, borderLeft: `1px solid ${C.line2}`, borderRight: `1px solid ${C.line2}`, background: C.arrowBg, textAlign: 'center' }}>
      <span style={{ fontSize: 14 }}>→</span>
      {text && <span style={{ fontSize: 11 }}>{text}</span>}
    </div>
  );
}

function useWide() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? WIDE : window.innerWidth));
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return w >= WIDE;
}

const addDays = (ds, n) => { const d = new Date(`${ds}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// "오늘 08:52 / 어제 17:10 / 10/26 15:00"
function whenText(iso, todayStr) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (ds === todayStr) return `오늘 ${hm}`;
  if (ds === addDays(todayStr, -1)) return `어제 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
function activityText(log) {
  const site = log.siteName ? `${log.siteName}${log.assignee ? ` / ${log.assignee}` : ''}` : (log.quarterKey || '');
  switch (log.event) {
    case 'result_input': return `${site} 결과 ${log.result || ''} 입력`;
    case 'settlement_requested': return `${site} 정산요청`;
    case 'settlement_completed': return `${site} 정산완료`;
    case 'final_confirmed': return `${log.quarterKey || ''} 최종 확정`;
    case 'manual_verified': return `${site} 수동 검증 승인`;
    case 'candidate_selected': return `${site} K-APT 후보 선택`;
    case 'quarter_closed': return `${log.quarterKey || ''} 분기 마감`;
    case 'report_sent': return `${log.quarterKey || ''} 리포트 발송`;
    case 'feedback_submitted': return '피드백 보냄';
    case 'verification_self_check': return `${log.assignee && log.assignee !== log.by ? `${log.assignee} ` : ''}검증 자가 확인${log.selfCheckedValue ? ` (${log.selfCheckedValue})` : ''}`;
    default: return log.event || '';
  }
}

export default function MainDashboard({
  pipeline, ptSchedules, schedules, todayStr,
  year, years, onYearChange,
  totals,               // { all, confirmed, pending }
  teams,
  confirmStateOf,       // (quarterKey, name) => '최종확정' 등
  assigneeNames,
  sidebar,
  onGoReview, onGoUnassigned, onGoPending, onGoSettlement, onGoTeam, onGoMember,
  onSearch, onAdd,
  onOpenPt,             // (pt) => void — 오늘·내일 PT 행 / [배정]
  onGoSchedule,         // 일정 화면
  activity = [],        // 최근 활동(최신순)
  onGoActivity,
  exceptionCount = 0, exceptionOldestDays = 0, onGoExceptions, // 예외 승인 대기(#11a)
}) {
  const [company, setCompany] = useState('전체');
  const [search, setSearch] = useState('');
  const [teamOpen, setTeamOpen] = useState({});
  const wide = useWide();
  const today = new Date(todayStr + 'T00:00:00');

  const pipeYear = useMemo(() => filterPipeline(pipeline, { year }), [pipeline, year]);
  const ptYear = useMemo(() => filterPtByYear(ptSchedules, year), [ptSchedules, year]);
  const f = useMemo(() => flow(pipeYear, ptYear), [pipeYear, ptYear]);
  const pipeCo = useMemo(() => filterPipeline(pipeline, { year, company }), [pipeline, year, company]);
  const team = useMemo(() => teamRows(pipeCo, ptYear, teams), [pipeCo, ptYear, teams]);
  // 펼친 팀의 담당자 행 — 같은 집계를 1인 팀으로
  const memberRows = useMemo(() => Object.fromEntries(teams.filter(t => teamOpen[t.name])
    .map(t => [t.name, teamRows(pipeCo, ptYear, t.members.map(m => ({ name: m, members: [m] }))).rows])), [teams, teamOpen, pipeCo, ptYear]);

  // 실적 작업대가 처음 여는 분기(이번 분기)와 같은 기준 — 카드 숫자와 넘어간 목록 건수가 같게
  const qKey = getQuarterKey(today);
  // 분기정산 카드는 마감 처리할 분기(지난 분기 마감 전이면 지난 분기)
  const stlKey = defaultQuarterKey(today);
  const reviewCount = useMemo(() => quarterPts(ptSchedules || [], qKey).map(pt => buildRow(pt, todayStr)).filter(FILTERS.review).length, [ptSchedules, qKey, todayStr]);
  const unassignedCount = useMemo(() => unassignedUpcoming(schedules, todayStr).length, [schedules, todayStr]);
  const reviewQ = quarterMeta(qKey, today)?.quarter;
  const qMeta = quarterMeta(stlKey, today);
  const stl = useMemo(() => settlementTargets(quarterPts(ptSchedules || [], stlKey)), [ptSchedules, stlKey]);
  const finalCount = (assigneeNames || []).filter(n => confirmStateOf && confirmStateOf(stlKey, n) === '최종확정').length;

  // 오늘·내일 PT — 시간순, 미배정은 주황 행 + [배정]
  const tomorrow = addDays(todayStr, 1);
  const upcoming = useMemo(() => (ptSchedules || [])
    .filter(s => s && (s.date === todayStr || s.date === tomorrow) && (!s.dateType || s.dateType === 'confirmed'))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || ''))), [ptSchedules, todayStr, tomorrow]);
  const upUn = upcoming.filter(s => isUnassignedPT(s, todayStr)).length;

  const pt = f.pt;
  const barW = n => `${pt.total ? n / pt.total * 100 : 0}%`;
  const expDen = f.expected.contractedRevenue + f.expected.highProbRevenue;
  const expPct = n => `${expDen ? Math.round(n / expDen * 100) : 0}%`;
  const yLabel = year === 'all' ? '전체' : `${year}년`;

  const queueBtn = (bg, border) => ({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '14px 16px', minWidth: 0, background: bg, border: `1px solid ${border}`, borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: C.text });
  const queueNum = (n, color = C.ink) => <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1, color }}>{n.toLocaleString('ko-KR')}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 3, color: C.text3 }}>건</span></span>;
  const dot = bg => <span style={{ width: 7, height: 7, borderRadius: '50%', background: bg, flex: 'none' }} />;
  const qTitle = color => ({ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color, whiteSpace: 'nowrap' });
  const go = { marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand, whiteSpace: 'nowrap' };
  const right = { textAlign: 'right' };
  const cells = (r, strong) => (
    <>
      <span style={right}>{r.sales.total}</span>
      <span style={right}>{eok(r.sales.revenue)}</span>
      <span style={right}>{r.sales.progressRate}%</span>
      <span style={{ ...right, color: '#15803d', fontWeight: strong ? 700 : 600 }}>{r.sales.winRate}</span>
      <span style={{ ...right, color: '#b91c1c' }}>{r.sales.lossRate}</span>
      <span style={right}>{r.sales.contractCount}</span>
      <span style={right}>{eok(r.sales.revenue)}</span>
      <span style={{ ...right, fontWeight: 700 }}>{r.pt.total}</span>
      <span style={{ ...right, color: '#15803d', fontWeight: strong ? 700 : 600 }}>{r.pt.w}</span>
      <span style={{ ...right, color: '#b45309' }}>{r.pt.d}</span>
      <span style={{ ...right, color: '#b91c1c' }}>{r.pt.l}</span>
      <span style={{ ...right, fontWeight: 800, color: C.text }}>{r.pt.rate}%</span>
    </>
  );

  const leftCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {/* 흐름 */}
      <section aria-label={`${yLabel} 흐름`} style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${C.line2}` }}>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>{yLabel} 흐름</h2>
          <span style={{ fontSize: 12, color: C.text4 }}>영업 → PT → 계약 → 매출</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.text4 }}>파이프라인 데이터 (Relate.so) · 수의계약 {f.contract.count}건 · {eok(f.contract.revenue)} 별도 집계</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(0, 1.3fr) 56px minmax(0, 1fr) 56px minmax(0, 1.1fr)', alignItems: 'stretch' }}>
          <div style={{ padding: '16px 20px' }}>
            <div style={label}>영업 (파이프라인)</div>
            <div style={big}>{f.sales.total}<span style={unit}>건</span></div>
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 6 }}>매출 <b style={{ color: C.ink }}>{eok(f.sales.revenue)}</b> · 진행률 <b style={{ color: C.ink }}>{f.sales.progressRate}%</b></div>
          </div>
          <Arrow text={`PT ${f.ptRate}%`} />
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={label}>PT</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand }}>승률 {pt.rate}%</span>
            </div>
            <div style={big}>{pt.total}<span style={unit}>건</span></div>
            <div role="img" aria-label={`승 ${pt.w}, 무 ${pt.d}, 패 ${pt.l}, 진행 ${pt.p}`} style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: C.line2, marginTop: 8 }}>
              <div style={{ width: barW(pt.w), background: '#16a34a' }} />
              <div style={{ width: barW(pt.d), background: '#d97706' }} />
              <div style={{ width: barW(pt.l), background: '#b91c1c' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: C.text3, marginTop: 6, flexWrap: 'wrap' }}>
              <span><b style={{ color: '#15803d' }}>{pt.w}</b> 승</span>
              <span><b style={{ color: '#b45309' }}>{pt.d}</b> 무</span>
              <span><b style={{ color: '#b91c1c' }}>{pt.l}</b> 패</span>
              <span><b>{pt.p}</b> 진행</span>
            </div>
          </div>
          <Arrow text={`계약 ${f.contractRate}%`} />
          <div style={{ padding: '16px 20px' }}>
            <div style={label}>계약 확정</div>
            <div style={big}>{f.contract.count}<span style={unit}>건</span></div>
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 6 }}>매출 <b style={{ color: C.ink }}>{eok(f.contract.revenue)}</b> · PT→계약 <b style={{ color: C.ink }}>{f.contractRate}%</b></div>
          </div>
          <Arrow />
          <div style={{ padding: '16px 20px', background: C.brand, color: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: .8 }}>예상매출 합계</div>
            <div style={big}>{(f.expected.total / 100000000).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600, opacity: .85, marginLeft: 3 }}>억</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '4px 8px', fontSize: 11.5, marginTop: 6, alignItems: 'center' }}>
              <span style={{ opacity: .8 }}>확정</span>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.2)' }}><div style={{ width: expPct(f.expected.contractedRevenue), height: '100%', borderRadius: 2, background: '#fff' }} /></div>
              <b>{eok(f.expected.contractedRevenue)} · {f.expected.contractedCount}건</b>
              <span style={{ opacity: .8 }}>고확률</span>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.2)' }}><div style={{ width: expPct(f.expected.highProbRevenue), height: '100%', borderRadius: 2, background: C.accent }} /></div>
              <b>{eok(f.expected.highProbRevenue)} · {f.expected.highProbCount}건</b>
            </div>
            <div style={{ fontSize: 11, opacity: .7, marginTop: 4 }}>확정 + 고확률 × 50%</div>
          </div>
        </div>
      </section>

      {/* 처리할 것 4 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <button type="button" onClick={onGoReview} style={queueBtn(reviewCount > 0 ? '#fffbeb' : '#fff', reviewCount > 0 ? '#fde68a' : C.line)}>
          <span style={qTitle('#b45309')}>{dot('#d97706')}검토필요 · K-APT 미매칭 · Q{reviewQ}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', width: '100%' }}>{queueNum(reviewCount)}<span style={go}>실적에서 처리 →</span></span>
        </button>
        <button type="button" onClick={onGoUnassigned} style={queueBtn(unassignedCount > 0 ? '#fef2f2' : '#fff', unassignedCount > 0 ? '#fecaca' : C.line)}>
          <span style={qTitle(unassignedCount > 0 ? '#b91c1c' : C.text3)}>{dot(unassignedCount > 0 ? '#b91c1c' : C.strong)}담당 미배정 PT</span>
          <span style={{ display: 'flex', alignItems: 'baseline', width: '100%' }}>{queueNum(unassignedCount, unassignedCount > 0 ? '#b91c1c' : C.ink)}<span style={go}>일정에서 배정 →</span></span>
        </button>
        <button type="button" onClick={onGoPending} style={queueBtn('#fff', C.line)}>
          <span style={qTitle(C.text3)}>{dot(C.strong)}미확정 일정</span>
          <span style={{ display: 'flex', alignItems: 'baseline', width: '100%', gap: 6 }}>{queueNum(totals.pending)}<span style={{ marginLeft: 'auto', fontSize: 12, color: C.text4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>총 {totals.all.toLocaleString('ko-KR')} · 확정 {totals.confirmed.toLocaleString('ko-KR')}</span></span>
        </button>
        <button type="button" onClick={onGoExceptions} disabled={!onGoExceptions} style={{ ...queueBtn('#fff', exceptionCount > 0 ? '#fde68a' : C.line), cursor: onGoExceptions ? 'pointer' : 'default' }}>
          <span style={qTitle(exceptionCount > 0 ? '#b45309' : C.text3)}>{dot(exceptionCount > 0 ? '#d97706' : C.strong)}예외 승인 대기</span>
          <span style={{ display: 'flex', alignItems: 'baseline', width: '100%', gap: 8 }}>
            {queueNum(exceptionCount)}
            {exceptionCount > 0 && exceptionOldestDays > 0 && <span style={{ fontSize: 11.5, color: C.text4, whiteSpace: 'nowrap' }}>가장 오래된 {exceptionOldestDays}일</span>}
            {onGoExceptions && <span style={go}>검토 →</span>}
          </span>
        </button>
      </div>

      {/* 팀별 현황 — 팀 행 클릭 → 담당자 펼침, 담당자 클릭 → 실적 */}
      <section aria-label="팀별 현황" style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap' }}>
          <h2 style={{ margin: '0 8px 0 0', fontWeight: 800, fontSize: 14 }}>팀별 현황</h2>
          {COMPANIES.map(c => (
            <button key={c} type="button" aria-pressed={company === c} onClick={() => setCompany(c)} style={{ padding: '5px 10px', borderRadius: 999, border: `1px solid ${company === c ? C.ink : C.line}`, background: company === c ? C.ink : '#fff', color: company === c ? '#fff' : C.text2, fontSize: 12, fontWeight: company === c ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>{c}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.text4 }}>팀 클릭 → 담당자 펼침 · 담당자 클릭 → 실적</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 960 }}>
            <div style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, padding: '8px 18px 0', fontSize: 11, fontWeight: 700, color: C.text3 }}>
              <span />
              <span style={{ gridColumn: 'span 5', textAlign: 'center', paddingBottom: 4, borderBottom: `2px solid ${C.strong}`, margin: '0 8px' }}>영업</span>
              <span style={{ gridColumn: 'span 2', textAlign: 'center', paddingBottom: 4, borderBottom: `2px solid ${C.strong}`, margin: '0 8px' }}>수의계약</span>
              <span style={{ gridColumn: 'span 5', textAlign: 'center', paddingBottom: 4, borderBottom: `2px solid ${C.brand}`, margin: '0 8px', color: C.brand }}>PT</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, padding: '6px 18px', fontSize: 11, fontWeight: 600, color: C.text4, borderBottom: `1px solid ${C.line2}`, textAlign: 'right' }}>
              <span style={{ textAlign: 'left' }}>팀 · 구성원</span>
              {['건수', '매출', '진행률', '승', '패', '건수', '매출', '건수', '승', '무', '패', '승률'].map((h, i) => <span key={i}>{h}</span>)}
            </div>
            {team.rows.map(r => {
              const open = !!teamOpen[r.name];
              return (
                <React.Fragment key={r.name}>
                  <button type="button" aria-expanded={open} onClick={() => setTeamOpen(o => ({ ...o, [r.name]: !o[r.name] }))} style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, alignItems: 'center', width: '100%', minHeight: 52, padding: '8px 18px', border: 0, borderBottom: `1px solid ${C.line3}`, background: open ? C.muted : '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: C.text }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden="true" style={{ width: 10, fontSize: 11, color: C.text4 }}>{open ? '▾' : '▸'}</span>
                      <span>
                        <span style={{ display: 'block', fontWeight: 700 }}>{r.name}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: C.text4 }}>{r.members.join(' · ')}</span>
                      </span>
                    </span>
                    {cells(r, true)}
                  </button>
                  {open && (memberRows[r.name] || []).map(m => (
                    <button key={m.name} type="button" onClick={() => (onGoMember ? onGoMember(m.name) : onGoTeam && onGoTeam(r))} style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, alignItems: 'center', width: '100%', minHeight: 40, padding: '6px 18px', border: 0, borderBottom: `1px solid ${C.line3}`, background: '#fff', fontSize: 12.5, color: C.text2, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 18 }}>
                        <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: C.accent, color: C.brand, fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{m.name.slice(0, 1)}</span>
                        <span style={{ fontWeight: 600, color: C.text }}>{m.name}</span>
                      </span>
                      {cells(m, false)}
                    </button>
                  ))}
                </React.Fragment>
              );
            })}
            <div style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, alignItems: 'center', padding: '11px 18px', fontSize: 13, fontWeight: 700, background: C.muted }}>
              <span title="팀에 속한 담당자 기준 합계 — 위 흐름 카드(전체)와 다를 수 있습니다" style={{ paddingLeft: 18 }}>팀 합계</span>
              {cells(team.total, true)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const rightCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {/* 오늘·내일 PT */}
      <section aria-label="오늘·내일 PT" style={{ ...card, overflow: 'hidden' }}>
        <div style={cardHead}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>오늘 · 내일 PT</h2>
          {upUn > 0 && <span style={{ padding: '2px 8px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', fontSize: 11, fontWeight: 700 }}>미배정 {upUn}</span>}
          {onGoSchedule && <button type="button" onClick={onGoSchedule} style={linkBtn}>일정 →</button>}
        </div>
        {upcoming.length === 0 ? (
          <div style={{ padding: '18px 16px', fontSize: 12.5, color: C.text4 }}>오늘·내일 잡힌 PT가 없어요 · 일정에서 추가할 수 있어요</div>
        ) : upcoming.map(s => {
          const un = isUnassignedPT(s, todayStr);
          return (
            <div key={s.id} role="button" tabIndex={0} onClick={() => onOpenPt && onOpenPt(s)} onKeyDown={e => { if (e.key === 'Enter') onOpenPt && onOpenPt(s); }} style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${C.line3}`, background: un ? '#fff7ed' : '#fff', cursor: 'pointer' }}>
              <span>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{s.date === todayStr ? '오늘' : '내일'}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.text3 }}>{shortTime(s.time) || '시간 미정'}</span>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(s)}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[s.workType, s.address].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              {un
                ? <button type="button" onClick={e => { e.stopPropagation(); onOpenPt && onOpenPt(s); }} style={{ height: 26, padding: '0 10px', border: 0, borderRadius: 7, background: '#b91c1c', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>배정</button>
                : <span style={{ fontSize: 12, fontWeight: 600, color: C.text2, whiteSpace: 'nowrap' }}>{String(s.ptAssignee || '').split(/[\/,]/)[0]}</span>}
            </div>
          );
        })}
      </section>

      {/* 분기정산 — 블루 카드 */}
      <section aria-label={`Q${qMeta?.quarter} 분기정산`} style={{ background: C.brand, color: '#fff', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Q{qMeta?.quarter} 분기정산</h2>
          {qMeta?.ddayText && <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 999, background: '#fff', color: '#b91c1c', fontSize: 11, fontWeight: 700 }}>마감 {qMeta.ddayText}</span>}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>{stl.amount.toLocaleString('ko-KR')}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2, opacity: .85 }}>원</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, fontSize: 11.5 }}>
          {[['담당자 확인', `${finalCount} / ${(assigneeNames || []).length}`], ['정산요청', `${stl.byStatus.requested || 0}건`], ['검토필요', `${stl.byStatus.needs_review || 0}건`, (stl.byStatus.needs_review || 0) > 0 ? '#fcd34d' : '#fff']].map(([k, v, c]) => (
            <div key={k} style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,.12)' }}>
              <div style={{ opacity: .8 }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: c || '#fff' }}>{v}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onGoSettlement} style={{ height: 36, border: 0, borderRadius: 8, background: '#fff', color: C.brand, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>분기정산 열기 · 확인 요청 보내기</button>
      </section>

      {/* 최근 활동 */}
      <section aria-label="최근 활동" style={{ ...card, overflow: 'hidden' }}>
        <div style={cardHead}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>최근 활동</h2>
          {onGoActivity && <button type="button" onClick={onGoActivity} style={linkBtn}>활동 로그 →</button>}
        </div>
        {activity.length === 0
          ? <div style={{ padding: '18px 16px', fontSize: 12.5, color: C.text4 }}>아직 기록된 활동이 없어요</div>
          : activity.slice(0, 5).map(a => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 10, padding: '9px 16px', borderBottom: `1px solid ${C.line3}`, fontSize: 12.5 }}>
              <span style={{ color: C.text4, fontSize: 11.5 }}>{whenText(a.at, todayStr)}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b style={{ color: C.text }}>{a.by || '-'}</b> <span style={{ color: C.text2 }}>{activityText(a)}</span></span>
            </div>
          ))}
      </section>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.muted, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
      <AppSidebar {...sidebar} />
      <main style={{ flex: 1, minWidth: 0, background: C.muted, display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 64px — 액션은 검색 + 주 CTA 하나 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 64, padding: '0 28px', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>메인</h1>
          <label htmlFor="md-year" style={srOnly}>연도</label>
          <select id="md-year" value={year} onChange={e => onYearChange(e.target.value)} style={{ height: 34, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', flex: 'none' }}>
            {(years || []).map(y => <option key={y} value={y}>{y === 'all' ? '전체' : `${y}년`}</option>)}
          </select>
          <span style={{ fontSize: 13, color: C.text3, whiteSpace: 'nowrap' }}>{today.getMonth() + 1}월 {today.getDate()}일 {KDAY[today.getDay()]}요일</span>
          <div style={{ flex: 1 }} />
          <form role="search" onSubmit={e => { e.preventDefault(); if (search.trim() && onSearch) onSearch(search.trim()); }}>
            <label htmlFor="md-search" style={srOnly}>현장·담당자 검색 (일정에서 찾기)</label>
            <input id="md-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="현장·담당자 검색 ( / )" style={{ height: 36, width: 240, minWidth: 0, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </form>
          {onAdd && <button type="button" onClick={onAdd} style={{ height: 36, padding: '0 16px', border: 0, borderRadius: 8, background: C.brand, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ 일정 추가</button>}
        </div>

        <div style={{ padding: '24px 28px 28px', display: 'grid', gridTemplateColumns: wide ? 'minmax(0, 1fr) 400px' : 'minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          {leftCol}
          {rightCol}
        </div>
      </main>
    </div>
  );
}
