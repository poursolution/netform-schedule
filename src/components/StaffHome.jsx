import React, { useMemo, useState } from 'react';
import AppSidebar from './AppSidebar.jsx';
import { parseAssignees, mmdd, formatWon, quarterMeta, defaultQuarterKey } from '../utils/workbench.js';
import {
  rawResultOf, todoItems, easyStatus, quarterMoney, yearRecord, teamRate,
  upcomingPts, historyPts, prevQuarterKeys, confirmStage,
} from '../utils/staffHome.js';
import { calculateSettlementAmount } from '../utils/settlement.js';

// 담당자(영업사원) 홈 (#3a) — 로그인한 담당자 본인 데이터만.
// 결과 입력·공고문 확인·분기 확인은 기존 흐름(handleResultClick, K-APT 확인 창, quarterConfirmations)을 그대로 쓴다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const RESULTS = ['승', '무', '패', '지원'];
const RESULT_TONE = {
  승: ['#dcfce7', '#15803d', '#86efac'], 무: ['#fef3c7', '#b45309', '#fcd34d'],
  패: ['#fef2f2', '#b91c1c', '#fca5a5'], 지원: ['#dbeafe', C.brand, '#93c5fd'],
};
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12 };
const cardHead = { display: 'flex', alignItems: 'baseline', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${C.line2}` };
const h2 = { margin: 0, fontSize: 15, fontWeight: 800 };
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: bg, color: fg });
const btn = (kind, h = 36) => ({
  height: h, padding: '0 14px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  ...(kind === 'primary' ? { border: 0, background: C.brand, color: '#fff', fontWeight: 700 } : { border: `1px solid ${C.line}`, background: '#fff', color: C.ink }),
});
const won = n => (n || 0).toLocaleString('ko-KR');
// 올해가 아닌 PT는 연도를 붙인다 (오래된 미입력 건이 올해 것처럼 보이지 않게)
const dateText = (date, year) => (String(date || '').slice(0, 4) === String(year) ? mmdd(date) : `${String(date || '').slice(2, 4)}/${mmdd(date)}`);
const subLine = pt => [pt.workType, pt.requester].filter(Boolean).join(' · ');

function ResultButtons({ pt, me, onSetResult }) {
  const cur = rawResultOf(pt, me);
  return (
    <div role="group" aria-label={`${pt.siteName || '현장'} 결과`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
      {RESULTS.map(r => {
        const on = cur === r;
        const [bg, fg, bd] = RESULT_TONE[r];
        return (
          <button key={r} type="button" aria-pressed={on} onClick={() => onSetResult(pt, r, me)}
            style={{ height: 44, borderRadius: 10, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, background: on ? bg : '#fff', color: on ? fg : C.text3, border: `1px solid ${on ? bd : C.line}` }}>{r}</button>
        );
      })}
    </div>
  );
}

export default function StaffHome({
  me, ptSchedules, todayStr, quarterConfirmations, teamNames,
  sidebar, memberOptions, onChangeMe,
  jandiOn, onJandiSettings,
  onSetResult, onUploadNotice, onNoNotice, onOpenPt, onAdd, onAllHistory,
  onConfirm, onUndoConfirm, onRequestFix, onFinalConfirm,
}) {
  const today = new Date(todayStr + 'T00:00:00');
  const [justSaved, setJustSaved] = useState({});   // { ptId: 결과 } — 세션 동안만 "저장됨" 행 유지
  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState('');

  const qKey = defaultQuarterKey(today);
  const qMeta = quarterMeta(qKey, today);
  const year = today.getFullYear();

  const todos = useMemo(() => todoItems(ptSchedules, me, todayStr), [ptSchedules, me, todayStr]);
  const money = useMemo(() => quarterMoney(ptSchedules, me, qKey, today), [ptSchedules, me, qKey, todayStr]);
  const rec = useMemo(() => yearRecord(ptSchedules, me, year), [ptSchedules, me, year]);
  const teamAvg = useMemo(() => teamRate(ptSchedules, teamNames, year), [ptSchedules, teamNames, year]);
  const upcoming = useMemo(() => upcomingPts(ptSchedules, me, todayStr), [ptSchedules, me, todayStr]);
  const history = useMemo(() => historyPts(ptSchedules, me, todayStr), [ptSchedules, me, todayStr]);
  const pastQs = useMemo(() => prevQuarterKeys(qKey, 2).map(k => ({ key: k, meta: quarterMeta(k, today), money: quarterMoney(ptSchedules, me, k, today) })), [ptSchedules, me, qKey, todayStr]);

  const conf = quarterConfirmations?.[qKey]?.[me] || {};
  const stage = confirmStage(conf);
  const openRequests = Object.values(conf.reviewRequests || {}).filter(r => r?.status !== 'resolved').length;

  // 방금 입력해서 할 일에서 빠진 PT — "저장됨" 한 줄로 남긴다
  const savedRows = Object.keys(justSaved).map(id => (ptSchedules || []).find(p => p.id === id)).filter(pt => pt && !todos.some(t => t.pt.id === pt.id && t.kind === 'pending'));
  const reviewTodos = todos.filter(t => t.kind === 'review');

  const setResult = (pt, r) => {
    onSetResult(pt, r, me);
    setJustSaved(s => ({ ...s, [pt.id]: r }));
  };
  const undoSaved = pt => {
    const r = justSaved[pt.id];
    if (r && rawResultOf(pt, me) === r) onSetResult(pt, r, me); // 같은 결과 다시 누르면 해제(기존 로직)
    setJustSaved(s => { const n = { ...s }; delete n[pt.id]; return n; });
  };
  const doneBox = text => <div style={{ padding: '12px 14px', borderRadius: 10, background: '#dcfce7', color: '#15803d', fontSize: 13.5, fontWeight: 700 }}>{text}</div>;
  const pendingCount = todos.filter(t => !t.sent).length;
  const dday = qMeta?.dday ?? null;
  const finalRound = stage === 'final-pending' || stage === 'final-done';
  const payMonth = qMeta?.payrollMonth ? `${+qMeta.payrollMonth.slice(5)}월` : '';

  const sidebarFooter = (
    <div style={{ background: C.muted, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', fontSize: 12, fontWeight: 700, color: C.ink }}>
        {qMeta?.label} 마감<span style={{ marginLeft: 'auto', fontWeight: 800, color: '#b91c1c' }}>{qMeta?.ddayText}</span>
      </div>
      <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>{qMeta?.closingText} · 급여 반영 {payMonth}</div>
      <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>{stage === 'final-done' ? '최종 확정 완료' : stage === 'ok' ? '1차 확인 완료' : stage === 'final-pending' ? '최종 확정 대기' : '분기 확인 전'}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.muted, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
      <AppSidebar {...sidebar} footer={sidebarFooter} nav={(sidebar.nav || []).map(n => n.key === 'home' ? { ...n, badge: pendingCount || null } : n)} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>안녕하세요, {me}님</h1>
          <span style={{ fontSize: 12.5, color: C.text4, whiteSpace: 'nowrap' }}>{today.getMonth() + 1}월 {today.getDate()}일 {KDAY[today.getDay()]}요일</span>
          {memberOptions && onChangeMe && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text3 }}>
              담당자 보기
              <select value={me} onChange={e => onChangeMe(e.target.value)} style={{ height: 30, padding: '0 8px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' }}>
                {memberOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <div style={{ flex: 1 }} />
          {onJandiSettings
            ? <button type="button" onClick={onJandiSettings} style={btn('secondary')}>잔디 알림 {jandiOn ? 'ON' : 'OFF'}</button>
            : <span title="개인 잔디 알림은 관리자 설정에서 연결돼요" style={{ ...btn('secondary'), display: 'inline-flex', alignItems: 'center', cursor: 'default', color: jandiOn ? C.ink : C.text4 }}>잔디 알림 {jandiOn ? 'ON' : 'OFF'}</span>}
          {onAdd && <button type="button" onClick={onAdd} style={{ ...btn('primary'), padding: '0 16px' }}>+ PT 일정 추가</button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, padding: '18px 24px 24px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {/* 1. 지금 할 일 */}
            <section aria-label="지금 할 일" style={{ ...card, overflow: 'hidden' }}>
              <div style={cardHead}>
                <h2 style={h2}>지금 할 일</h2>
                <span style={{ fontSize: 12, color: C.text3 }}>끝난 PT 결과만 눌러주세요 · 나머지는 자동</span>
              </div>
              {savedRows.map(pt => (
                <div key={`saved-${pt.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${C.line2}` }}>
                  <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>✓</span>
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName}</span>
                  <span style={{ fontSize: 12, color: '#15803d' }}>
                    <span style={pill(...RESULT_TONE[justSaved[pt.id]] || ['#f1f5f9', C.text4])}>{justSaved[pt.id]}</span> 저장됨{justSaved[pt.id] === '승' ? ' · K-APT 공고 자동 확인 중' : ''}
                  </span>
                  <button type="button" onClick={() => undoSaved(pt)} style={{ ...btn('secondary'), marginLeft: 'auto' }}>되돌리기</button>
                </div>
              ))}
              {todos.filter(t => t.kind === 'pending').map(({ pt }) => (
                <div key={pt.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.line2}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#b45309' }}>{dateText(pt.date, year)}{pt.time ? ` ${pt.time}` : ''} PT 끝남 · 결과 미입력</div>
                    <button type="button" onClick={() => onOpenPt && onOpenPt(pt)} style={{ display: 'block', maxWidth: '100%', padding: 0, border: 0, background: 'none', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: C.ink, cursor: 'pointer', textAlign: 'left', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName || '(현장명 없음)'}</button>
                    <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>{subLine(pt) || ' '}</div>
                  </div>
                  <ResultButtons pt={pt} me={me} onSetResult={setResult} />
                </div>
              ))}
              {reviewTodos.map(({ pt, result, sent }) => {
                const uploaded = sent;
                return (
                  <div key={`review-${pt.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.line2}`, background: '#fffbeb' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#b45309' }}>{result || rawResultOf(pt, me)} 입력됨 · 공고문 확인 필요</div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName}</div>
                      <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>입찰 공고 사진이나 PDF를 올리면 정산이 자동으로 진행돼요</div>
                    </div>
                    {uploaded ? doneBox('✓ 보냈어요 · 관리자가 확인하면 지급 대기로 바뀌어요') : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <button type="button" onClick={() => onUploadNotice(pt)} style={{ height: 44, borderRadius: 10, border: 0, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>공고문 올리기</button>
                        <button type="button" onClick={() => onNoNotice(pt)} style={{ height: 44, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>공고 없었어요</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {todos.length === 0 && savedRows.length === 0 && (
                <div style={{ padding: 28, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#15803d' }}>할 일을 모두 마쳤어요 👍</div>
              )}
            </section>

            {/* 2. 받을 금액 · 올해 성적 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
              <section aria-label={`${qMeta?.quarter}분기 내가 받을 금액`} style={{ background: C.brand, color: '#fff', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ fontSize: 12.5, opacity: .8 }}>{qMeta?.quarter}분기 내가 받을 금액 (지급 확정 + 대기)</div>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', marginTop: 6, lineHeight: 1.1 }}>{won(money.total)}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 3 }}>원</span></div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12.5, marginTop: 10, flexWrap: 'wrap' }}>
                  <span>지급 확정 <b>{won(money.confirmed)}</b></span>
                  <span>지급 대기 <b>{won(money.waiting)}</b></span>
                  <span>확인 중 <b>{won(money.checking)}</b></span>
                </div>
                <div style={{ fontSize: 11.5, opacity: .7, marginTop: 8 }}>{payMonth} 급여에 반영 · 승 50만 · 무/지원 25만</div>
              </section>
              <section aria-label="올해 내 성적" style={{ ...card, padding: '18px 20px' }}>
                <div style={{ display: 'flex', fontSize: 12.5, color: C.text3 }}>올해 내 성적<span style={{ marginLeft: 'auto' }}>팀 평균 {teamAvg}%</span></div>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', marginTop: 6, lineHeight: 1.1, color: C.brand }}>{rec.rate}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>%</span></div>
                <div role="img" aria-label={`승 ${rec.w}, 무 ${rec.d}, 패 ${rec.l}, 진행 중 ${rec.p}`} style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: C.line2, marginTop: 10 }}>
                  {[[rec.w, '#16a34a'], [rec.d, '#d97706'], [rec.l, '#b91c1c'], [rec.p, C.strong]].map(([n, bg], i) => <div key={i} style={{ width: `${rec.total ? n / rec.total * 100 : 0}%`, background: bg }} />)}
                </div>
                <div style={{ fontSize: 12.5, color: C.text3, marginTop: 8 }}>
                  <b style={{ color: '#15803d' }}>{rec.w}</b> 승 · <b style={{ color: '#b45309' }}>{rec.d}</b> 무 · <b style={{ color: '#b91c1c' }}>{rec.l}</b> 패 · <b style={{ color: C.text4 }}>{rec.p}</b> 진행 중
                </div>
              </section>
            </div>

            {/* 3. 다가오는 PT */}
            <section aria-label="다가오는 PT" style={{ ...card, overflow: 'hidden' }}>
              <div style={cardHead}><h2 style={h2}>다가오는 PT</h2></div>
              {upcoming.length === 0 && <div style={{ padding: 22, textAlign: 'center', fontSize: 13, color: C.text4 }}>예정된 PT가 없어요</div>}
              {upcoming.map(pt => {
                const d = new Date(pt.date + 'T00:00:00');
                const tokens = parseAssignees(pt.ptAssignee);
                const isSupport = tokens[0] !== me;
                const place = pt.address || pt.location || pt.siteName || '';
                return (
                  <div key={pt.id} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '12px 18px', borderBottom: `1px solid ${C.line2}` }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{KDAY[d.getDay()]} {d.getDate()}</div>
                      <div style={{ fontSize: 12, color: C.text3 }}>{pt.time || '시간 미정'}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName}</div>
                      <div style={{ fontSize: 12.5, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[pt.workType, pt.address, pt.requester].filter(Boolean).join(' · ')}
                        {isSupport && <span style={{ color: C.brand }}> · 주담 {tokens[0]}과 함께 (지원)</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {place && <a href={`https://map.kakao.com/link/search/${encodeURIComponent(place)}`} target="_blank" rel="noreferrer" style={{ ...btn('secondary', 34), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>길찾기</a>}
                      {onOpenPt && <button type="button" onClick={() => onOpenPt(pt)} style={btn('secondary', 34)}>상세</button>}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* 4. 내 PT 내역 */}
            <section aria-label="내 PT 내역" style={{ ...card, overflow: 'hidden' }}>
              <div style={cardHead}>
                <h2 style={h2}>내 PT 내역</h2>
                {onAllHistory && <button type="button" onClick={onAllHistory} style={{ marginLeft: 'auto', padding: 0, border: 0, background: 'none', color: C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>전체 보기 →</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 56px 150px 96px', gap: 10, padding: '7px 18px', fontSize: 11, fontWeight: 600, color: C.text4, borderBottom: `1px solid ${C.line2}` }}>
                <span>일자</span><span>현장</span><span>결과</span><span>지금 상태</span><span style={{ textAlign: 'right' }}>금액</span>
              </div>
              {history.map(pt => {
                const r = rawResultOf(pt, me);
                const st = easyStatus(pt, me, todayStr);
                const amt = r ? calculateSettlementAmount(pt, me).amount || 0 : 0;
                const tone = RESULT_TONE[r];
                return (
                  <div key={pt.id} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 56px 150px 96px', gap: 10, alignItems: 'center', padding: '10px 18px', borderBottom: `1px solid ${C.line2}`, fontSize: 13 }}>
                    <span style={{ fontSize: 12, color: C.text3 }}>{dateText(pt.date, year)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: C.text4 }}>{pt.workType || ''}{st.reason ? <span style={{ color: '#b45309' }}>{pt.workType ? ' · ' : ''}{st.reason}</span> : null}</span>
                    </span>
                    <span><span style={tone ? pill(tone[0], tone[1]) : pill('#f1f5f9', C.text4)}>{r || '미입력'}</span></span>
                    <span><span style={pill(st.bg, st.fg)}>{st.label}</span></span>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: amt ? C.ink : C.text4 }}>{formatWon(amt)}</span>
                  </div>
                );
              })}
              {history.length === 0 && <div style={{ padding: 22, textAlign: 'center', fontSize: 13, color: C.text4 }}>아직 PT 내역이 없어요</div>}
            </section>
          </div>

          {/* 우측 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <section aria-label="분기 확인" style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>마감 {dday !== null && dday >= 0 ? `D-${dday}` : '지남'} · {qMeta?.closingText}</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{qMeta?.quarter}분기 정산, {finalRound ? '최종 확정해 주세요' : '이대로 맞나요?'}</div>
              <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
                {finalRound ? '수정 요청이 모두 처리됐어요. 최종 확정하면 분기 보고서가 발송돼요.' : '아래 숫자가 맞으면 확인해 주세요. 다르면 수정 요청을 보내면 돼요.'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
                {[['승', money.w, '#dcfce7', '#15803d'], ['무', money.d, '#fef3c7', '#b45309'], ['지원', money.s, '#dbeafe', C.brand]].map(([l, n, bg, fg]) => (
                  <div key={l} style={{ background: bg, color: fg, borderRadius: 8, padding: '8px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{n}</div>
                    <div style={{ fontSize: 11 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', background: C.muted, borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
                <span style={{ fontSize: 12.5, color: C.text3 }}>지급 예정</span>
                <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800 }}>{won(money.confirmed + money.waiting + money.checking)}원</span>
              </div>
              {openRequests > 0 && <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>보낸 수정 요청 {openRequests}건 · 관리자 확인 중</div>}
              <div style={{ marginTop: 12 }}>
                {fixOpen ? (
                  <div>
                    <textarea aria-label="수정 요청 내용" value={fixText} onChange={e => setFixText(e.target.value)} placeholder="어떤 게 다른지 적어주세요 (예: 10/9 불당지웰 무 → 승)"
                      style={{ width: '100%', height: 72, boxSizing: 'border-box', padding: 10, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <button type="button" disabled={!fixText.trim()} onClick={async () => { if (await onRequestFix(qKey, fixText.trim())) { setFixOpen(false); setFixText(''); } }}
                        style={{ ...btn('primary', 40), flex: 1, borderRadius: 9, fontSize: 13.5, opacity: fixText.trim() ? 1 : .5 }}>관리자에게 보내기</button>
                      <button type="button" onClick={() => { setFixOpen(false); setFixText(''); }} style={{ padding: '0 6px', border: 0, background: 'none', color: C.text4, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                    </div>
                  </div>
                ) : stage === 'final-done' ? (
                  doneBox(`✓ 최종 확정 완료 · ${payMonth} 급여에 반영돼요`)
                ) : stage === 'ok' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>{doneBox(`✓ 확인 완료 · ${payMonth} 급여에 반영돼요`)}</div>
                    <button type="button" onClick={() => onUndoConfirm(qKey)} style={{ padding: 0, border: 0, background: 'none', color: C.text4, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>되돌리기</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" onClick={() => (finalRound ? onFinalConfirm(qKey) : onConfirm(qKey))} style={{ ...btn('primary', 40), borderRadius: 9, fontSize: 13.5 }}>{finalRound ? '최종 확정' : '네, 맞아요'}</button>
                    <button type="button" onClick={() => setFixOpen(true)} style={{ height: 40, borderRadius: 9, border: `1px solid ${C.strong}`, background: '#fff', color: C.ink, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>다른 것 같아요 (수정 요청)</button>
                  </div>
                )}
              </div>
            </section>

            <section aria-label="정산 진행 순서" style={{ ...card, padding: '16px 18px' }}>
              <h2 style={{ ...h2, fontSize: 14 }}>정산은 이렇게 진행돼요</h2>
              {[['1', '끝난 PT 결과를 눌러요'], ['2', 'K-APT 공고로 자동 확인돼요'], ['3', '분기 마감 전에 숫자를 확인해요'], ['₩', `${payMonth} 급여에 반영돼요`]].map(([n, t], i) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12.5, color: C.text2 }}>
                  <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: i === 3 ? '#16a34a' : C.brand, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flex: 'none' }}>{n}</span>{t}
                </div>
              ))}
            </section>

            <section aria-label="지난 분기" style={{ ...card, padding: '16px 18px' }}>
              <h2 style={{ ...h2, fontSize: 14 }}>지난 분기</h2>
              {pastQs.map(q => (
                <div key={q.key} style={{ display: 'flex', fontSize: 12.5, marginTop: 8, color: C.text2 }}>
                  <span>{q.meta?.year} {q.meta?.quarter}분기</span>
                  <span style={{ marginLeft: 'auto' }}><b style={{ color: C.ink }}>{won(q.money.confirmed)}원</b> · {q.money.waiting || q.money.checking ? '정산 중' : '지급 완료'}</span>
                </div>
              ))}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
