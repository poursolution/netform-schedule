import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { quarterMeta, reviewQueueCounts } from '../utils/workbench.js';
import { unassignedUpcoming } from '../utils/morningBrief.js';
import { isUnassignedPT, titleOf, shortTime } from '../utils/scheduleView.js';
import { getQuarterKey } from '../utils/settlement.js';
import { whenText, activityText } from './MainDashboard.jsx';
import MobileTabBar from './MobileTabBar.jsx';

// 메인 모바일 — 관리자·전체조회 계정. 데스크톱 메인(#15a)의 처리할 것 · 오늘·내일 PT · 분기정산 · 최근 활동을
// 모바일 공통 셸([고정 헤더] + [스크롤 영역] + [고정 하단 탭])로. 숫자는 데스크톱 메인과 같은 계산.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const card = { flex: 'none', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14 };
const cardHead = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${C.line2}` };
const linkBtn = { marginLeft: 'auto', minHeight: 32, padding: '0 2px', border: 0, background: 'none', fontSize: 12.5, fontWeight: 600, color: C.brand, cursor: 'pointer', fontFamily: 'inherit' };
const addDays = (ds, n) => { const d = new Date(`${ds}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function MobileMain({
  me,                   // 로그인 사용자 이름
  ptSchedules, schedules, todayStr,
  settlementQuarterKey, settlementSummary,
  exceptionCount = 0,
  activity = [],
  tabs,
  onGoReview, onGoUnassigned, onGoSettlement, onGoExceptions,
  onOpenPt,
  onMyPage, onLogout, onLegacy,
  topInset = 0,
}) {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const today = new Date(todayStr + 'T00:00:00');
  const qKey = getQuarterKey(today);
  const review = useMemo(() => reviewQueueCounts(ptSchedules, qKey, todayStr), [ptSchedules, qKey, todayStr]);
  const unassigned = useMemo(() => unassignedUpcoming(schedules, todayStr).length, [schedules, todayStr]);
  const qMeta = quarterMeta(settlementQuarterKey, today);
  const stl = settlementSummary || { assignees: 0, targetCount: 0, amount: 0, reviewTotal: 0, confirmedCount: 0 };

  const tomorrow = addDays(todayStr, 1);
  const upcoming = useMemo(() => (ptSchedules || [])
    .filter(s => s && (s.date === todayStr || s.date === tomorrow) && (!s.dateType || s.dateType === 'confirmed'))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || ''))), [ptSchedules, todayStr, tomorrow]);

  const queue = [
    { key: 'review', label: '검토필요', n: review.total, sub: review.carry ? `Q${quarterMeta(qKey, today)?.quarter} ${review.cur} + 이전 ${review.carry}` : 'K-APT 미매칭', tone: review.total ? 'warn' : null, onClick: onGoReview },
    { key: 'un', label: '담당 미배정 PT', n: unassigned, sub: '일정에서 배정', tone: unassigned ? 'red' : null, onClick: onGoUnassigned },
    { key: 'exc', label: '예외 승인 대기', n: exceptionCount, sub: '검토', tone: exceptionCount ? 'warn' : null, onClick: onGoExceptions },
  ];
  const toneStyle = t => t === 'red' ? { bg: '#fef2f2', bd: '#fecaca', fg: C.red } : t === 'warn' ? { bg: '#fffbeb', bd: '#fde68a', fg: '#b45309' } : { bg: '#fff', bd: C.line, fg: C.text3 };

  return createPortal(
    <div style={{ position: 'fixed', top: topInset, left: 0, right: 0, bottom: 0, zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.muted, color: C.ink, fontVariantNumeric: 'tabular-nums', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      {/* 고정 헤더 — 날짜 · 제목 · 아바타(마이페이지·이전 화면·로그아웃) */}
      <header style={{ flex: 'none', position: 'relative', padding: 'calc(env(safe-area-inset-top) + 14px) 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, color: C.text3 }}>{today.getMonth() + 1}월 {today.getDate()}일 ({KDAY[today.getDay()]})</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>메인</h1>
        </div>
        <button type="button" aria-label="내 메뉴" aria-expanded={menu} onClick={() => setMenu(o => !o)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', color: C.brand, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{String(me || '나').slice(0, 1)}</button>
        {menu && (
          <>
            <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
            <div role="menu" style={{ position: 'absolute', right: 16, top: 'calc(env(safe-area-inset-top) + 58px)', zIndex: 2, minWidth: 180, padding: 6, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,.16)' }}>
              {[['마이페이지', onMyPage], ['이전 화면으로 보기', onLegacy], ['로그아웃', onLogout]].filter(([, f]) => f).map(([l, f]) => (
                <button key={l} type="button" role="menuitem" onClick={() => { setMenu(false); f(); }} style={{ display: 'block', width: '100%', minHeight: 44, padding: '0 12px', border: 0, borderRadius: 8, background: 'none', textAlign: 'left', fontSize: 14, color: l === '로그아웃' ? C.red : C.ink, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
              ))}
            </div>
          </>
        )}
      </header>

      {/* 스크롤 영역 */}
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 처리할 것 */}
        <section aria-label="처리할 것" style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {queue.map(q => {
            const t = toneStyle(q.tone);
            return (
              <button key={q.key} type="button" onClick={q.onClick} disabled={!q.onClick} style={{ minHeight: 88, padding: '10px 10px', borderRadius: 14, border: `1px solid ${t.bd}`, background: t.bg, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, textAlign: 'left', cursor: q.onClick ? 'pointer' : 'default', fontFamily: 'inherit', color: C.ink, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{q.label}</span>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: q.tone === 'red' ? C.red : C.ink, whiteSpace: 'nowrap' }}>{q.n.toLocaleString('ko-KR')}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2, color: C.text3 }}>건</span></span>
                <span style={{ fontSize: 11.5, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{q.sub}</span>
              </button>
            );
          })}
        </section>

        {/* 오늘·내일 PT */}
        <section aria-label="오늘·내일 PT" style={{ ...card, overflow: 'hidden' }}>
          <div style={cardHead}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>오늘 · 내일 PT</h2>
            <span style={{ fontSize: 12, color: C.text4 }}>{upcoming.length}건</span>
          </div>
          {upcoming.length === 0 ? (
            <div style={{ padding: '16px 14px', fontSize: 13, color: C.text3 }}>오늘·내일 잡힌 PT가 없어요 · 가운데 [+]로 추가할 수 있어요</div>
          ) : upcoming.map(s => {
            const un = isUnassignedPT(s, todayStr);
            return (
              <button key={s.id} type="button" onClick={() => onOpenPt && onOpenPt(s)} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '10px 14px', border: 0, borderBottom: `1px solid ${C.line2}`, background: un ? '#fff7ed' : '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800 }}>{s.date === todayStr ? '오늘' : '내일'}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.text3 }}>{shortTime(s.time) || '시간 미정'}</span>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(s)}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[s.workType, s.address].filter(Boolean).join(' · ') || '—'}</span>
                </span>
                {un
                  ? <span style={{ padding: '6px 10px', borderRadius: 8, background: C.red, color: '#fff', fontSize: 12, fontWeight: 700 }}>배정</span>
                  : <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text2, whiteSpace: 'nowrap' }}>{String(s.ptAssignee || '').split(/[/,]/)[0]}</span>}
              </button>
            );
          })}
        </section>

        {/* 분기정산 — 분기정산 화면과 같은 숫자 */}
        <section aria-label={`Q${qMeta?.quarter || ''} 분기정산`} style={{ flex: 'none', background: C.brand, color: '#fff', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Q{qMeta?.quarter} 분기정산</h2>
            {qMeta?.ddayText && <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 999, background: '#fff', color: C.red, fontSize: 11.5, fontWeight: 700 }}>마감 {qMeta.ddayText}</span>}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>{stl.amount.toLocaleString('ko-KR')}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2, opacity: .85 }}>원</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, fontSize: 12 }}>
            {[['1R 확인', `${stl.confirmedCount} / ${stl.assignees}`], ['정산 대상', `${stl.targetCount}건`], ['검토필요', `${stl.reviewTotal}건`, stl.reviewTotal > 0 ? '#fcd34d' : '#fff']].map(([k, v, c]) => (
              <div key={k} style={{ padding: 8, borderRadius: 10, background: 'rgba(255,255,255,.12)' }}>
                <div style={{ opacity: .8 }}>{k}</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, color: c || '#fff' }}>{v}</div>
              </div>
            ))}
          </div>
          {onGoSettlement && <button type="button" onClick={onGoSettlement} style={{ height: 44, border: 0, borderRadius: 10, background: '#fff', color: C.brand, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>분기정산 열기</button>}
        </section>

        {/* 최근 활동 */}
        <section aria-label="최근 활동" style={{ ...card, overflow: 'hidden' }}>
          <div style={cardHead}><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>최근 활동</h2></div>
          {activity.length === 0
            ? <div style={{ padding: '16px 14px', fontSize: 13, color: C.text3 }}>아직 기록된 활동이 없어요</div>
            : activity.slice(0, 5).map((log, i) => (
              <div key={log.id || i} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: 8, padding: '10px 14px', borderBottom: i < Math.min(activity.length, 5) - 1 ? `1px solid ${C.line2}` : 0, fontSize: 12.5 }}>
                <span style={{ color: C.text3, whiteSpace: 'nowrap' }}>{whenText(log.at || log.timestamp, todayStr)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activityText(log)}</span>
                  {log.by && <span style={{ display: 'block', fontSize: 11.5, color: C.text4 }}>{log.by}</span>}
                </span>
              </div>
            ))}
        </section>
      </main>

      <MobileTabBar tabs={tabs} />
    </div>,
    document.body,
  );
}
