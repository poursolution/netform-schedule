import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildRow, FILTERS, matchesWho, matchesSearch, sortByPriority, sortByDate, kpis,
  settlementTargets, staffStats, quarterPts, quarterMeta, formatWon, mmdd, todayKey,
  settlementStep, SETTLEMENT_STEPS, kaptCandidateText, ptsBeforeQuarter, isCarryover, quarterLabelOf,
} from '../utils/workbench.js';
import AppSidebar from './AppSidebar.jsx';
import { calculateSettlementAmount, deriveAssigneeResult, getQuarterKey } from '../utils/settlement.js';

// 실적 작업대 (#2a) — 디자인 핸드오프 design_handoff_pour_sales_ops 기준.
// 데이터 저장·정산 계산은 전부 App 이 넘겨준 콜백과 settlement.js 에서 처리한다.

const C = {
  brand: '#0F4C75', brand2: '#3282B8', accent: '#BBE1FA', active: '#eef5fb',
  line: '#e2e8f0', line2: '#f1f5f9', strong: '#cbd5e1', muted: '#f8fafc',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const RES = {
  승: ['#dcfce7', '#15803d', '#86efac'],
  무: ['#fef3c7', '#b45309', '#fcd34d'],
  패: ['#fef2f2', '#b91c1c', '#fca5a5'],
  지원: ['#dbeafe', '#0F4C75', '#93c5fd'],
};
const VERIFY = {
  verified: ['K-APT 검증', '#dcfce7', '#15803d'],
  needs_review: ['검토필요', '#fef3c7', '#b45309'],
  cancelled: ['취소공고', '#fef2f2', '#b91c1c'],
};
const STL = {
  unsettled: ['미정산', '#f1f5f9', '#475569'],
  needs_review: ['검토필요', '#fef3c7', '#b45309'],
  requested: ['정산요청', '#dbeafe', '#0F4C75'],
  confirmed: ['정산확정', '#BBE1FA', '#0F4C75'],
  completed: ['정산완료', '#dcfce7', '#15803d'],
  excluded: ['제외', '#f8fafc', '#94a3b8'],
};
const RESULT_KEYS = ['승', '무', '패', '지원'];

const chip = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' });
const btn = {
  base: { fontFamily: 'inherit', cursor: 'pointer', fontSize: 13, borderRadius: 8, whiteSpace: 'nowrap' },
};
const primaryBtn = (h = 34) => ({ ...btn.base, height: h, padding: '0 14px', border: 0, background: C.brand, color: '#fff', fontWeight: 700 });
const secondaryBtn = (h = 34) => ({ ...btn.base, height: h, padding: '0 12px', border: `1px solid ${C.line}`, background: '#fff', color: C.text });
const inlineBtn = (tone = 'outline') => ({
  ...btn.base, height: 28, padding: '0 10px', borderRadius: 7, fontSize: 12,
  ...(tone === 'primary' ? { border: 0, background: C.brand, color: '#fff', fontWeight: 600 }
    : tone === 'outline' ? { border: `1px solid ${C.brand}`, background: '#fff', color: C.brand, fontWeight: 600 }
    : tone === 'danger' ? { border: '1px solid #fecaca', background: '#fff', color: '#b91c1c' }
    : tone === 'neutral' ? { border: `1px solid ${C.strong}`, background: '#fff', color: C.text }
    : { border: `1px solid ${C.line}`, background: '#fff', color: C.text2 }),
});
const bigResultBtn = (cur, key) => {
  const on = cur === key, c = RES[key];
  return { fontFamily: 'inherit', cursor: 'pointer', height: 44, borderRadius: 10, fontSize: 15, fontWeight: on ? 700 : 500, background: on ? c[0] : '#fff', color: on ? c[1] : C.text3, border: `1px solid ${on ? c[2] : C.line}` };
};
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12 };
const dot = (bg, r = '50%') => ({ width: 7, height: 7, borderRadius: r, background: bg, flex: 'none' });

// 넓은 화면에선 현장 칸만 늘지 않도록 남는 폭을 오른쪽 칸들에도 나눈다
const GRID = '24px 52px minmax(180px, 2.6fr) minmax(84px, 1fr) minmax(56px, .8fr) minmax(76px, 1fr) minmax(76px, 1fr) minmax(78px, 1fr)';
const STAFF_GRID = '68px 40px 40px 40px 44px minmax(120px,1fr) 64px 92px 76px';


function quarterOptions(now = new Date()) {
  const y = now.getFullYear();
  const out = [];
  for (let yy = y + 1; yy >= y - 1; yy--) for (let q = 4; q >= 1; q--) out.push(`${yy}-Q${q}`);
  return out;
}

export default function PerformanceWorkbench({
  ptSchedules,
  assigneeNames,
  currentUser,
  initialQuarterKey,
  initialFilter,        // 메인 처리 카드에서 넘어올 때 ('review' 등)
  initialWho,           // 담당자 이름 또는 { label, names } (팀)
  confirmStateOf,       // (quarterKey, name) => '미확인' | '1R 확인' | '검증요청' | '최종확정'
  nav,                  // [{ key, label, active, badge, onClick }]
  adminNav,             // [{ key, label, badge, onClick }]
  onOpenMyPage,
  onLogout,
  onOpenLegacy,         // 전환 기간용 — 기존 실적 화면으로
  onOpenQuarterSettlement,
  exportActions,        // [{ key, label, onClick(quarterKey) }]
  onSetResult,          // (pt, assignee, result|null) => Promise|void
  onToggleSettlementFlag, // (pt, assignee, flag, checked) => void
  onToggleSelfPT,       // (pt, checked) => void
  onKaptReverify,       // (pt) => void
  onKaptManualApprove,  // (pt, assignee) => void
  onKaptCancel,         // (pt) => void
  onOpenKaptCandidates, // (pt) => void
  onOpenExceptions,     // () => void — 예외 승인 큐(#11a), 관리자만
  onSaveMemo,           // (pt, assignee, text) => Promise<string 결과 문구>
  onBulkRequest,        // (pts) => void
  onBulkManualApprove,  // (pts) => void
  onBulkReverify,       // (pts) => void
  onRemindUnconfirmed,  // (quarterKey, names) => void
  onRequestFinalConfirm,// (quarterKey) => void
  reportInfo,           // (quarterKey) => string
}) {
  // 1분마다 다시 계산 — 오늘 PT는 시간이 지나는 순간 "결과 미입력"으로 올라온다
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const today = todayKey(now);
  // 기본은 이번 분기 — 오늘 PT가 바로 보이게. 지난 분기 마감 작업은 분기정산 화면에서 그 분기로 넘어온다
  const [quarterKey, setQuarterKey] = useState(initialQuarterKey || getQuarterKey());
  const [tab, setTab] = useState('sites');
  const [filter, setFilter] = useState(initialFilter || 'all');
  const [who, setWho] = useState(initialWho || '전체');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState({});
  const [memo, setMemo] = useState('');
  const [memoSaved, setMemoSaved] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const searchRef = useRef(null);

  const meta = useMemo(() => quarterMeta(quarterKey), [quarterKey]);
  const qPts = useMemo(() => quarterPts(ptSchedules || [], quarterKey), [ptSchedules, quarterKey]);
  const minuteKey = `${today} ${now.getHours()}:${now.getMinutes()}`;
  const allRows = useMemo(() => qPts.map(pt => buildRow(pt, today, now)), [qPts, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 지난 분기에서 결과 미입력·검토필요로 남은 건도 목록·처리 대기에 함께 (분기 KPI·정산 집계에는 넣지 않음)
  const carryRows = useMemo(() => ptsBeforeQuarter(ptSchedules || [], quarterKey)
    .map(pt => ({ ...buildRow(pt, today, now), carry: true })).filter(isCarryover), [ptSchedules, quarterKey, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const listRows = useMemo(() => [...allRows, ...carryRows], [allRows, carryRows]);
  const searched = useMemo(() => listRows.filter(r => matchesSearch(r, search)), [listRows, search]);
  const byWho = useMemo(() => searched.filter(r => matchesWho(r, who)), [searched, who]);
  const [sortMode, setSortMode] = useState('date');
  const rows = useMemo(() => (sortMode === 'priority' ? sortByPriority : sortByDate)(byWho.filter(FILTERS[filter] || FILTERS.all)), [byWho, filter, sortMode]);
  const k = useMemo(() => kpis(allRows), [allRows]);
  const targets = useMemo(() => settlementTargets(qPts), [qPts]);
  const staff = useMemo(() => staffStats(qPts, assigneeNames || []), [qPts, assigneeNames]);
  const queueCount = {
    review: listRows.filter(FILTERS.review).length,
    pending: listRows.filter(FILTERS.pending).length,
    requested: allRows.filter(FILTERS.requested).length,
  };
  const confirmOf = name => (confirmStateOf ? confirmStateOf(quarterKey, name) : '미확인');
  const finalCount = (assigneeNames || []).filter(n => confirmOf(n) === '최종확정').length;

  const selected = listRows.find(r => r.id === selectedId) || rows[0] || null;

  useEffect(() => { setMemo(selected?.pt?.resultReasons?.[selected?.main]?.adminNote || ''); setMemoSaved(''); }, [selected?.id]);

  // 결과는 기존 handleResultClick 경로로 즉시 저장 — 같은 버튼 다시 누르면 취소, 승/무/패는 사유 입력 창
  const setResult = (row, key) => {
    if (!row || !row.main || !onSetResult) return;
    setSelectedId(row.id);
    onSetResult(row.pt, row.main, key);
  };

  // 키보드: ↑↓ 이동, 1~4 결과 입력, / 검색
  const keyState = useRef({});
  keyState.current = { rows, selected, tab };
  useEffect(() => {
    const onKey = e => {
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      const { rows: rs, selected: sel, tab: tb } = keyState.current;
      if (tb !== 'sites') return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      const i = rs.findIndex(r => r.id === sel?.id);
      if (e.key === 'ArrowDown' && rs[i + 1]) { e.preventDefault(); setSelectedId(rs[i + 1].id); }
      else if (e.key === 'ArrowUp' && rs[i - 1]) { e.preventDefault(); setSelectedId(rs[i - 1].id); }
      else if (e.key === ' ' && sel) { e.preventDefault(); setChecked(c => ({ ...c, [sel.id]: !c[sel.id] })); }
      else if (['1', '2', '3', '4'].includes(e.key) && sel) setResult(sel, RESULT_KEYS[+e.key - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const checkedRows = listRows.filter(r => checked[r.id]);
  const nChecked = checkedRows.length;
  const goQueue = f => { setTab('sites'); setFilter(f); };
  const nextReview = () => {
    const list = rows.filter(r => r.isReview);
    if (!list.length) return;
    const i = list.findIndex(r => r.id === selected?.id);
    setSelectedId(list[(i + 1) % list.length].id);
  };

  // ===== 스타일 조각 =====
  const tabBtn = key => ({ padding: '10px 2px', border: 0, background: 'transparent', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: tab === key ? 700 : 500, color: tab === key ? C.brand : C.text3, boxShadow: tab === key ? `inset 0 -2px 0 ${C.brand}` : 'none' });
  const queueStyle = (key, on) => ({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '14px 16px', minWidth: 0, background: key === 'review' && !on ? '#fffbeb' : '#fff', border: `1px solid ${on ? C.brand : key === 'review' ? '#fde68a' : C.line}`, borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxShadow: on ? `0 0 0 3px ${C.accent}` : 'none' });
  const filterBtn = (on, warn) => ({ padding: '5px 10px', borderRadius: 7, border: 0, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, background: on ? (warn ? '#fef3c7' : C.brand) : 'transparent', color: on ? (warn ? '#b45309' : '#fff') : warn ? '#b45309' : C.text2 });
  const whoChip = on => ({ padding: '4px 9px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.text2, fontWeight: on ? 700 : 500, fontFamily: 'inherit' });
  const confirmTone = s => s === '최종확정' ? ['#dcfce7', '#15803d'] : s === '1R 확인' ? ['#dbeafe', C.brand] : s === '검증요청' ? ['#fef3c7', '#b45309'] : ['#f1f5f9', C.text3];

  const filterCount = key => byWho.filter(FILTERS[key]).length;
  const filterDefs = [['all', '전체'], ['win', '승'], ['draw', '무'], ['loss', '패'], ['sup', '지원 포함'], ['pending', '미입력'], ...(carryRows.length ? [['carry', '이전 분기 미확인']] : [])];

  const qLabel = meta ? `Q${meta.quarter}` : '';
  const ddayRed = meta && meta.dday !== null && meta.dday <= 7;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.muted, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
      <AppSidebar
        nav={(nav || []).map(n => (n.active ? { ...n, badge: queueCount.review } : n))}
        adminNav={adminNav}
        currentUser={currentUser}
        onOpenMyPage={onOpenMyPage}
        onLogout={onLogout}
        onOpenLegacy={onOpenLegacy}
        footer={meta && (
          <div style={{ padding: 12, borderRadius: 10, background: C.muted, border: `1px solid ${C.line}`, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{meta.label} 마감</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: ddayRed ? '#b91c1c' : C.text3 }}>{meta.ddayText}</span>
            </div>
            <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>{meta.closingText} · 급여 반영 {meta.payrollMonth ? +meta.payrollMonth.slice(5) : ''}월</div>
            <div style={{ display: 'flex', height: 4, borderRadius: 2, background: C.line, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: `${(assigneeNames || []).length ? finalCount / assigneeNames.length * 100 : 0}%`, background: C.brand }} />
            </div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 5 }}>담당자 최종확정 {finalCount} / {(assigneeNames || []).length}</div>
          </div>
        )}
      />

      {/* ===== 메인 ===== */}
      <main style={{ flex: 1, minWidth: 0, background: C.muted, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>실적</h1>
          <label style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} htmlFor="wb-quarter">분기</label>
          <select id="wb-quarter" value={quarterKey} onChange={e => { setQuarterKey(e.target.value); setChecked({}); }} style={{ height: 32, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', flex: 'none' }}>
            {quarterOptions().map(q => <option key={q} value={q}>{q.replace('-', ' ')}</option>)}
          </select>
          {meta && <span style={{ fontSize: 12, color: C.text4, whiteSpace: 'nowrap' }}>마감 {meta.closingText} · <b style={{ color: ddayRed ? '#b91c1c' : C.text3, fontWeight: 700 }}>{meta.ddayText}</b></span>}
          <div style={{ flex: 1 }} />
          <label style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} htmlFor="wb-search">현장·담당자 검색</label>
          <input id="wb-search" ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="현장·담당자 검색 ( / )" style={{ height: 34, width: 220, minWidth: 0, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          <div style={{ position: 'relative' }}>
            <button type="button" aria-expanded={exportOpen} onClick={() => setExportOpen(o => !o)} style={secondaryBtn()}>내보내기 ▾</button>
            {exportOpen && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 38, zIndex: 30, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(15,23,42,.12)' }}>
                {(exportActions || []).map(a => (
                  <button key={a.key} type="button" role="menuitem" onClick={() => { setExportOpen(false); a.onClick(quarterKey); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, background: 'transparent', borderRadius: 7, fontSize: 13, color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}>{a.label}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => onOpenQuarterSettlement && onOpenQuarterSettlement(quarterKey)} style={primaryBtn()}>분기정산</button>
        </div>

        {/* KPI 바 */}
        <div style={{ ...card, display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr 1fr 1fr', margin: '18px 24px 0', overflow: 'hidden' }}>
          {[
            { label: 'PT 건수', value: k.total, color: C.text },
            { label: '승', value: k.w, color: '#15803d', dot: '#16a34a' },
            { label: '무', value: k.d, color: '#b45309', dot: '#d97706' },
            { label: '패', value: k.l, color: '#b91c1c', dot: '#b91c1c' },
            { label: '진행중', value: k.p, color: C.text3, dot: C.strong },
          ].map(x => (
            <div key={x.label} style={{ padding: '12px 16px', borderRight: `1px solid ${C.line2}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.text3, fontWeight: 600 }}>{x.dot && <span style={dot(x.dot, 2)} />}{x.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginTop: 2, lineHeight: 1.2, color: x.color }}>{x.value}</div>
            </div>
          ))}
          <div style={{ padding: '12px 16px', background: C.muted }}>
            <div style={{ fontSize: 11.5, color: C.brand, fontWeight: 600 }}>승률 (무 제외)</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginTop: 2, lineHeight: 1.2, color: C.brand }}>{k.rate}%</div>
          </div>
        </div>

        {/* 큐 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, padding: '12px 24px 0' }}>
          {[
            { key: 'review', label: '검토필요 · K-APT 미매칭', dot: '#d97706', color: '#b45309', action: '처리 →' },
            { key: 'pending', label: '결과 미입력 · 지난 PT', dot: C.strong, color: C.text3, action: '입력 →' },
            { key: 'requested', label: '정산요청 · 확정 대기', dot: C.brand2, color: C.brand, action: '확정 →' },
          ].map(q => (
            <button key={q.key} type="button" onClick={() => goQueue(q.key)} aria-pressed={tab === 'sites' && filter === q.key} style={queueStyle(q.key, tab === 'sites' && filter === q.key)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: q.color, whiteSpace: 'nowrap' }}><span style={dot(q.dot)} />{q.label}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', width: '100%' }}>
                <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1, color: C.text }}>{queueCount[q.key]}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2, color: C.text3 }}>건</span></span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand }}>{q.action}</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setTab('stl')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '14px 16px', background: C.brand, border: 0, borderRadius: 12, color: '#fff', minWidth: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: .75, whiteSpace: 'nowrap' }}>{qLabel} 정산 예상 · 대상 {targets.count}건</span>
            <span style={{ display: 'flex', alignItems: 'baseline', width: '100%' }}>
              <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{targets.amount.toLocaleString('ko-KR')}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2, opacity: .8 }}>원</span></span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.accent, whiteSpace: 'nowrap' }}>상세 →</span>
            </span>
          </button>
        </div>

        {/* 본문 2열 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 16, padding: '16px 24px 24px', flex: 1, minHeight: 0, alignItems: 'start' }}>
          <section style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div role="tablist" aria-label="실적 보기" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 16px', borderBottom: `1px solid ${C.line}` }}>
              <button type="button" role="tab" aria-selected={tab === 'sites'} onClick={() => setTab('sites')} style={tabBtn('sites')}>현장 목록</button>
              <button type="button" role="tab" aria-selected={tab === 'staff'} onClick={() => setTab('staff')} style={tabBtn('staff')}>담당자 비교</button>
              <button type="button" role="tab" aria-selected={tab === 'stl'} onClick={() => setTab('stl')} style={tabBtn('stl')}>정산 현황</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: C.text4 }}>표시 {rows.length}건 · {qLabel} {allRows.length}건{carryRows.length ? ` + 이전 분기 미확인 ${carryRows.length}건` : ''}</span>
            </div>

            {tab === 'sites' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: C.text4, marginRight: 2 }}>담당</span>
                  {typeof who === 'object' && (
                    <button type="button" aria-pressed="true" onClick={() => setWho('전체')} style={whoChip(true)}>{who.label} ✕</button>
                  )}
                  {['전체', ...(assigneeNames || [])].map(n => (
                    <button key={n} type="button" aria-pressed={who === n} onClick={() => setWho(n)} style={whoChip(who === n)}>{n === '전체' ? `전체 · ${(assigneeNames || []).length}명` : n}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 14px', borderBottom: `1px solid ${C.line2}`, fontSize: 12, flexWrap: 'wrap' }}>
                  {filterDefs.map(([key, label]) => (
                    <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} style={filterBtn(filter === key)}>{label} {filterCount(key)}</button>
                  ))}
                  <span style={{ width: 1, height: 16, background: C.line, margin: '0 6px' }} />
                  <button type="button" aria-pressed={filter === 'review'} onClick={() => setFilter('review')} style={filterBtn(filter === 'review', true)}>검토필요 {filterCount('review')}</button>
                  {filter === 'requested' && <button type="button" aria-pressed="true" onClick={() => setFilter('all')} style={filterBtn(true)}>정산요청 {filterCount('requested')} ✕</button>}
                  <div style={{ flex: 1 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.text4 }}>
                    정렬
                    <select value={sortMode} onChange={e => setSortMode(e.target.value)} style={{ border: 0, background: 'transparent', color: C.text3, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                      <option value="date">날짜순 (최근 위)</option>
                      <option value="priority">처리 우선</option>
                    </select>
                  </label>
                </div>
                {nChecked > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: C.active, borderBottom: `1px solid ${C.accent}`, fontSize: 12.5 }}>
                    <b style={{ color: C.brand }}>{nChecked}건 선택</b>
                    <button type="button" onClick={() => onBulkRequest && onBulkRequest(checkedRows.map(r => r.pt))} style={inlineBtn('outline')}>일괄 정산요청</button>
                    <button type="button" onClick={() => onBulkManualApprove && onBulkManualApprove(checkedRows.map(r => r.pt))} style={inlineBtn('outline')}>수동 승인</button>
                    <button type="button" onClick={() => onBulkReverify && onBulkReverify(checkedRows.map(r => r.pt))} style={inlineBtn('secondary')}>K-APT 재검증</button>
                    <div style={{ flex: 1 }} />
                    <button type="button" onClick={() => setChecked({})} style={{ border: 0, background: 'transparent', color: C.text3, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>선택 해제</button>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: GRID, columnGap: 12, padding: '8px 14px', fontSize: 12, fontWeight: 700, color: C.text3, background: C.muted, borderBottom: `1px solid ${C.line}`, alignItems: 'center' }}>
                  <input type="checkbox" aria-label="표시된 행 전체 선택" checked={rows.length > 0 && rows.every(r => checked[r.id])} onChange={e => setChecked(e.target.checked ? Object.fromEntries(rows.map(r => [r.id, true])) : {})} style={{ margin: 0, width: 14, height: 14 }} />
                  <span>일자</span><span>현장 · 공종 · 공법</span><span>담당</span><span style={{ textAlign: 'center' }}>결과</span><span style={{ textAlign: 'center' }}>K-APT 검증</span><span style={{ textAlign: 'center' }}>정산</span><span style={{ textAlign: 'right' }}>금액</span>
                </div>
                <div>
                  {rows.map(r => <SiteRow key={r.id} r={r} selected={selected?.id === r.id} checked={!!checked[r.id]} today={today}
                    onSelect={() => setSelectedId(r.id)}
                    onCheck={() => setChecked(c => ({ ...c, [r.id]: !c[r.id] }))} />)}
                </div>
                {rows.length === 0 && (
                  <div style={{ padding: '48px 20px', textAlign: 'center', color: C.text4, fontSize: 13 }}>조건에 맞는 현장이 없습니다.<div style={{ fontSize: 12, marginTop: 4 }}>담당자·상태 필터를 바꿔보세요.</div></div>
                )}
                <div style={{ padding: '10px 14px', fontSize: 12, color: C.text4, borderTop: `1px solid ${C.line2}`, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span><b style={{ color: C.text3, fontWeight: 600 }}>↑↓</b> 이동</span>
                  <span><b style={{ color: C.text3, fontWeight: 600 }}>1 · 2 · 3 · 4</b> 승 · 무 · 패 · 지원</span>
                  <span><b style={{ color: C.text3, fontWeight: 600 }}>Space</b> 선택</span>
                  <span style={{ marginLeft: 'auto' }}>정산 귀속은 PT 진행일 기준 · 마감 후 확정 건은 다음 분기</span>
                </div>
              </>
            )}

            {tab === 'staff' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: STAFF_GRID, columnGap: 8, padding: '8px 16px', fontSize: 11, fontWeight: 600, color: C.text4, borderBottom: `1px solid ${C.line2}`, whiteSpace: 'nowrap' }}>
                  <span>담당자</span><span style={{ textAlign: 'right' }}>승</span><span style={{ textAlign: 'right' }}>무</span><span style={{ textAlign: 'right' }}>패</span><span style={{ textAlign: 'right' }}>진행</span><span>승률 · 승/무/패 비율</span><span style={{ textAlign: 'right' }}>검토필요</span><span style={{ textAlign: 'right' }}>{qLabel} 정산예상</span><span style={{ textAlign: 'right' }}>확인</span>
                </div>
                {staff.map(s => {
                  const bar = (n, bg) => ({ width: s.dec ? `${n / s.dec * 100}%` : 0, background: bg });
                  const cs = confirmOf(s.name), tone = confirmTone(cs);
                  return (
                    <button key={s.name} type="button" onClick={() => { setWho(s.name); setFilter('all'); setTab('sites'); }} style={{ display: 'grid', gridTemplateColumns: STAFF_GRID, columnGap: 8, alignItems: 'center', padding: '10px 16px', fontSize: 13, border: 0, borderBottom: `1px solid ${C.muted}`, background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', color: C.text, textAlign: 'left', width: '100%' }}>
                      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                      <span style={{ textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{s.w}</span>
                      <span style={{ textAlign: 'right', color: '#b45309' }}>{s.d}</span>
                      <span style={{ textAlign: 'right', color: '#b91c1c' }}>{s.l}</span>
                      <span style={{ textAlign: 'right', color: C.text4 }}>{s.p}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, width: 38, flex: 'none' }}>{s.rate}%</span>
                        <span style={{ display: 'flex', flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', background: C.line2 }}>
                          <span style={bar(s.w, '#16a34a')} /><span style={bar(s.d, '#d97706')} /><span style={bar(s.l, '#b91c1c')} />
                        </span>
                        <span style={{ fontSize: 11, color: C.text4, flex: 'none' }}>{s.total}건</span>
                      </span>
                      <span style={{ textAlign: 'right' }}>{s.review ? <span style={chip('#fef3c7', '#b45309')}>{s.review}건</span> : <span style={{ color: C.strong, fontSize: 12 }}>—</span>}</span>
                      <span style={{ textAlign: 'right', fontWeight: 600, fontSize: 12.5 }}>{s.est.toLocaleString('ko-KR')}원</span>
                      <span style={{ textAlign: 'right' }}><span style={chip(tone[0], tone[1])}>{cs}</span></span>
                    </button>
                  );
                })}
                <div style={{ padding: '10px 16px', fontSize: 12, color: C.text4, borderTop: `1px solid ${C.line2}` }}>행 클릭 → 해당 담당자 현장 목록 · 확인 상태: 미확인 → 1R 확인 → (검증요청) → 최종확정</div>
              </>
            )}

            {tab === 'stl' && (
              <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                  {[
                    ['unsettled', '미정산', C.text3, C.text, '결과 O · 요청 전'],
                    ['needs_review', '검토필요', '#b45309', '#b45309', 'K-APT 미매칭', '#fffbeb'],
                    ['requested', '정산요청', C.brand, C.brand, '담당자 체크 · 자동전환'],
                    ['confirmed', '정산확정', C.brand, C.brand, '관리자 확정'],
                    ['completed', '정산완료', '#15803d', '#15803d', '지급 완료'],
                    ['excluded', '제외', C.text4, C.text3, '패 · 본인PT · 취소공고', C.muted],
                  ].map(([key, label, lc, vc, sub, bg], i) => (
                    <div key={key} style={{ padding: 14, borderRight: i < 5 ? `1px solid ${C.line2}` : 0, background: bg || '#fff' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: lc }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginTop: 2, color: vc }}>{targets.byStatus[key] || 0}</div>
                      <div style={{ fontSize: 11, color: key === 'needs_review' ? '#b45309' : C.text4, marginTop: 4 }}>{sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: C.text4, marginTop: -8 }}>담당자별 건수(지원 포함) — 위 처리 카드와 현장 목록은 현장(주담당) 기준이라 숫자가 다를 수 있습니다.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ padding: '14px 16px', border: `1px solid ${C.line}`, borderRadius: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>분기 메타</div>
                    {meta && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 12.5 }}>
                        <span style={{ color: C.text4 }}>분기</span><span style={{ fontWeight: 600 }}>{meta.key} ({meta.months})</span>
                        <span style={{ color: C.text4 }}>마감일</span><span style={{ fontWeight: 600, color: ddayRed ? '#b91c1c' : C.text }}>{meta.closingFull} ({meta.ddayText})</span>
                        <span style={{ color: C.text4 }}>급여 반영월</span><span style={{ fontWeight: 600 }}>{meta.payrollMonth}</span>
                        <span style={{ color: C.text4 }}>집계 기준</span><span>PT 진행일 · 마감 후 확정 건은 다음 분기</span>
                        <span style={{ color: C.text4 }}>보고서</span><span>{(reportInfo && reportInfo(quarterKey)) || '—'}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '14px 16px', border: `1px solid ${C.line}`, borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>2라운드 확정 진행</div>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: C.text3 }}>{finalCount} / {(assigneeNames || []).length} 최종확정</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(assigneeNames || []).map(n => {
                        const cs = confirmOf(n), tone = confirmTone(cs);
                        return <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 6px', border: `1px solid ${C.line}`, borderRadius: 999, fontSize: 12 }}><span style={chip(tone[0], tone[1])}>{cs}</span>{n}</span>;
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                      {onRemindUnconfirmed && <button type="button" onClick={() => onRemindUnconfirmed(quarterKey, (assigneeNames || []).filter(n => confirmOf(n) !== '최종확정'))} style={{ ...inlineBtn('outline'), height: 30 }}>미확인자 리마인드</button>}
                      {onRequestFinalConfirm && <button type="button" onClick={() => onRequestFinalConfirm(quarterKey)} style={{ ...inlineBtn('primary'), height: 30 }}>최종확정 요청 발송</button>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <DetailPanel
            row={selected}
            memo={memo}
            setMemo={v => { setMemo(v); setMemoSaved(''); }}
            memoSaved={memoSaved}
            canMemo={!!onSaveMemo}
            onSaveMemo={async () => { if (!selected || !onSaveMemo) return; const msg = await onSaveMemo(selected.pt, selected.main, memo); setMemoSaved(msg || '저장됨'); }}
            onNextReview={nextReview}
            onResult={key => setResult(selected, key)}
            onToggleSettlementFlag={onToggleSettlementFlag}
            onToggleSelfPT={onToggleSelfPT}
            onKaptReverify={onKaptReverify}
            onKaptManualApprove={onKaptManualApprove}
            onKaptCancel={onKaptCancel}
            onOpenKaptCandidates={onOpenKaptCandidates}
            onOpenExceptions={onOpenExceptions}
          />
        </div>
      </main>
    </div>
  );
}

function SiteRow({ r, selected, checked, today, onSelect, onCheck }) {
  const pt = r.pt;
  const methods = methodsOf(pt);
  const v = r.verify ? VERIFY[r.verify] : null;
  const st = r.stl ? STL[r.stl] : null;
  const c = r.has ? RES[r.result] : null;
  return (
    <div onClick={onSelect} style={{ display: 'grid', gridTemplateColumns: GRID, columnGap: 12, alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${C.line2}`, cursor: 'pointer', background: selected ? C.active : checked ? C.muted : '#fff', boxShadow: selected ? `inset 3px 0 0 ${C.brand}` : 'none' }}>
      <input type="checkbox" aria-label={`${pt.siteName || ''} 선택`} checked={checked} onClick={e => e.stopPropagation()} onChange={onCheck} style={{ margin: 0, width: 14, height: 14 }} />
      <span style={{ fontSize: 12, color: C.text3 }}>
        {mmdd(r.date)}
        {r.carry && <span title="지난 분기 PT — 아직 확인이 안 끝남" style={{ display: 'block', width: 'fit-content', marginTop: 2, padding: '0 4px', borderRadius: 4, background: '#fef3c7', color: '#b45309', fontSize: 10, fontWeight: 700 }}>{quarterLabelOf(r.date)}</span>}
      </span>
      <div style={{ minWidth: 0, paddingRight: 10 }}>
        <button type="button" onClick={onSelect} style={{ display: 'block', maxWidth: '100%', padding: 0, border: 0, background: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: C.text, fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pt.siteName || '(현장명 없음)'}</button>
        <div style={{ fontSize: 11.5, color: C.text4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[pt.workType, methods.length ? methods.join(' · ') : '공법 미입력'].filter(Boolean).join(' · ')}</div>
      </div>
      <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 6 }}>{r.main}{r.sups.length ? ` +${r.sups.join(',')}` : ''}</span>
      <span style={{ textAlign: 'center' }}><span style={r.has ? chip(c[0], c[1]) : chip('#f1f5f9', C.text4)}>{r.has ? r.result : r.isFuture ? '예정' : '미입력'}</span></span>
      <span style={{ textAlign: 'center' }}>{v ? <span style={chip(v[1], v[2])}>{v[0]}</span> : <span style={{ color: C.strong, fontSize: 12 }}>—</span>}</span>
      <span style={{ textAlign: 'center' }}>{st ? <span style={chip(st[1], st[2])}>{st[0]}</span> : <span style={chip('transparent', C.text4)}>결과 대기</span>}</span>
      <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700 }}>{formatWon(r.amount)}</span>
    </div>
  );
}

function methodsOf(pt) {
  const m = pt.announcementMethods;
  if (Array.isArray(m)) return m.filter(Boolean);
  if (m && typeof m === 'object') return Object.values(m).filter(Boolean);
  if (typeof m === 'string' && m.trim()) return m.split(/[,·/]/).map(s => s.trim()).filter(Boolean);
  return [];
}

function DetailPanel({ row, memo, setMemo, memoSaved, canMemo, onSaveMemo, onNextReview, onResult,
  onToggleSettlementFlag, onToggleSelfPT, onKaptReverify, onKaptManualApprove, onKaptCancel, onOpenKaptCandidates, onOpenExceptions }) {
  if (!row) {
    return <aside style={{ ...card, padding: 24, fontSize: 13, color: C.text4, textAlign: 'center' }}>왼쪽 목록에서 현장을 고르세요.</aside>;
  }
  const pt = row.pt;
  const methods = methodsOf(pt);
  const v = row.verify ? VERIFY[row.verify] : null;
  const st = row.stl ? STL[row.stl] : null;
  const stl = pt.settlement?.[row.main] || {};
  const xReq = pt.exceptionRequests?.[row.main];
  const xLabel = xReq?.type === 'no_bid_to_win' ? '공고문 없는 현장 신청됨' : '영업적 승리 신청됨';
  const kapt = !row.has ? ['결과 입력 후 자동 검증', '승/무/패 입력 시 K-APT(data.go.kr) 자동 조회', C.muted, C.text3, C.line]
    : row.verify === 'verified' ? ['K-APT 검증 완료', '공고 매칭 · 정산 대상 자동 전환', '#dcfce7', '#15803d', '#bbf7d0']
    : row.verify === 'cancelled' ? ['취소공고 확인됨', '발주처 취소 · 정산 제외 · 재공고 대기', '#fef2f2', '#b91c1c', '#fecaca']
    : row.verify === 'needs_review' ? ['K-APT 공고 미매칭', kaptCandidateText(pt),'#fef3c7', '#b45309', '#fde68a']
    : ['K-APT 검증 전', '아직 조회 기록이 없습니다', C.muted, C.text3, C.line];
  const stepIdx = settlementStep(row);
  const steps = SETTLEMENT_STEPS.map((label, i) => {
    const done = i < stepIdx, cur = i === stepIdx, warn = cur && i === 1 && row.isReview;
    const metaText = done && i === 0 ? mmdd(String(pt.resultConfirmDate?.[row.main] || row.date).slice(0, 10))
      : warn ? '처리 필요' : cur && i === 2 ? '담당자 체크 대기' : '';
    return { label, done, cur, warn, metaText };
  });
  const sups = row.sups.map(name => {
    const res = deriveAssigneeResult(pt, name);
    const amt = calculateSettlementAmount(pt, name);
    const text = !res ? '결과 대기' : res === '지원' ? `지원 · ${formatWon(amt.amount)}` : res === '제외' ? '제외 (주담 무 · 예외승인 필요)' : `${res} · ${formatWon(amt.amount)}`;
    return { name, text };
  });
  const logs = activityLogs(row);

  const flag = (key, label, checkedVal, onChange) => (
    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checkedVal} onChange={e => onChange(e.target.checked)} />{label}
    </label>
  );

  return (
    <aside aria-label="선택한 현장 상세" style={{ ...card, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', position: 'sticky', top: 76, maxHeight: 'calc(100vh - 92px)' }}>
      <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          {v && <span style={chip(v[1], v[2])}>{v[0]}</span>}
          {st && <span style={chip(st[1], st[2])}>{st[0]}</span>}
          {xReq?.status === 'pending' && (onOpenExceptions
            ? <button type="button" onClick={onOpenExceptions} title="예외 승인 큐 열기" style={{ ...chip('#dbeafe', C.brand), border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>{xLabel} ›</button>
            : <span style={chip('#dbeafe', C.brand)}>{xLabel}</span>)}
          <button type="button" onClick={onNextReview} style={{ marginLeft: 'auto', height: 26, padding: '0 9px', border: `1px solid ${C.line}`, borderRadius: 7, background: '#fff', color: C.text2, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>다음 검토 건 →</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.3 }}>{pt.siteName}</div>
        <div style={{ fontSize: 12.5, color: C.text3, marginTop: 3 }}>{[pt.workType, `${row.date} ${row.time}`.trim(), methods.join(' · ')].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 12.5, padding: 12, borderRadius: 10, background: C.muted }}>
          <span style={{ color: C.text4 }}>주담당</span><span style={{ fontWeight: 600 }}>{row.main || '—'}</span>
          <span style={{ color: C.text4 }}>요청사</span><span>{pt.requester || pt.client || '—'}</span>
          <span style={{ color: C.text4 }}>주소</span><span>{pt.address || '—'}</span>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text3 }}>결과 입력 · {row.main}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: C.text4 }}>단축키 1·2·3·4</span>
          </div>
          <div role="group" aria-label="결과 입력" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {RESULT_KEYS.map(key => <button key={key} type="button" aria-pressed={row.result === key} onClick={() => onResult(key)} style={bigResultBtn(row.result, key)}>{key}</button>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: C.text3, marginTop: 8 }}>
            <span>정산 예상 <b style={{ color: C.text, fontSize: 13 }}>{formatWon(row.amount)}</b></span>
            <span style={{ marginLeft: 'auto' }}>귀속 {row.date ? `${row.date.slice(0, 4)} Q${Math.ceil(+row.date.slice(5, 7) / 3)}` : '—'}</span>
          </div>
          {sups.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '9px 11px', borderRadius: 9, background: C.muted, border: `1px dashed ${C.strong}`, fontSize: 12.5 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.accent, color: C.brand, fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flex: 'none' }}>지</span>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ color: C.text3 }}>{s.text}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: C.text4 }}>주담 결과에 종속 · 승도 분할 25만</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 10, background: kapt[2], border: `1px solid ${kapt[4]}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: kapt[3] }}>{kapt[0]}</div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{kapt[1]}</div>
          {row.has && row.verify === 'needs_review' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {onOpenKaptCandidates && <button type="button" onClick={() => onOpenKaptCandidates(pt)} style={inlineBtn('primary')}>후보 공고 확인</button>}
              {onKaptReverify && <button type="button" onClick={() => onKaptReverify(pt)} style={inlineBtn('neutral')}>재검증</button>}
              {onKaptManualApprove && <button type="button" onClick={() => onKaptManualApprove(pt, row.main)} style={inlineBtn('neutral')}>수동 승인</button>}
              {onKaptCancel && <button type="button" onClick={() => onKaptCancel(pt)} style={inlineBtn('danger')}>취소공고</button>}
            </div>
          )}
          {row.has && !row.verify && onKaptReverify && (
            <div style={{ marginTop: 10 }}><button type="button" onClick={() => onKaptReverify(pt)} style={inlineBtn('neutral')}>K-APT 검증</button></div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.line2}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text3, marginBottom: 4 }}>정산 단계</div>
          {steps.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, flex: 'none', boxSizing: 'border-box', background: s.done ? '#16a34a' : s.warn ? '#fef3c7' : s.cur ? '#dbeafe' : '#fff', color: s.done ? '#fff' : s.warn ? '#b45309' : C.brand, border: s.done ? 0 : s.warn ? '1.5px solid #d97706' : s.cur ? `1.5px solid ${C.brand}` : `1.5px solid ${C.strong}` }}>{s.done ? '✓' : s.warn ? '!' : ''}</span>
              <span style={{ fontSize: 13, color: s.done || s.cur ? C.text : C.text4, fontWeight: s.cur ? 700 : 500 }}>{s.label}{s.cur ? <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> (현재 단계)</span> : null}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: C.text4 }}>{s.metaText}</span>
            </div>
          ))}
        </div>
        {row.has && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: C.text2, borderTop: `1px solid ${C.line2}`, paddingTop: 12 }}>
            {onToggleSettlementFlag && flag('requested', '정산요청', stl.requested, c => onToggleSettlementFlag(pt, row.main, 'requested', c))}
            {onToggleSettlementFlag && flag('selfSales', '본인영업', stl.selfSales, c => onToggleSettlementFlag(pt, row.main, 'selfSales', c))}
            {onToggleSelfPT && flag('selfPT', '협약사 자체PT', pt.selfPT, c => onToggleSelfPT(pt, c))}
            {onToggleSettlementFlag && flag('settlementExcluded', '정산예외', stl.settlementExcluded, c => onToggleSettlementFlag(pt, row.main, 'settlementExcluded', c))}
          </div>
        )}
        {logs.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text3, marginBottom: 6 }}>활동 로그</div>
            {logs.map((lg, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '4px 0' }}>
                <span style={{ color: C.text4, flex: 'none', width: 84 }}>{lg.t}</span>
                <span style={{ flex: 1 }}>{lg.what}</span>
                <span style={{ color: C.text4 }}>{lg.by}</span>
              </div>
            ))}
          </div>
        )}
        {canMemo && row.has && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} htmlFor="wb-memo">크로스체크 메모</label>
            <textarea id="wb-memo" value={memo} onChange={e => setMemo(e.target.value)} placeholder="크로스체크 메모 · 담당자에게 잔디로 전달됩니다" style={{ height: 60, padding: 10, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', resize: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {memoSaved && <span style={{ fontSize: 12, color: memoSaved.includes('실패') || memoSaved.includes('미설정') ? '#b45309' : '#15803d', fontWeight: 700 }}>{memoSaved}</span>}
              <button type="button" onClick={onSaveMemo} disabled={!memo.trim()} style={{ ...primaryBtn(32), marginLeft: 'auto', fontSize: 12.5, opacity: memo.trim() ? 1 : 0.5 }}>저장</button>
            </div>
          </div>
        )}
        {!canMemo && row.pt.resultReasons?.[row.main]?.adminNote && (
          <div style={{ fontSize: 12.5, padding: '10px 12px', borderRadius: 10, background: C.muted }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text3, marginBottom: 4 }}>크로스체크 메모</div>
            {row.pt.resultReasons[row.main].adminNote}
          </div>
        )}
      </div>
    </aside>
  );
}

function fmtTs(iso) {
  if (!iso) return '';
  const s = String(iso);
  const d = s.slice(5, 10).replace('-', '/');
  const t = s.length > 11 ? s.slice(11, 16) : '';
  return `${d} ${t}`.trim();
}

function activityLogs(row) {
  const pt = row.pt;
  const out = [];
  if (pt.createdAt) out.push({ t: fmtTs(pt.createdAt), what: 'PT 일정 등록', by: pt.createdBy || row.main });
  const rcd = pt.resultConfirmDate?.[row.main];
  if (row.has && rcd) out.push({ t: fmtTs(rcd), what: `결과 입력 · ${row.result}`, by: row.main });
  if (pt.kaptVerified?.checkedAt || pt.kaptVerified?.verifiedAt) out.push({ t: fmtTs(pt.kaptVerified.checkedAt || pt.kaptVerified.verifiedAt), what: `K-APT ${VERIFY[pt.kaptVerified.status]?.[0] || '조회'}`, by: pt.kaptVerified.by || '자동' });
  const stl = pt.settlement?.[row.main] || {};
  if (stl.requestedAt) out.push({ t: fmtTs(stl.requestedAt), what: '정산요청', by: stl.requestedBy === 'auto-verified' ? '자동' : (stl.requestedBy || row.main) });
  if (stl.confirmedAt) out.push({ t: fmtTs(stl.confirmedAt), what: '정산확정', by: stl.confirmedBy || '관리자' });
  if (stl.completedAt) out.push({ t: fmtTs(stl.completedAt), what: '정산완료', by: stl.completedBy || '관리자' });
  return out.sort((a, b) => a.t.localeCompare(b.t));
}
