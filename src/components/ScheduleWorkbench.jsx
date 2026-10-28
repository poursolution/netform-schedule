import React, { useMemo, useRef, useState } from 'react';
import AppSidebar from './AppSidebar.jsx';
import {
  TYPE_ORDER, typeMeta, assigneesOf, isUnassignedItem, isUnassignedPT, titleOf, subOf, shortTime, matchesSearch, matchesWorkType,
  matchesWho, monthCells, sortDay, LIST_FILTERS, LIST_TITLES,
} from '../utils/scheduleView.js';
import {
  nextBusinessDays, briefRows, buildBriefText, groupByDay, briefTitle, briefRecipients, kDate, kTime, kDayShort, BRIEF_FOOTER, unassignedUpcoming,
} from '../utils/morningBrief.js';

// 일정 — #6b 월 달력 + #6c 리스트·아침 브리핑 (디자인 핸드오프 design_handoff_pour_sales_ops 기준)

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb',
  line: '#e2e8f0', line2: '#f1f5f9', strong: '#cbd5e1', muted: '#f8fafc', blank: '#fafbfc',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const RES = { 승: ['#dcfce7', '#15803d'], 무: ['#fef3c7', '#b45309'], 패: ['#fef2f2', '#b91c1c'], 지원: ['#dbeafe', '#0F4C75'] };
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12 };
const tag = type => { const m = typeMeta(type); return { display: 'inline-block', padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: m.bg, color: m.fg, flex: 'none' }; };
const pill = (bg, fg, extra = {}) => ({ display: 'inline-block', padding: '2px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', ...extra });
const selectStyle = { height: 34, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 13, fontFamily: 'inherit' };
const primary = (h = 34) => ({ height: h, padding: '0 14px', border: 0, borderRadius: 8, background: C.brand, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });
const outline = (h = 28) => ({ height: h, padding: '0 10px', border: `1px solid ${C.brand}`, borderRadius: 7, background: '#fff', color: C.brand, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });
const secondary = (h = 34) => ({ height: h, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 12.5, color: C.text, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });
const LIST_GRID = '112px minmax(0, 1.6fr) minmax(0, 1.5fr) 120px minmax(0, 1fr) 92px';

export default function ScheduleWorkbench({
  schedules,            // allSchedules (모든 종류)
  ptSchedules,
  todayStr,
  holidayName,          // (dateStr) => string|undefined
  roster,               // 비는 담당자 계산용 명단
  assigneeOptions,
  workTypeOptions,
  initialView = 'month',
  initialListFilter = 'upcoming',
  initialSearch = '',
  sidebar,              // AppSidebar props
  onAdd,                // (dateStr|null) => void
  onOpen,               // (schedule) => void — 기존 수정 창
  onOpenTeam,           // 팀 캘린더(외부 링크)
  briefDayCount = 2,
  onSendBrief,          // ({ rows, days }) => Promise<string 결과 문구>
  autoSend,             // boolean | undefined
  onToggleAutoSend,     // (checked) => void — 관리자만
}) {
  const [view, setView] = useState(initialView);
  const [month, setMonth] = useState(() => { const d = new Date(todayStr + 'T00:00:00'); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selDate, setSelDate] = useState(todayStr);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState(initialSearch);
  const [who, setWho] = useState('all');
  const [wt, setWt] = useState('all');
  const [listFilter, setListFilter] = useState(initialListFilter);
  const [listYear, setListYear] = useState('all');
  const [listMonth, setListMonth] = useState('all');
  const [listMode, setListMode] = useState('detail');
  const [brief, setBrief] = useState({ status: 'idle', text: '' });
  const listRef = useRef(null);
  const briefRef = useRef(null);

  const y = month.getFullYear(), m0 = month.getMonth();
  const monthKey = `${y}-${String(m0 + 1).padStart(2, '0')}`;

  const filtered = useMemo(() => (schedules || []).filter(s => s && s.date && (!s.dateType || s.dateType === 'confirmed')
    && matchesSearch(s, search) && matchesWho(s, who) && matchesWorkType(s, wt)), [schedules, search, who, wt]);
  const inMonth = useMemo(() => filtered.filter(s => s.date.startsWith(monthKey)), [filtered, monthKey]);
  const isUn = s => isUnassignedPT(s, todayStr);
  const visible = useMemo(() => filtered.filter(s => typeFilter === 'all' || (typeFilter === 'un' ? isUnassignedPT(s, todayStr) : s.type === typeFilter)), [filtered, typeFilter, todayStr]);
  const unMonth = inMonth.filter(s => isUnassignedPT(s, todayStr)).length;
  const byDate = useMemo(() => {
    const map = {};
    visible.forEach(s => { (map[s.date] = map[s.date] || []).push(s); });
    Object.keys(map).forEach(k => { map[k] = sortDay(map[k]); });
    return map;
  }, [visible]);

  const typeChips = [['all', '전체'], ...TYPE_ORDER.filter(t => inMonth.some(s => s.type === t)).map(t => [t, typeMeta(t).label])];
  const cells = monthCells(y, m0);
  const dayItems = byDate[selDate] || [];
  const busy = new Set((schedules || []).filter(s => s && s.date === selDate).flatMap(assigneesOf));
  const free = (roster || []).filter(n => !busy.has(n));

  const shiftMonth = k => setMonth(new Date(y, m0 + k, 1));
  const goToday = () => { const d = new Date(todayStr + 'T00:00:00'); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelDate(todayStr); };
  const pickItem = s => { setSelDate(s.date); onOpen && onOpen(s); };

  // ===== #6c 리스트 =====
  const ptBase = useMemo(() => (ptSchedules || []).filter(s => s && s.date && (!s.dateType || s.dateType === 'confirmed')
    && matchesSearch(s, search) && matchesWho(s, who) && matchesWorkType(s, wt)
    && (listYear === 'all' || s.date.startsWith(listYear)) && (listMonth === 'all' || s.date.slice(5, 7) === listMonth)), [ptSchedules, search, who, wt, listYear, listMonth]);
  const listRows = useMemo(() => ptBase.filter(s => (LIST_FILTERS[listFilter] || LIST_FILTERS.upcoming)(s, todayStr))
    .sort((a, b) => listFilter === 'past' || listFilter === 'all'
      ? b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time))
      : a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))), [ptBase, listFilter, todayStr]);
  const years = [...new Set((ptSchedules || []).map(s => (s.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();

  // ===== 아침 브리핑 =====
  const briefDays = useMemo(() => nextBusinessDays(todayStr, briefDayCount, d => !!(holidayName && holidayName(d))), [todayStr, briefDayCount, holidayName]);
  const bRows = useMemo(() => briefRows(ptSchedules, briefDays), [ptSchedules, briefDays]);
  const bGroups = groupByDay(bRows, briefDays);
  const bUnassigned = bRows.filter(r => !r.assignees.length).length;
  const unUpcoming = useMemo(() => unassignedUpcoming(schedules, todayStr), [schedules, todayStr]);

  const saveImage = (el, name) => {
    if (!el || !window.html2canvas) { alert('이미지 저장 기능을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
    window.html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true }).then(canvas => {
      const a = document.createElement('a');
      a.download = name;
      a.href = canvas.toDataURL('image/png');
      a.click();
    });
  };
  const copyText = async () => {
    try { await navigator.clipboard.writeText(buildBriefText(bRows, briefDays)); setBrief({ status: 'copied', text: '텍스트를 복사했습니다' }); }
    catch { alert('복사하지 못했습니다. 브라우저 권한을 확인해 주세요.'); }
  };
  const sendBrief = async () => {
    if (!onSendBrief || brief.status === 'sending') return;
    setBrief({ status: 'sending', text: '' });
    try {
      const msg = await onSendBrief({ rows: bRows, days: briefDays });
      setBrief(msg ? { status: 'sent', text: msg } : { status: 'idle', text: '' });
    } catch (e) {
      setBrief({ status: 'error', text: `발송 실패: ${e.message}` });
    }
  };

  const seg = (on, first) => ({ padding: '6px 12px', border: 0, borderLeft: first ? 0 : `1px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.text3, fontWeight: on ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 });
  const typeChip = on => ({ padding: '5px 10px', borderRadius: 999, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.text2, fontWeight: on ? 700 : 500 });
  const listChip = (on, warn) => ({ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, border: `1px solid ${on ? (warn ? '#fde68a' : C.brand) : C.line}`, background: on ? (warn ? '#fef3c7' : C.brand) : '#fff', color: on ? (warn ? '#b45309' : '#fff') : warn ? '#b45309' : C.text2 });
  const selD = new Date(selDate + 'T00:00:00');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.muted, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
      <AppSidebar {...sidebar} />
      <main style={{ flex: 1, minWidth: 0, background: C.muted, display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>일정</h1>
          <div role="group" aria-label="보기" style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
            <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')} style={seg(view === 'month', true)}>월</button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} style={seg(view === 'list')}>리스트</button>
            {onOpenTeam && <button type="button" onClick={onOpenTeam} style={seg(false)}>팀 ↗</button>}
          </div>
          <div style={{ flex: 1 }} />
          <label htmlFor="sw-search" style={srOnly}>현장·담당자 검색</label>
          <input id="sw-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="현장·담당자 검색" style={{ height: 34, width: 220, minWidth: 0, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          <label htmlFor="sw-who" style={srOnly}>담당</label>
          <select id="sw-who" value={who} onChange={e => setWho(e.target.value)} style={selectStyle}>
            <option value="all">담당 전체</option>
            {(assigneeOptions || []).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label htmlFor="sw-wt" style={srOnly}>공종</label>
          <select id="sw-wt" value={wt} onChange={e => setWt(e.target.value)} style={selectStyle}>
            <option value="all">공종 전체</option>
            {(workTypeOptions || []).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {onAdd && <button type="button" onClick={() => onAdd(view === 'month' ? selDate : null)} style={primary()}>+ 일정 추가</button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, padding: '16px 24px 24px', flex: 1, minHeight: 0, alignItems: 'start' }}>
          {view === 'month' ? (
            <>
              {/* ===== #6b 달력 ===== */}
              <section aria-label="월 달력" style={{ ...card, overflow: 'hidden', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap' }}>
                  <button type="button" aria-label="이전 달" onClick={() => shiftMonth(-1)} style={{ width: 32, height: 32, border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 15, color: C.text2, cursor: 'pointer', fontFamily: 'inherit' }}>‹</button>
                  <button type="button" aria-label="다음 달" onClick={() => shiftMonth(1)} style={{ width: 32, height: 32, border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 15, color: C.text2, cursor: 'pointer', fontFamily: 'inherit' }}>›</button>
                  <h2 style={{ margin: '0 0 0 6px', fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{y}년 {m0 + 1}월</h2>
                  <button type="button" onClick={goToday} style={{ height: 28, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 7, background: '#fff', fontSize: 12, color: C.brand, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 4 }}>오늘</button>
                  <span style={{ width: 1, height: 18, background: C.line, margin: '0 8px' }} />
                  {typeChips.map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={typeFilter === k} onClick={() => setTypeFilter(k)} style={typeChip(typeFilter === k)}>{l} {k === 'all' ? inMonth.length : inMonth.filter(s => s.type === k).length}</button>
                  ))}
                  <button type="button" aria-pressed={typeFilter === 'un'} onClick={() => setTypeFilter(f => f === 'un' ? 'all' : 'un')} style={{ ...typeChip(typeFilter === 'un'), border: `1px solid ${typeFilter === 'un' ? '#b91c1c' : '#fecaca'}`, background: typeFilter === 'un' ? '#b91c1c' : '#fef2f2', color: typeFilter === 'un' ? '#fff' : '#b91c1c', fontWeight: 700 }}>미배정 {unMonth}</button>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: C.text4 }}>이번 달 {inMonth.length}건</span>
                </div>
                {unMonth > 0 && (
                  <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#b91c1c', color: '#fff', fontSize: 13 }}>
                    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', color: '#b91c1c', fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center', flex: 'none' }}>!</span>
                    <span><b>담당 미배정 PT {unMonth}건</b> — 배정되지 않은 PT는 아침 브리핑에도, 담당자 일정에도 안 나갑니다</span>
                    <button type="button" onClick={() => setTypeFilter('un')} style={{ marginLeft: 'auto', height: 30, padding: '0 12px', border: 0, borderRadius: 7, background: '#fff', color: '#b91c1c', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' }}>미배정만 보기</button>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', fontSize: 11.5, fontWeight: 600, color: C.text4, textAlign: 'center', borderBottom: `1px solid ${C.line2}` }}>
                  {KDAY.map((d, i) => <span key={d} style={{ padding: '8px 0', color: i === 0 ? '#b91c1c' : i === 6 ? C.brand : C.text4 }}>{d}</span>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, background: C.line2, borderBottom: `1px solid ${C.line2}` }}>
                  {cells.map((ds, i) => {
                    if (!ds) return <div key={`b${i}`} style={{ minHeight: 104, background: C.blank }} />;
                    const items = byDate[ds] || [];
                    const dow = i % 7, isToday = ds === todayStr, isSel = ds === selDate;
                    const hol = holidayName ? holidayName(ds) : null;
                    const red = dow === 0 || !!hol;
                    return (
                      <div key={ds} onClick={() => setSelDate(ds)} style={{ minHeight: 104, padding: '6px 6px 4px', display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer', background: isSel ? C.active : '#fff', boxShadow: isSel ? `inset 0 0 0 1.5px ${C.brand}` : 'none', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, minWidth: 0 }}>
                          <button type="button" aria-label={`${+ds.slice(5, 7)}월 ${+ds.slice(8)}일${hol ? ` ${hol}` : ''} 선택`} aria-pressed={isSel} onClick={e => { e.stopPropagation(); setSelDate(ds); }} style={{ width: 22, height: 22, borderRadius: 11, display: 'grid', placeItems: 'center', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: isToday ? '#fff' : red ? '#b91c1c' : dow === 6 ? C.brand : C.text2, background: isToday ? C.brand : 'transparent', flex: 'none' }}>{+ds.slice(8)}</button>
                          {hol && <span style={{ fontSize: 10.5, color: '#b91c1c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hol}</span>}
                        </div>
                        {items.slice(0, 3).map(s => {
                          const un = isUn(s);
                          return (
                            <button key={s.id} type="button" onClick={e => { e.stopPropagation(); pickItem(s); }} title={un ? `${titleOf(s)} — 담당 미배정` : titleOf(s)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 5px', borderRadius: 5, background: un ? '#fef2f2' : C.muted, border: un ? '1px dashed #f87171' : '1px solid transparent', fontSize: 11.5, minWidth: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', fontWeight: un ? 700 : 500, color: un ? '#b91c1c' : C.text }}>
                              <span style={un ? { ...tag(s.type), background: '#b91c1c', color: '#fff' } : tag(s.type)}>{un ? '미배정' : typeMeta(s.type).label}</span>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(s)}</span>
                            </button>
                          );
                        })}
                        {items.length > 3 && <span style={{ fontSize: 11, color: C.text3, paddingLeft: 5 }}>+{items.length - 3}건 더</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 14, padding: '10px 16px', fontSize: 11.5, color: C.text3, flexWrap: 'wrap' }}>
                  {['pt', 'briefing', 'seminar', 'meeting', 'vacation'].map(t => (
                    <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: typeMeta(t).bg, border: `1px solid ${C.strong}` }} />{typeMeta(t).label}</span>
                  ))}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#fef2f2', border: '1px dashed #f87171', boxSizing: 'border-box' }} /><b style={{ color: '#b91c1c' }}>미배정</b></span>
                  <span style={{ marginLeft: 'auto' }}>날짜 클릭 → 우측에 상세 · 일정 클릭 → 일정 열기</span>
                </div>
              </section>

              {/* ===== 선택일 패널 ===== */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 76 }}>
                <section aria-label="선택한 날짜 일정" style={{ ...card, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${C.line2}` }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{selD.getMonth() + 1}월 {selD.getDate()}일 ({KDAY[selD.getDay()]})</h2>
                    <span style={{ marginLeft: 6, fontSize: 12, color: C.text3 }}>{dayItems.length}건</span>
                    {onAdd && <button type="button" onClick={() => onAdd(selDate)} style={{ ...outline(), marginLeft: 'auto' }}>+ 이 날에 추가</button>}
                  </div>
                  {holidayName && holidayName(selDate) && <div style={{ padding: '6px 16px', fontSize: 12, color: '#b91c1c', borderBottom: `1px solid ${C.muted}` }}>{holidayName(selDate)}</div>}
                  {dayItems.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: C.text4, fontSize: 13 }}>선택한 날짜에 일정이 없습니다</div>}
                  <div style={{ maxHeight: 'calc(100vh - 360px)', overflow: 'auto' }}>
                    {dayItems.map(s => {
                      const names = assigneesOf(s);
                      const mainName = names[0];
                      const result = s.type === 'pt' ? ((mainName && s.results?.[mainName]) || s.result) : null;
                      const review = s.type === 'pt' && result && s.kaptVerified?.status === 'needs_review' && !Object.keys(s.evidenceFiles || {}).length;
                      const un = isUn(s);
                      return (
                        <div key={s.id} onClick={() => onOpen && onOpen(s)} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.muted}`, background: un ? '#fef2f2' : '#fff', cursor: 'pointer' }}>
                          <span style={{ flex: 'none', width: 44 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{shortTime(s.time)}</span>
                            <span style={tag(s.type)}>{typeMeta(s.type).label}</span>
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <button type="button" onClick={e => { e.stopPropagation(); onOpen && onOpen(s); }} style={{ display: 'block', maxWidth: '100%', padding: 0, border: 0, background: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: C.text, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(s)}</button>
                            {subOf(s) && <span style={{ display: 'block', fontSize: 12, color: C.text3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subOf(s)}</span>}
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: C.text2, flexWrap: 'wrap' }}>
                              {un ? (
                                <>
                                  <span style={pill('#b91c1c', '#fff', { padding: '3px 8px', fontWeight: 700 })}>담당 미배정</span>
                                  <button type="button" onClick={e => { e.stopPropagation(); onOpen && onOpen(s); }} style={{ height: 26, padding: '0 10px', border: 0, borderRadius: 7, background: C.brand, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>지금 배정</button>
                                </>
                              ) : names.length ? <span style={{ fontWeight: 600 }}>{names.join(' · ')}</span> : isUnassignedItem(s) ? <span style={pill('#fef2f2', '#b91c1c', { border: '1px solid #fecaca' })}>미배정</span> : null}
                              {result && RES[result] && <span style={pill(RES[result][0], RES[result][1])}>{result}</span>}
                              {review && <span style={pill('#fef3c7', '#b45309')}>검토필요</span>}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
                {free.length > 0 && (
                  <section aria-label="이 날 비는 담당자" style={{ ...card, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>이 날 비는 담당자</h2>
                      <span style={{ marginLeft: 6, fontSize: 12, color: C.text4 }}>{free.length}명</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.text2, marginTop: 6, lineHeight: 1.6 }}>{free.join(' · ')}</div>
                    <div style={{ fontSize: 11.5, color: C.text4, marginTop: 6 }}>미배정 PT에 배정할 때 참고</div>
                  </section>
                )}
                {unMonth > 0 ? (
                  <section aria-label="담당 미배정 PT" style={{ ...card, border: '1px solid #fecaca', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>담당 미배정 PT {unMonth}건</div>
                      <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>이번 달 예정 PT 중 담당자가 없는 건 · 아침 브리핑 때 관리자 잔디에 목록 포함</div>
                    </div>
                    <button type="button" onClick={() => setTypeFilter('un')} style={{ ...primary(30), background: '#b91c1c', fontSize: 12, borderRadius: 7, padding: '0 10px' }}>배정하기</button>
                  </section>
                ) : (
                  <section aria-label="담당 미배정 PT" style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                    <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center' }}>✓</span>이번 달 미배정 PT 없음
                  </section>
                )}
              </div>
            </>
          ) : (
            <>
              {/* ===== #6c 리스트 ===== */}
              <section aria-label="PT 일정 리스트" style={{ ...card, overflow: 'hidden', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap' }}>
                  {[['upcoming', '앞으로'], ['planned', '배정 완료'], ['unassigned', '미배정', true], ['past', '지난'], ['all', '전체']].map(([k, l, warn]) => (
                    <button key={k} type="button" aria-pressed={listFilter === k} onClick={() => setListFilter(k)} style={listChip(listFilter === k, warn)}>{l} {ptBase.filter(s => LIST_FILTERS[k](s, todayStr)).length}</button>
                  ))}
                  <span style={{ width: 1, height: 18, background: C.line, margin: '0 6px' }} />
                  <label htmlFor="sw-ly" style={srOnly}>연도</label>
                  <select id="sw-ly" value={listYear} onChange={e => setListYear(e.target.value)} style={{ ...selectStyle, height: 30, fontSize: 12, borderRadius: 7, padding: '0 8px' }}>
                    <option value="all">전체년도</option>
                    {years.map(yy => <option key={yy} value={yy}>{yy}년</option>)}
                  </select>
                  <label htmlFor="sw-lm" style={srOnly}>월</label>
                  <select id="sw-lm" value={listMonth} onChange={e => setListMonth(e.target.value)} style={{ ...selectStyle, height: 30, fontSize: 12, borderRadius: 7, padding: '0 8px' }}>
                    <option value="all">전체월</option>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(mm => <option key={mm} value={mm}>{+mm}월</option>)}
                  </select>
                  <div style={{ flex: 1 }} />
                  <div role="group" aria-label="표시 방식" style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: 7, overflow: 'hidden' }}>
                    <button type="button" aria-pressed={listMode === 'detail'} onClick={() => setListMode('detail')} style={{ ...seg(listMode === 'detail', true), padding: '5px 10px', fontSize: 12 }}>상세</button>
                    <button type="button" aria-pressed={listMode === 'simple'} onClick={() => setListMode('simple')} style={{ ...seg(listMode === 'simple'), padding: '5px 10px', fontSize: 12 }}>간단</button>
                  </div>
                  <button type="button" onClick={() => saveImage(listRef.current, `일정_${LIST_TITLES[listFilter]}_${todayStr}.png`)} style={{ ...secondary(30), fontSize: 12, borderRadius: 7 }}>이미지로 저장</button>
                </div>
                <div ref={listRef} style={{ background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', padding: '12px 16px 6px' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{LIST_TITLES[listFilter]} <span style={{ color: C.text4, fontWeight: 500 }}>{listRows.length}건</span></h2>
                    <span style={{ marginLeft: 8, fontSize: 12, color: C.text4 }}>{todayStr} 기준 · {listFilter === 'past' || listFilter === 'all' ? '최신순' : '날짜순'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: LIST_GRID, columnGap: 14, padding: '6px 16px', fontSize: 11, fontWeight: 600, color: C.text4, borderBottom: `1px solid ${C.line2}` }}>
                    <span>일시</span><span>현장 (참여인원){listMode === 'detail' ? ' · 주소' : ''}</span><span>요청사</span><span>공종</span><span>경쟁</span><span style={{ textAlign: 'right' }}>담당</span>
                  </div>
                  {listRows.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.text4, fontSize: 13 }}>해당하는 일정이 없습니다</div>}
                  {listRows.map(s => {
                    const names = assigneesOf(s);
                    const un = !s.ptAssignee;
                    return (
                      <button key={s.id} type="button" onClick={() => onOpen && onOpen(s)} style={{ display: 'grid', gridTemplateColumns: LIST_GRID, columnGap: 14, alignItems: 'start', width: '100%', padding: listMode === 'detail' ? '12px 16px' : '8px 16px', border: 0, borderBottom: `1px solid ${C.line2}`, background: un ? '#fff7ed' : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: C.text }}>
                        <span>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{kDate(s.date)}</span>
                          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.brand, marginTop: 2 }}>{kTime(s.time)}</span>
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(s)} {s.participants ? <span style={{ fontSize: 12, fontWeight: 500, color: C.text3 }}>({String(s.participants).replace(/명$/, '')}명)</span> : null}</span>
                          {listMode === 'detail' && s.address && <span style={{ display: 'block', fontSize: 12, color: C.text3, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.address}</span>}
                        </span>
                        <span style={{ minWidth: 0, fontSize: 12.5, lineHeight: 1.45, ...(listMode === 'simple' ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : {}) }}>{s.requester || <span style={{ color: C.text4 }}>—</span>}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.workType || <span style={{ color: C.text4, fontWeight: 400 }}>—</span>}</span>
                        <span style={{ minWidth: 0, fontSize: 12.5 }}>{s.competitor ? <span style={{ fontWeight: 700, color: '#b91c1c' }}>{s.competitor}</span> : <span style={{ color: C.text4 }}>—</span>}</span>
                        <span style={{ textAlign: 'right' }}>{un ? <span style={pill('#fef2f2', '#b91c1c', { padding: '4px 9px', fontSize: 12, fontWeight: 700, border: '1px solid #fecaca' })}>미배정</span> : <span style={{ fontSize: 13, fontWeight: 700 }}>{names.join(' + ')}</span>}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ===== 아침 브리핑 ===== */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 76 }}>
                <section aria-label="아침 브리핑" style={{ ...card, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.line2}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>아침 브리핑</h2>
                      <span style={{ marginLeft: 6, fontSize: 12, color: C.text3 }}>{bRows.length}건 · 다음 {briefDays.length}영업일</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.text4, marginTop: 2 }}>담당자 개인 잔디로 각자 일정만, 관리자 채널엔 전체</div>
                  </div>
                  <div ref={briefRef} style={{ padding: '12px 16px', background: C.muted, fontSize: 12.5, lineHeight: 1.55, color: C.text, fontFamily: "ui-monospace, Menlo, 'Pretendard Variable', monospace" }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{briefTitle(briefDays)}</div>
                    {bGroups.length === 0 && <div style={{ color: C.text3, marginBottom: 8 }}>예정된 PT가 없습니다.</div>}
                    {bGroups.map(g => (
                      <div key={g.day} style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, color: C.brand }}>▸ {kDayShort(g.day)}</div>
                        {g.items.map(r => (
                          <div key={r.id} style={{ display: 'flex', gap: 6, paddingLeft: 10 }}>
                            <span style={{ flex: 'none', color: C.text3 }}>{kTime(r.time)}</span>
                            <span style={{ minWidth: 0, flex: 1 }}>{r.siteName}{r.workType && <span style={{ color: C.text3 }}> · {r.workType}</span>}</span>
                            <span style={{ flex: 'none', fontWeight: 700, color: r.assignees.length ? C.text : '#b91c1c' }}>{r.assignees.length ? r.assignees.join('+') : '⚠ 미배정'}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {unUpcoming.length > 0 && (
                      <div style={{ marginBottom: 8, color: '#b91c1c' }}>
                        <div style={{ fontWeight: 700 }}>⚠ 담당 미배정 {unUpcoming.length}건 <span style={{ fontWeight: 400, color: C.text3 }}>(관리자 채널에만)</span></div>
                        {unUpcoming.slice(0, 5).map(u => (
                          <div key={u.id} style={{ paddingLeft: 10 }}>{kDayShort(u.date)} {kTime(u.time)} · {u.kind} · {u.siteName}</div>
                        ))}
                        {unUpcoming.length > 5 && <div style={{ paddingLeft: 10, color: C.text3 }}>…외 {unUpcoming.length - 5}건</div>}
                      </div>
                    )}
                    <div style={{ color: C.text3, marginTop: 4 }}>{BRIEF_FOOTER}</div>
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {brief.status === 'sent' && (
                      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 12px', borderRadius: 9, background: '#dcfce7', color: '#15803d', fontSize: 13, fontWeight: 700 }}>
                        <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', flex: 'none' }}>✓</span>
                        {brief.text}
                        <button type="button" onClick={() => setBrief({ status: 'idle', text: '' })} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#15803d', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>다시</button>
                      </div>
                    )}
                    {(brief.status === 'error' || brief.status === 'copied') && <div role="status" style={{ fontSize: 12, fontWeight: 600, color: brief.status === 'error' ? '#b91c1c' : '#15803d' }}>{brief.text}</div>}
                    {onSendBrief && brief.status !== 'sent' && (
                      <button type="button" onClick={sendBrief} disabled={brief.status === 'sending' || (bRows.length === 0 && unUpcoming.length === 0)} style={{ ...primary(40), borderRadius: 9, fontSize: 13.5, opacity: brief.status === 'sending' || (bRows.length === 0 && unUpcoming.length === 0) ? 0.6 : 1 }}>{brief.status === 'sending' ? '보내는 중…' : '잔디로 보내기'}</button>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <button type="button" onClick={() => saveImage(briefRef.current, `아침브리핑_${todayStr}.png`)} style={secondary()}>이미지로 저장</button>
                      <button type="button" onClick={copyText} style={secondary()}>텍스트 복사</button>
                    </div>
                    {onToggleAutoSend && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text2, marginTop: 2, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!autoSend} onChange={e => onToggleAutoSend(e.target.checked)} />매일 09:00 자동 발송 (Worker cron)
                      </label>
                    )}
                    {briefRecipients(bRows).length > 0 && <div style={{ fontSize: 11.5, color: C.text4 }}>받는 사람: {briefRecipients(bRows).join(', ')} + 관리자 채널</div>}
                  </div>
                </section>
                {bUnassigned > 0 && (
                  <section aria-label="미배정 경고" style={{ ...card, border: '1px solid #fde68a', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>미배정 PT {bUnassigned}건이 브리핑에 포함돼요</div>
                      <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>발송 전에 담당자를 지정하면 그 사람에게 바로 전달됩니다</div>
                    </div>
                    <button type="button" onClick={() => setListFilter('unassigned')} style={{ ...primary(30), fontSize: 12, borderRadius: 7, padding: '0 10px', flex: 'none' }}>배정</button>
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
