import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { TYPE_ORDER, typeMeta, assigneesOf, isUnassignedPT, titleOf, shortTime, monthCells, sortDay, isMine, nextItemAfter } from '../utils/scheduleView.js';
import { rawResultOf } from '../utils/staffHome.js';
import { isPtOver } from '../utils/workbench.js';
import MobileTabBar from './MobileTabBar.jsx';

// 일정 모바일 (#5b) — [고정 헤더: 내 일정/팀 전체 · 월 달력] + [선택일 일정 목록] + [고정 하단 탭].
// 카드 탭 → 기존 일정 수정 창. 저장 로직 없음.

const C = {
  brand: '#0F4C75', brand2: '#3282B8', accent: '#BBE1FA', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const RES = { 승: ['#dcfce7', '#15803d'], 무: ['#fef3c7', '#b45309'], 패: ['#fef2f2', '#b91c1c'], 지원: ['#dbeafe', '#0F4C75'] };
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' });
const miniTag = type => { const m = typeMeta(type); return { display: 'inline-block', padding: '1px 5px', borderRadius: 4, fontSize: 10.5, fontWeight: 700, background: m.bg, color: m.fg }; };
const navBtn = { width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', fontSize: 18, color: C.text2, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' };

export default function MobileSchedule({
  me,                 // 로그인 담당자 이름 — 없으면(관리자) "팀 전체"만
  schedules,          // allSchedules (모든 종류)
  todayStr,
  holidayName,        // (dateStr) => string|undefined
  tabs,               // MobileTabBar 탭 정의
  onOpen,             // (schedule) => void — 기존 수정 창
  onLegacy,           // 이전 화면
  topInset = 0,       // 상단 고정 배너(PWA 설치 안내) 높이
}) {
  const [team, setTeam] = useState(!me);
  const [month, setMonth] = useState(() => { const d = new Date(todayStr + 'T00:00:00'); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selDate, setSelDate] = useState(todayStr);
  const [typeFilter, setTypeFilter] = useState('all');
  const [typeSheet, setTypeSheet] = useState(false);
  // 오늘 PT 는 시간이 지나면 [길찾기] → 결과(미입력)로 바뀐다
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const y = month.getFullYear(), m0 = month.getMonth();
  const monthKey = `${y}-${String(m0 + 1).padStart(2, '0')}`;
  const base = useMemo(() => (schedules || []).filter(s => s && s.date && (!s.dateType || s.dateType === 'confirmed')
    && (team || isMine(s, me))), [schedules, team, me]);
  const visible = useMemo(() => base.filter(s => typeFilter === 'all' || s.type === typeFilter), [base, typeFilter]);
  const byDate = useMemo(() => {
    const map = {};
    visible.forEach(s => { (map[s.date] = map[s.date] || []).push(s); });
    Object.keys(map).forEach(k => { map[k] = sortDay(map[k]); });
    return map;
  }, [visible]);
  const ptInMonth = visible.filter(s => s.type === 'pt' && s.date.startsWith(monthKey)).length;
  const types = TYPE_ORDER.filter(t => base.some(s => s.type === t));

  const cells = monthCells(y, m0);
  const dayItems = byDate[selDate] || [];
  const next = dayItems.length ? null : nextItemAfter(visible, selDate);
  const sel = new Date(selDate + 'T00:00:00');

  const shiftMonth = k => setMonth(new Date(y, m0 + k, 1));
  const goToday = () => { const d = new Date(todayStr + 'T00:00:00'); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelDate(todayStr); };
  const jump = date => { const d = new Date(date + 'T00:00:00'); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelDate(date); };

  const seg = active => ({ height: 30, padding: '0 12px', borderRadius: 999, border: 0, background: active ? C.brand : 'transparent', color: active ? '#fff' : C.text2, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });

  return createPortal(
    <div style={{ position: 'fixed', top: topInset, left: 0, right: 0, bottom: 0, zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.muted, color: C.ink, fontVariantNumeric: 'tabular-nums', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      {/* 고정 헤더 — 제목·토글 · 월 이동 · 달력 */}
      <header style={{ flex: 'none', background: '#fff', borderBottom: `1px solid ${C.line}`, padding: 'calc(env(safe-area-inset-top) + 14px) 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>일정</h1>
          {onLegacy && <button type="button" onClick={onLegacy} style={{ padding: 0, border: 0, background: 'none', color: C.text4, fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>이전 화면</button>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {me && (
              <div role="group" aria-label="보기" style={{ display: 'flex', padding: 2, borderRadius: 999, background: C.line2 }}>
                <button type="button" aria-pressed={!team} onClick={() => setTeam(false)} style={seg(!team)}>내 일정</button>
                <button type="button" aria-pressed={team} onClick={() => setTeam(true)} style={seg(team)}>팀 전체</button>
              </div>
            )}
            <button type="button" onClick={() => setTypeSheet(true)} aria-label="종류 필터" style={{ height: 34, padding: '0 10px', borderRadius: 999, border: `1px solid ${typeFilter === 'all' ? C.line : C.brand}`, background: typeFilter === 'all' ? '#fff' : '#eef5fb', color: typeFilter === 'all' ? C.text2 : C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {typeFilter === 'all' ? '종류' : typeMeta(typeFilter).label} ▾
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달" style={navBtn}>‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>{y}년 {m0 + 1}월</span>
            <span style={{ fontSize: 12, color: C.text4, marginLeft: 6 }}>PT {ptInMonth}건</span>
          </div>
          <button type="button" onClick={goToday} style={{ height: 32, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>오늘</button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달" style={navBtn}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginTop: 10 }}>
          {KDAY.map((d, i) => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: i === 0 ? C.red : i === 6 ? C.brand : C.text4, paddingBottom: 4 }}>{d}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={`b${i}`} style={{ height: 48 }} />;
            const items = byDate[date] || [];
            const dow = i % 7;
            const isSel = date === selDate;
            const holiday = holidayName && holidayName(date);
            const un = items.some(s => isUnassignedPT(s, todayStr));
            const numColor = isSel ? '#fff' : date < todayStr ? C.text4 : (dow === 0 || holiday) ? C.red : dow === 6 ? C.brand : C.ink;
            const dotColor = isSel ? C.accent : un ? C.red : items.length > 1 ? C.brand : C.brand2;
            return (
              <button key={date} type="button" onClick={() => setSelDate(date)} aria-pressed={isSel} aria-label={`${+date.slice(8)}일 ${items.length}건`}
                style={{ height: 48, borderRadius: 10, border: 0, padding: 0, background: isSel ? C.brand : 'transparent', boxShadow: !isSel && date === todayStr ? `inset 0 0 0 1.5px ${C.brand}` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 14, fontWeight: isSel ? 800 : 600, color: numColor }}>{+date.slice(8)}</span>
                <span style={{ display: 'flex', gap: 2, height: 5 }}>
                  {items.length > 0 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor }} />}
                  {items.length > 1 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor }} />}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* 스크롤 — 선택일 일정 */}
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 2px 10px' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{sel.getMonth() + 1}월 {sel.getDate()}일 ({KDAY[sel.getDay()]})</h2>
          <span style={{ fontSize: 13, color: C.text3 }}>{dayItems.length}건</span>
          {holidayName && holidayName(selDate) && <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{holidayName(selDate)}</span>}
        </div>

        {dayItems.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.strong}`, borderRadius: 14, padding: '22px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: C.text3 }}>이 날은 일정이 없어요</div>
            {next && (
              <button type="button" onClick={() => jump(next.date)} style={{ marginTop: 8, padding: 0, border: 0, background: 'none', color: C.brand, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                다음 일정 {+next.date.slice(5, 7)}/{+next.date.slice(8)} {titleOf(next)}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dayItems.map(s => {
              const names = assigneesOf(s);
              const un = isUnassignedPT(s, todayStr);
              const past = s.type === 'pt' ? isPtOver(s, todayStr, now) : s.date < todayStr;
              const resultOf = s.type === 'pt' && past ? rawResultOf(s, !team && me && names.includes(me) ? me : names[0]) : null;
              const place = s.address || s.location || '';
              return (
                <div key={s.id} style={{ background: '#fff', border: `1px solid ${un ? '#fecaca' : C.line}`, borderRadius: 14, padding: '12px 14px', display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{shortTime(s.time)}</div>
                    <span style={{ ...miniTag(s.type), marginTop: 4 }}>{typeMeta(s.type).label}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <button type="button" onClick={() => onOpen && onOpen(s)} style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>
                      <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(s)}</div>
                      <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[s.workType, place].filter(Boolean).join(' · ') || ' '}</div>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 30 }}>
                      {un ? (
                        <>
                          <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: C.red, color: '#fff', fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>!</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.red }}>담당 미배정</span>
                        </>
                      ) : names.length ? (
                        <>
                          <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: C.accent, color: C.brand, fontSize: 10.5, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>{names[0].slice(0, 1)}</span>
                          <span style={{ fontSize: 12, color: C.text2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names.join(' + ')}</span>
                        </>
                      ) : null}
                      <span style={{ marginLeft: 'auto', flex: 'none' }}>
                        {resultOf ? <span style={pill(...(RES[resultOf] || ['#f1f5f9', C.text4]))}>{resultOf}</span>
                          : past && s.type === 'pt' ? <span style={pill('#f1f5f9', C.text4)}>미입력</span>
                          : !past && place ? <a href={`https://map.kakao.com/link/search/${encodeURIComponent(place)}`} target="_blank" rel="noreferrer" style={{ height: 30, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.line}`, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, color: C.ink, textDecoration: 'none', background: '#fff' }}>길찾기</a>
                          : null}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <MobileTabBar tabs={tabs} />

      {/* 종류 필터 시트 */}
      {typeSheet && (
        <div onClick={() => setTypeSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(27,38,44,.45)', display: 'flex', alignItems: 'flex-end' }}>
          <div role="dialog" aria-label="종류 선택" onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#fff', borderRadius: '18px 18px 0 0', padding: '10px 18px 30px', boxShadow: '0 -12px 40px rgba(15,23,42,.18)', boxSizing: 'border-box' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.strong, margin: '0 auto 14px' }} />
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>일정 종류</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[['all', '전체'], ...types.map(t => [t, typeMeta(t).label])].map(([k, l]) => {
                const on = typeFilter === k;
                return <button key={k} type="button" onClick={() => { setTypeFilter(k); setTypeSheet(false); }} style={{ height: 44, borderRadius: 10, border: `1px solid ${on ? C.brand : C.line}`, background: on ? '#eef5fb' : '#fff', color: on ? C.brand : C.ink, fontSize: 14, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>;
              })}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
