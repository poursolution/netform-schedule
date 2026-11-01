import React, { useMemo, useState } from 'react';
import { EXCEPTION_TYPES, exceptionWaitDays, exceptionKey, exceptionSummary, approvedWinAmount } from '../utils/exceptions.js';
import { calculateSettlementAmount } from '../utils/settlement.js';
import EmptyArt from './EmptyArt.jsx';

// PT 결과 예외 승인 큐 (#11a) — 한 번에 한 건만 펼쳐 판단 근거와 함께 처리.
// 승인·거절은 누르는 즉시 onDecide 로 저장·담당자 알림(승인 = 결과 승 계산 + 정산 대상 전환).
// [되돌리기]는 onUndo 로 저장된 값을 처리 전으로 되돌린다(창 열린 동안).

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c', green: '#15803d',
};
const RES = { 승: ['#dcfce7', '#15803d'], 무: ['#fef3c7', '#b45309'], 패: ['#fef2f2', '#b91c1c'], 지원: ['#dbeafe', '#0F4C75'] };
const KIND = { no_bid_to_win: ['#f1f5f9', '#475569'], tie_to_win: ['#dbeafe', '#0F4C75'] };
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' });
const won = n => `${(n || 0).toLocaleString('ko-KR')}원`;

export default function ExceptionQueueModal({ items, ptSchedules, onDecide, onUndo, onClose }) {
  const [list] = useState(items); // 연 시점 목록 고정 — 처리해도 줄로 남아 되돌릴 수 있게
  const [open, setOpen] = useState(() => (items[0] ? exceptionKey(items[0]) : null));
  const [dec, setDec] = useState({});
  const [memo, setMemo] = useState({});
  const [undos, setUndos] = useState({}); // key → 되돌리기 patch(저장 전 값)
  const [busy, setBusy] = useState(null); // 처리 중인 key — 더블 클릭 방지
  const [err, setErr] = useState({});     // key → 저장 실패 메시지(입력값 유지)
  const now = useMemo(() => new Date(), []);

  const ptOf = it => (ptSchedules || []).find(p => p.id === it.scheduleId) || null;
  // 원래 결과 — 승인 뒤에도 "무 → 승"으로 보이게 저장된 값 그대로
  const resultOf = it => { const pt = ptOf(it); return (pt?.results?.[it.assignee]) || pt?.result || null; };
  // 승인 시 정산 증가액 — 승 규칙 그대로(단독 50만 · 여러 명 PT 25만). 처리 후엔 처리 전 금액 기준으로 고정
  const [before] = useState(() => Object.fromEntries(items.map(it => { const pt = (ptSchedules || []).find(p => p.id === it.scheduleId); return [exceptionKey(it), pt ? calculateSettlementAmount(pt, it.assignee).amount : 0]; })));
  const winOf = it => { const pt = ptOf(it); if (!pt) return 0; const sim = { ...pt, exceptionRequests: { ...(pt.exceptionRequests || {}), [it.assignee]: { status: 'pending' } } }; return approvedWinAmount(sim, it.assignee); };
  const deltaOf = it => Math.max(0, winOf(it) - (before[exceptionKey(it)] || 0));
  const evidenceOf = it => Object.values(ptOf(it)?.evidenceFiles || {}).filter(f => !f?.suppressed).length;
  const sum = exceptionSummary(list, dec, deltaOf);

  const decide = async (it, v) => {
    const k = exceptionKey(it);
    if (busy) return;
    setBusy(k); setErr(e => ({ ...e, [k]: '' }));
    try {
      const u = await onDecide(it, v === 'ok' ? 'approved' : 'rejected', (memo[k] || '').trim());
      setUndos(m => ({ ...m, [k]: u }));
      const next = { ...dec, [k]: v };
      setDec(next);
      const nextOpen = list.find(x => !next[exceptionKey(x)]);
      setOpen(nextOpen ? exceptionKey(nextOpen) : null);
    } catch (e) {
      setErr(m => ({ ...m, [k]: `저장하지 못했어요 · ${e.message || '다시 시도해 주세요'}` }));
    } finally { setBusy(null); }
  };
  const undo = async it => {
    const k = exceptionKey(it);
    if (busy) return;
    setBusy(k);
    try {
      await onUndo(it, undos[k]);
      setDec(d => { const n = { ...d }; delete n[k]; return n; });
      setErr(m => ({ ...m, [k]: '' }));
      setOpen(k);
    } catch (e) {
      setErr(m => ({ ...m, [k]: `되돌리지 못했어요 · ${e.message || '다시 시도해 주세요'}` }));
    } finally { setBusy(null); }
  };
  const close = onClose;

  const kindPill = it => { const [bg, fg] = KIND[it.type] || ['#f1f5f9', C.text2]; return <span style={pill(bg, fg)}>{EXCEPTION_TYPES[it.type]?.label || it.type}</span>; };
  const resultPill = r => { const [bg, fg] = RES[r] || ['#f1f5f9', C.text4]; return <span style={pill(bg, fg)}>{r || '미입력'}</span>; };
  const waitText = it => { const d = exceptionWaitDays(it.requestedAt, now); return <span style={{ color: d > 90 ? C.red : C.text3, fontWeight: d > 90 ? 700 : 500 }}>{d}일 대기</span>; };

  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="xq-title" style={{ width: 720, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100vh - 60px)', marginBottom: 20, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '18px 22px 14px', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="xq-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>예외 승인</h2>
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>승인하면 결과가 승으로 정산돼요(단독 500,000원 · 여러 명 PT는 250,000원) · 누르는 즉시 저장되고 담당자에게 잔디로 알려요</div>
          </div>
          <span style={pill('#fef3c7', '#b45309')}>대기 {sum.pending}</span>
          <span style={pill('#dcfce7', C.green)}>승인 {sum.ok}</span>
          <span style={pill('#fef2f2', C.red)}>거절 {sum.no}</span>
          <button type="button" aria-label="닫기" onClick={close} style={{ width: 32, height: 32, marginTop: -4, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.text4, fontSize: 14 }}><EmptyArt kind="done" />대기 중인 예외 신청이 없어요.</div>}
          {list.length > 0 && sum.pending === 0 && (
            <div style={{ padding: '14px 16px', borderRadius: 12, border: '1.5px dashed #86efac', background: '#f0fdf4', fontSize: 13.5, color: C.green, lineHeight: 1.6 }}>
              <b>대기 중인 예외 신청을 모두 처리했어요</b><br />
              승인 {sum.ok}건 → 승 전환 · 정산 반영 {won(sum.amount)}{sum.no ? ` · 거절 ${sum.no}건은 사유와 함께 전달` : ''}
            </div>
          )}

          {list.map(it => {
            const k = exceptionKey(it);
            const d = dec[k];
            const r = resultOf(it);
            if (d === 'ok' || d === 'no') {
              const ok = d === 'ok';
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}` }}>
                  <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: ok ? '#16a34a' : C.red, color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>{ok ? '✓' : '✕'}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.siteName || '단지명 미입력'}</span>
                  <span style={{ fontSize: 12.5, color: err[k] ? C.red : ok ? C.green : C.red, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {err[k] || (ok ? `승인 · 저장됨 · ${r || '미입력'} → 승 · +${won(deltaOf(it))} · ${it.assignee}에게 알림` : `거절 · 저장됨 · ${r || '미입력'} 유지 · 사유 전달됨`)}
                  </span>
                  <button type="button" disabled={!!busy} onClick={() => undo(it)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', fontSize: 12, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', color: C.ink, flex: 'none', opacity: busy === k ? .5 : 1 }}>되돌리기</button>
                </div>
              );
            }
            if (open !== k) {
              return (
                <button key={k} type="button" onClick={() => setOpen(k)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>
                  {kindPill(it)}
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.siteName || '단지명 미입력'}</span>
                  <span style={{ fontSize: 12.5, color: C.text3, flex: 'none' }}>{it.assignee}</span>
                  {resultPill(r)}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12.5, flex: 'none' }}>{waitText(it)}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.brand, flex: 'none' }}>검토 ›</span>
                </button>
              );
            }
            const ev = evidenceOf(it);
            const note = memo[k] || '';
            const pt = ptOf(it);
            return (
              <div key={k} style={{ padding: '16px 18px', borderRadius: 12, border: `1px solid ${C.brand}`, boxShadow: `0 0 0 3px ${C.accent}`, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {kindPill(it)}
                      <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.siteName || '단지명 미입력'}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>{[pt?.workType, it.ptDate && `PT ${it.ptDate}`, pt?.requester].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, textAlign: 'right', flex: 'none' }}>
                    {(it.requestedAt || '').slice(0, 10)} 신청<br />{waitText(it)}
                  </div>
                </div>

                {/* 판단 근거 4칸 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 9, background: C.muted }}>
                  {[
                    ['담당', <b>{it.assignee}</b>],
                    ['현재 결과', <span>{resultPill(r)} <span style={{ color: C.text3 }}>→ 승</span></span>],
                    ['정산 변화', <b style={{ color: C.green }}>+{won(deltaOf(it))}</b>],
                    ['증빙', ev ? <b style={{ color: C.brand }}>첨부 {ev}건</b> : <b style={{ color: C.red }}>첨부 없음</b>],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize: 11.5, color: C.text4 }}>{l}</div>
                      <div style={{ fontSize: 13, marginTop: 3 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* 신청 사유 */}
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.6 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text3, marginBottom: 2 }}>담당자 신청 사유</div>
                  {it.reason ? it.reason : (
                    <>
                      <span style={{ fontStyle: 'italic', color: '#b45309' }}>사유 미입력</span>
                      <div style={{ fontSize: 12, color: C.text3 }}>승인 전 확인하거나 사유 요청으로 거절</div>
                    </>
                  )}
                </div>

                <textarea aria-label="검토 메모" value={note} onChange={e => setMemo(m => ({ ...m, [k]: e.target.value }))} placeholder="거절할 땐 필수 · 승인은 선택"
                  style={{ display: 'block', width: '100%', height: 56, boxSizing: 'border-box', marginTop: 10, padding: 10, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" disabled={!note.trim() || !!busy} onClick={() => decide(it, 'no')} style={{ flex: 1, height: 42, borderRadius: 9, background: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', border: `1px solid ${note.trim() ? '#fecaca' : C.line}`, color: note.trim() ? C.red : C.strong, cursor: note.trim() && !busy ? 'pointer' : 'not-allowed' }}>거절</button>
                  <button type="button" disabled={!!busy} onClick={() => decide(it, 'ok')} style={{ flex: 2, height: 42, borderRadius: 9, border: 0, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy === k ? .6 : 1 }}>승인 → 승으로 변경{deltaOf(it) ? ` · +${won(deltaOf(it))}` : ''}</button>
                </div>
                {err[k] && <div role="alert" style={{ fontSize: 12.5, color: C.red, marginTop: 6 }}>{err[k]}</div>}
                {!note.trim() && !err[k] && <div style={{ fontSize: 11.5, color: C.text4, marginTop: 6 }}>거절 버튼은 검토 메모를 쓰면 활성화돼요</div>}
              </div>
            );
          })}
        </div>

        {/* 푸터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderTop: `1px solid ${C.line2}` }}>
          <span style={{ flex: 1, fontSize: 12, color: C.text4 }}>
            90일 넘은 신청은 빨간색 · 승인·거절은 누르는 즉시 저장 · 승인하면 정산 대상으로 전환(PT 진행일 분기)
          </span>
          <button type="button" onClick={close} style={{ height: 38, padding: '0 18px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>닫기</button>
        </div>
      </div>
    </div>
  );
}
