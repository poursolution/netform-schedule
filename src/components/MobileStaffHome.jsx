import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseAssignees, quarterMeta, defaultQuarterKey } from '../utils/workbench.js';
import { rawResultOf, todoItems, quarterMoney, upcomingPts, confirmStage } from '../utils/staffHome.js';

// 담당자 홈 모바일 (#5a) — [고정 헤더] + [스크롤] + [고정 하단 탭].
// 결과 입력·공고문·분기 확인은 데스크톱 담당자 홈(#3a)과 같은 콜백을 쓴다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const RESULTS = ['승', '무', '패', '지원'];
const TONE = { 승: ['#dcfce7', '#15803d', '#86efac'], 무: ['#fef3c7', '#b45309', '#fcd34d'], 패: ['#fef2f2', '#b91c1c', '#fca5a5'], 지원: ['#dbeafe', C.brand, '#93c5fd'] };
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14 };
const won = n => (n || 0).toLocaleString('ko-KR');
const sectionHead = { display: 'flex', alignItems: 'center', gap: 6, margin: '0 2px 8px' };

function dayLabel(date, todayStr) {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  const t = new Date(todayStr + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  // 일주일 안은 요일, 그보다 멀면 날짜 (올해가 아니면 연도까지)
  if (Math.abs(diff) <= 6) return `${KDAY[d.getDay()]} ${d.getDate()}`;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === t.getFullYear() ? md : `${String(d.getFullYear()).slice(2)}/${md}`;
}

function TabIcon({ name, active }) {
  const s = { width: 22, height: 22, fill: 'none', stroke: active ? C.brand : C.text4, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'home') return <svg viewBox="0 0 24 24" style={s}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>;
  if (name === 'calendar') return <svg viewBox="0 0 24 24" style={s}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
  if (name === 'won') return <svg viewBox="0 0 24 24" style={s}><path d="M4 7l3 10 3-8 2 0 3 8 3-10" /><path d="M3 11h18" /></svg>;
  return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
}

export default function MobileStaffHome({
  me, ptSchedules, todayStr, quarterConfirmations,
  onSetResult, onUploadNotice, onNoNotice, onOpenPt, onAdd,
  onConfirm, onUndoConfirm, onRequestFix, onFinalConfirm,
  onGoSchedule, onGoSettlement, onGoMe,
}) {
  const today = new Date(todayStr + 'T00:00:00');
  const [justSaved, setJustSaved] = useState({});
  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState('');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  // 열려 있는 동안 뒤 페이지 스크롤 잠금 — 가운데 영역만 스크롤
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const minuteKey = `${now.getHours()}:${now.getMinutes()}`;

  const qKey = defaultQuarterKey(today);
  const qMeta = quarterMeta(qKey, today);
  const todos = useMemo(() => todoItems(ptSchedules, me, todayStr, now), [ptSchedules, me, todayStr, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = useMemo(() => quarterMoney(ptSchedules, me, qKey, today), [ptSchedules, me, qKey, todayStr]);
  const upcoming = useMemo(() => upcomingPts(ptSchedules, me, todayStr), [ptSchedules, me, todayStr]);
  const conf = quarterConfirmations?.[qKey]?.[me] || {};
  const stage = confirmStage(conf);
  const finalRound = stage === 'final-pending' || stage === 'final-done';
  const payMonth = qMeta?.payrollMonth ? `${+qMeta.payrollMonth.slice(5)}월` : '';

  const pending = todos.filter(t => t.kind === 'pending');
  const reviews = todos.filter(t => t.kind === 'review');
  const savedRows = Object.keys(justSaved).map(id => (ptSchedules || []).find(p => p.id === id)).filter(pt => pt && !pending.some(t => t.pt.id === pt.id));
  const openCount = todos.filter(t => !t.sent).length;

  const setResult = (pt, r) => { onSetResult(pt, r, me); setJustSaved(s => ({ ...s, [pt.id]: r })); };
  const undo = pt => {
    const r = justSaved[pt.id];
    if (r && rawResultOf(pt, me) === r) onSetResult(pt, r, me);
    setJustSaved(s => { const n = { ...s }; delete n[pt.id]; return n; });
  };
  const doneBox = text => <div style={{ padding: '12px 14px', borderRadius: 12, background: '#dcfce7', color: '#15803d', fontSize: 13.5, fontWeight: 700 }}>{text}</div>;
  const bigBtn = (primary) => ({ height: 48, borderRadius: 12, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700, ...(primary ? { border: 0, background: C.brand, color: '#fff' } : { border: `1px solid ${C.strong}`, background: '#fff', color: C.ink }) });

  const tabs = [
    { key: 'home', label: '홈', icon: 'home', active: true, badge: openCount, onClick: () => {} },
    { key: 'schedule', label: '일정', icon: 'calendar', onClick: onGoSchedule },
    { key: 'add', primary: true, label: '일정추가', onClick: onAdd },
    { key: 'settle', label: '정산', icon: 'won', onClick: onGoSettlement },
    { key: 'me', label: '내정보', icon: 'me', onClick: onGoMe },
  ];

  // body 에 직접 그린다 — 기존 모바일 화면 컨테이너 안이면 position:fixed 가 화면에 고정되지 않음
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.muted, color: C.ink, fontVariantNumeric: 'tabular-nums', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      {/* 고정 헤더 */}
      <header style={{ flex: 'none', padding: 'calc(env(safe-area-inset-top) + 14px) 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: C.text4 }}>{today.getMonth() + 1}월 {today.getDate()}일 {KDAY[today.getDay()]}요일</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>안녕하세요, {me}님</h1>
        </div>
        <button type="button" onClick={onGoMe} aria-label="내정보" style={{ width: 40, height: 40, borderRadius: '50%', border: 0, background: C.accent, color: C.brand, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' }}>{(me || '?').slice(0, 1)}</button>
      </header>

      {/* 스크롤 */}
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 1. 지금 할 일 */}
        <section aria-label="지금 할 일">
          <div style={sectionHead}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>지금 할 일</h2>
            {openCount > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#b91c1c', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>{openCount}</span>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.text3 }}>끝난 PT 결과만</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {savedRows.map(pt => (
              <div key={`s-${pt.id}`} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>✓</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName}</div>
                  <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>{justSaved[pt.id]} 저장됨{justSaved[pt.id] === '승' ? ' · K-APT 공고 자동 확인 중' : ''}</div>
                </div>
                <button type="button" onClick={() => undo(pt)} style={{ height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>되돌리기</button>
              </div>
            ))}
            {pending.map(({ pt }) => (
              <div key={pt.id} style={{ ...card, padding: '14px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#b45309' }}>{dayLabel(pt.date, todayStr)}{pt.time ? ` ${pt.time}` : ''} PT 끝남 · 결과를 눌러주세요</div>
                <button type="button" onClick={() => onOpenPt && onOpenPt(pt)} style={{ display: 'block', maxWidth: '100%', padding: 0, border: 0, background: 'none', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: C.ink, textAlign: 'left', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{pt.siteName || '(현장명 없음)'}</button>
                <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>{[pt.workType, pt.requester].filter(Boolean).join(' · ') || ' '}</div>
                <div role="group" aria-label="결과" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
                  {RESULTS.map(r => (
                    <button key={r} type="button" onClick={() => setResult(pt, r)} style={{ height: 44, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.text3, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>{r}</button>
                  ))}
                </div>
              </div>
            ))}
            {reviews.map(({ pt, result, sent }) => (
              <div key={`r-${pt.id}`} style={{ ...card, padding: '14px', background: '#fffbeb', borderColor: '#fde68a' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#b45309' }}>{result} 입력됨 · 공고문 확인 필요</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName}</div>
                <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>입찰 공고 사진이나 PDF를 올리면 정산이 자동으로 진행돼요</div>
                <div style={{ marginTop: 12 }}>
                  {sent ? doneBox('✓ 보냈어요 · 관리자가 확인하면 지급 대기로 바뀌어요') : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button type="button" onClick={() => onUploadNotice(pt)} style={bigBtn(true)}>📷 공고문 올리기</button>
                      <button type="button" onClick={() => onNoNotice(pt)} style={bigBtn(false)}>공고 없었어요</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {todos.length === 0 && savedRows.length === 0 && (
              <div style={{ ...card, padding: 24, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#15803d' }}>할 일을 모두 마쳤어요 👍</div>
            )}
          </div>
        </section>

        {/* 2. 다가오는 PT */}
        <section aria-label="다가오는 PT">
          <div style={sectionHead}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>다가오는 PT</h2>
            <button type="button" onClick={onGoSchedule} style={{ marginLeft: 'auto', padding: 0, border: 0, background: 'none', color: C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>일정 보기 →</button>
          </div>
          <div style={{ ...card, overflow: 'hidden' }}>
            {upcoming.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: C.text4 }}>예정된 PT가 없어요</div>}
            {upcoming.map((pt, i) => {
              const tokens = parseAssignees(pt.ptAssignee);
              const place = pt.address || pt.siteName || '';
              return (
                <div key={pt.id} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '12px 14px', borderTop: i ? `1px solid ${C.line2}` : 0 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>{dayLabel(pt.date, todayStr)}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>{pt.time || '미정'}</div>
                  </div>
                  <button type="button" onClick={() => onOpenPt && onOpenPt(pt)} style={{ minWidth: 0, padding: 0, border: 0, background: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName}</div>
                    <div style={{ fontSize: 12.5, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[pt.workType, pt.address].filter(Boolean).join(' · ')}
                      {tokens[0] !== me && <span style={{ color: C.brand }}> · 주담 {tokens[0]}과 함께 (지원)</span>}
                    </div>
                  </button>
                  {place && <a href={`https://map.kakao.com/link/search/${encodeURIComponent(place)}`} target="_blank" rel="noreferrer" style={{ height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.line}`, display: 'inline-flex', alignItems: 'center', fontSize: 13, color: C.ink, textDecoration: 'none', background: '#fff' }}>길찾기</a>}
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. 받을 금액 */}
        <section aria-label="받을 금액" style={{ background: C.brand, color: '#fff', borderRadius: 14, padding: '16px 16px 14px' }}>
          <div style={{ display: 'flex', fontSize: 12.5 }}>
            <span style={{ opacity: .8 }}>{qMeta?.quarter}분기 받을 금액 (확정 + 대기)</span>
            <button type="button" onClick={onGoSettlement} style={{ marginLeft: 'auto', padding: 0, border: 0, background: 'none', color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>내역 →</button>
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', marginTop: 4 }}>{won(money.total)}<span style={{ fontSize: 15, fontWeight: 600, marginLeft: 2 }}>원</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
            {[['지급 확정', money.confirmed], ['지급 대기', money.waiting], ['확인 중', money.checking]].map(([l, v]) => (
              <div key={l} style={{ background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, opacity: .8 }}>{l}</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{won(v)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. 분기 확인 */}
        <section aria-label="분기 확인" style={{ ...card, borderColor: '#fde68a', padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>마감 {qMeta?.ddayText} · {qMeta?.closingText}</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{qMeta?.quarter}분기 정산, {finalRound ? '최종 확정해 주세요' : '이대로 맞나요?'}</div>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, color: C.text2, marginTop: 8 }}>
            <span>승 <b style={{ color: '#15803d' }}>{money.w}</b></span><span>무 <b style={{ color: '#b45309' }}>{money.d}</b></span><span>지원 <b style={{ color: C.brand }}>{money.s}</b></span>
            <span style={{ marginLeft: 'auto' }}>지급 예정 <b style={{ color: C.ink }}>{won(money.confirmed + money.waiting + money.checking)}원</b></span>
          </div>
          <div style={{ marginTop: 12 }}>
            {fixOpen ? (
              <div>
                <textarea aria-label="수정 요청 내용" value={fixText} onChange={e => setFixText(e.target.value)} placeholder="어떤 게 다른지 적어주세요 (예: 10/9 불당지웰 무 → 승)" style={{ width: '100%', height: 80, boxSizing: 'border-box', padding: 10, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, fontFamily: 'inherit' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => { setFixOpen(false); setFixText(''); }} style={bigBtn(false)}>취소</button>
                  <button type="button" disabled={!fixText.trim()} onClick={async () => { if (await onRequestFix(qKey, fixText.trim())) { setFixOpen(false); setFixText(''); } }} style={{ ...bigBtn(true), opacity: fixText.trim() ? 1 : .5 }}>관리자에게 보내기</button>
                </div>
              </div>
            ) : stage === 'final-done' ? doneBox(`✓ 최종 확정 완료 · ${payMonth} 급여에 반영돼요`)
              : stage === 'ok' ? (
                <div style={{ padding: '12px 14px', borderRadius: 12, background: '#dcfce7', color: '#15803d', fontSize: 13.5, fontWeight: 700 }}>
                  ✓ 확인 완료 · {payMonth} 급여에 반영돼요
                  <button type="button" onClick={() => onUndoConfirm(qKey)} style={{ display: 'block', marginTop: 4, padding: 0, border: 0, background: 'none', color: '#15803d', fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>되돌리기</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button type="button" onClick={() => (finalRound ? onFinalConfirm(qKey) : onConfirm(qKey))} style={bigBtn(true)}>{finalRound ? '최종 확정' : '네, 맞아요'}</button>
                  <button type="button" onClick={() => setFixOpen(true)} style={bigBtn(false)}>다른 것 같아요</button>
                </div>
              )}
          </div>
        </section>
      </main>

      {/* 고정 하단 탭 */}
      <nav aria-label="하단 메뉴" style={{ flex: 'none', height: 'calc(64px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)', boxSizing: 'border-box', background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: `1px solid ${C.line}`, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'start' }}>
        {tabs.map(t => t.primary ? (
          <button key={t.key} type="button" onClick={t.onClick} aria-label="일정 추가" style={{ border: 0, background: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', fontFamily: 'inherit', color: C.text2, fontSize: 10.5, fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: 54, height: 54, marginTop: -22, borderRadius: '50%', background: C.brand, color: '#fff', fontSize: 28, display: 'grid', placeItems: 'center', boxShadow: '0 10px 22px rgba(15,76,117,.34)' }}>+</span>
            {t.label}
          </button>
        ) : (
          <button key={t.key} type="button" onClick={t.onClick} aria-current={t.active ? 'page' : undefined} style={{ position: 'relative', border: 0, background: 'none', padding: '10px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', fontFamily: 'inherit', color: t.active ? C.brand : C.text4, fontSize: 10.5, fontWeight: 600 }}>
            <TabIcon name={t.icon} active={t.active} />
            {t.label}
            {t.badge ? <span style={{ position: 'absolute', top: 6, left: 'calc(50% + 6px)', minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 999, background: '#b91c1c', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{t.badge}</span> : null}
          </button>
        ))}
      </nav>
    </div>,
    document.body,
  );
}
