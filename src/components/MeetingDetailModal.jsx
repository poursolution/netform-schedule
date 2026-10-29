import React, { useState } from 'react';
import { responseOf, responseCounts, displayTitle, dday, agendaItems, joinAgenda, minutesTemplate } from '../utils/meetings.js';

// 회의 상세 (#13a, 680px) — 상단 한 줄 정보 + 편집, 본문 안건 / 참석 응답 / 회의록 3탭.
// 저장은 onSave(회의 전체) — 기존 updateMeetingSchedule. 잔디 발송은 App 콜백.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c', green: '#16a34a',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const STATUS = { 참석: ['#dcfce7', '#15803d'], 불참: ['#fef2f2', '#b91c1c'], 미정: ['#f1f5f9', '#64748b'] };
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' });
const input = { height: 36, boxSizing: 'border-box', padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: C.ink, background: '#fff' };
const btn = kind => ({
  height: 36, padding: '0 14px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  ...(kind === 'primary' ? { border: 0, background: C.brand, color: '#fff', fontWeight: 700 }
    : kind === 'outline' ? { border: `1px solid ${C.brand}`, background: '#fff', color: C.brand, fontWeight: 700 }
    : { border: `1px solid ${C.line}`, background: '#fff', color: C.ink }),
});
const dateText = date => { if (!date) return '날짜 미정'; const d = new Date(date + 'T00:00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${KDAY[d.getDay()]})`; };

export default function MeetingDetailModal({ meeting, todayStr, me, initialTab, onSave, onRespond, onRemind, onShareAgenda, onShareMinutes, onDelete, onClose }) {
  const m = meeting;
  const [tab, setTab] = useState(initialTab || 'agenda');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({});
  const [newItem, setNewItem] = useState('');
  const [minutesMode, setMinutesMode] = useState('write');
  const [draft, setDraft] = useState(() => m.minutes || minutesTemplate(m.agenda));
  const [savedNote, setSavedNote] = useState('');
  const c = responseCounts(m);
  const d = dday(m.date, todayStr);
  const items = agendaItems(m.agenda);
  const statePill = d === null ? null : d < 0 ? <span style={pill('#f1f5f9', C.text3)}>종료</span> : d === 0 ? <span style={pill('#dbeafe', C.brand)}>오늘</span> : <span style={pill('#dbeafe', C.brand)}>예정 · D-{d}</span>;

  const save = patch => onSave({ ...m, ...patch });
  const startEdit = () => { setEdit({ title: m.title || '', date: m.date || '', time: m.time || '', endTime: m.endTime || '', location: m.location || '' }); setEditing(true); };
  const setAgenda = list => save({ agenda: joinAgenda(list) });
  const addItem = () => { const t = newItem.trim(); if (!t) return; setAgenda([...items, t]); setNewItem(''); };
  const saveMinutes = (extra = {}) => { save({ minutes: draft, minutesFileName: null, minutesUpdatedAt: new Date().toISOString(), ...extra }); setSavedNote('저장됨'); };
  const readFile = e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.endsWith('.txt')) { alert('txt 파일만 올릴 수 있어요.'); return; }
    const r = new FileReader();
    r.onload = ev => { const text = String(ev.target.result || ''); setDraft(text); save({ minutes: text, minutesFileName: file.name, minutesUpdatedAt: new Date().toISOString() }); setMinutesMode('write'); setSavedNote(`${file.name} 저장됨`); };
    r.readAsText(file, 'UTF-8');
  };

  return (
    <div role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="md-title" style={{ width: 680, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100vh - 60px)', marginBottom: 20, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        {/* 헤더 */}
        <div style={{ padding: '18px 22px 0', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.text3 }}>
                {statePill}<span>참석 응답 <b style={{ color: C.ink }}>{c.yes}</b> / {c.total}</span>
              </div>
              {editing ? (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <input aria-label="제목" value={edit.title} onChange={e => setEdit(s => ({ ...s, title: e.target.value }))} style={{ ...input, height: 40, fontSize: 16, fontWeight: 700 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1.6fr', gap: 8 }}>
                    <input aria-label="날짜" type="date" value={edit.date} onChange={e => setEdit(s => ({ ...s, date: e.target.value }))} style={input} />
                    <input aria-label="시작" value={edit.time} onChange={e => setEdit(s => ({ ...s, time: e.target.value }))} placeholder="09:00" style={input} />
                    <input aria-label="종료" value={edit.endTime} onChange={e => setEdit(s => ({ ...s, endTime: e.target.value }))} placeholder="10:00" style={input} />
                    <input aria-label="장소" value={edit.location} onChange={e => setEdit(s => ({ ...s, location: e.target.value }))} placeholder="장소" style={input} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setEditing(false)} style={btn()}>취소</button>
                    <button type="button" disabled={!edit.title.trim() || !edit.date} onClick={() => { save({ ...edit, title: edit.title.trim() }); setEditing(false); }} style={btn('primary')}>저장</button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 id="md-title" style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>{displayTitle(m)}</h2>
                  <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
                    {dateText(m.date)}{m.time ? ` ${[m.time, m.endTime].filter(Boolean).join('~')}` : ''}{m.location ? ` · ${m.location}` : ''} ·{' '}
                    <button type="button" onClick={startEdit} style={{ padding: 0, border: 0, background: 'none', color: C.brand, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>편집</button>
                  </div>
                </>
              )}
            </div>
            <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, marginTop: -4, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
          </div>
          <div role="tablist" style={{ display: 'flex', gap: 18, marginTop: 14 }}>
            {[['agenda', `안건 ${items.length}`], ['responses', `참석 응답 ${c.yes}/${c.total}`], ['minutes', m.minutes ? '회의록 ✓' : '회의록']].map(([k, l]) => {
              const on = tab === k;
              return <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)} style={{ padding: '0 0 10px', border: 0, background: 'none', fontSize: 13.5, fontWeight: on ? 700 : 500, color: on ? C.brand : C.text3, boxShadow: on ? `inset 0 -2px 0 ${C.brand}` : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>;
            })}
          </div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 22px' }}>
          {tab === 'agenda' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.length === 0 && <div style={{ fontSize: 13, color: C.text4, padding: '6px 2px' }}>아직 안건이 없어요 · 아래에 한 줄씩 추가해요</div>}
              {items.map((t, i) => (
                <div key={`${i}-${t}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.line}` }}>
                  <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: C.brand, color: '#fff', fontSize: 11.5, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t}</span>
                  <button type="button" aria-label={`${i + 1}번 안건 빼기`} onClick={() => setAgenda(items.filter((_, j) => j !== i))} style={{ border: 0, background: 'none', color: C.text4, cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ))}
              <input aria-label="안건 추가" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addItem(); } }} placeholder="안건 추가 · Enter"
                style={{ ...input, height: 42, border: `1.5px dashed ${C.strong}`, borderRadius: 10, padding: '0 12px' }} />
              {onShareAgenda && items.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button type="button" onClick={() => onShareAgenda(m)} style={btn('outline')}>참석자에게 안건 공유</button>
                </div>
              )}
            </div>
          )}

          {tab === 'responses' && (
            <div>
              <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.line}` }}>
                <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: C.line2 }}>
                  <span style={{ width: `${c.total ? c.yes / c.total * 100 : 0}%`, background: C.green }} />
                  <span style={{ width: `${c.total ? c.no / c.total * 100 : 0}%`, background: C.red }} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12.5, marginTop: 8 }}>
                  <span style={{ color: '#15803d' }}>참석 {c.yes}</span><span style={{ color: C.red }}>불참 {c.no}</span><span style={{ color: C.text3 }}>미응답 {c.pending}</span>
                </div>
              </div>
              <div style={{ marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                {(m.attendees || []).map((name, i) => {
                  const r = responseOf(m, name);
                  const isMe = me && me === name;
                  return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.line2}` : 0 }}>
                      <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: '50%', background: C.accent, color: C.brand, fontSize: 11.5, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>{name.slice(0, 1)}</span>
                      <span style={{ fontSize: 13.5, fontWeight: isMe ? 800 : 600 }}>{name}{isMe ? ' (나)' : ''}</span>
                      <span style={pill(...STATUS[r.status])}>{r.status === '미정' ? '미응답' : r.status}</span>
                      {r.reason && <span style={{ fontSize: 12, color: C.red, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span>}
                      <span style={{ flex: 1 }} />
                      {isMe && onRespond ? (
                        <>
                          <button type="button" aria-pressed={r.status === '참석'} onClick={() => onRespond(name, '참석', '')} style={{ ...btn(), height: 30, ...(r.status === '참석' ? { borderColor: '#86efac', background: '#dcfce7', color: '#15803d', fontWeight: 700 } : {}) }}>참석</button>
                          <button type="button" aria-pressed={r.status === '불참'} onClick={() => { const why = window.prompt('불참 사유를 적어주세요', r.reason); if (why !== null) onRespond(name, '불참', why); }} style={{ ...btn(), height: 30, ...(r.status === '불참' ? { borderColor: '#fecaca', background: '#fef2f2', color: C.red, fontWeight: 700 } : {}) }}>불참</button>
                        </>
                      ) : r.status === '미정' && onRemind ? (
                        <button type="button" onClick={() => onRemind(m, [name])} style={{ padding: 0, border: 0, background: 'none', color: '#b45309', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>리마인드</button>
                      ) : null}
                    </div>
                  );
                })}
                {(m.attendees || []).length === 0 && <div style={{ padding: 16, fontSize: 13, color: C.text4, textAlign: 'center' }}>참석 대상이 없어요</div>}
              </div>
              {c.pending > 0 && onRemind && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" onClick={() => onRemind(m, c.pendingNames)} style={btn('outline')}>미응답 {c.pending}명 잔디 리마인드</button>
                </div>
              )}
            </div>
          )}

          {tab === 'minutes' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div role="group" aria-label="회의록 방식" style={{ display: 'flex', padding: 2, borderRadius: 9, background: C.line2 }}>
                  {[['write', '직접 작성'], ['file', '파일 올리기']].map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={minutesMode === k} onClick={() => setMinutesMode(k)} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: 0, background: minutesMode === k ? '#fff' : 'transparent', color: minutesMode === k ? C.brand : C.text3, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', boxShadow: minutesMode === k ? '0 1px 2px rgba(15,23,42,.08)' : 'none' }}>{l}</button>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: C.text4 }}>안건이 회의록 틀로 복사돼요</span>
              </div>
              {minutesMode === 'write' ? (
                <>
                  <textarea aria-label="회의록" value={draft} onChange={e => { setDraft(e.target.value); setSavedNote(''); }} placeholder={items.length ? items.map((t, i) => `${i + 1}. ${t}`).join('\n') : '회의 내용을 적어요'}
                    style={{ display: 'block', width: '100%', height: 220, boxSizing: 'border-box', marginTop: 10, padding: 12, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <span style={{ flex: 1, fontSize: 12, color: savedNote ? '#15803d' : C.text4 }}>
                      {savedNote || (m.minutesConfirmedAt ? `확정 ${String(m.minutesConfirmedAt).slice(0, 10)} · ${m.minutesConfirmedBy || ''}` : m.minutesUpdatedAt ? `마지막 저장 ${new Date(m.minutesUpdatedAt).toLocaleString('ko-KR')}` : '')}
                    </span>
                    <button type="button" disabled={!draft.trim()} onClick={() => saveMinutes()} style={{ ...btn(), opacity: draft.trim() ? 1 : .5 }}>임시 저장</button>
                    <button type="button" disabled={!draft.trim()} onClick={() => { saveMinutes({ minutesConfirmedAt: new Date().toISOString(), minutesConfirmedBy: me || '' }); onShareMinutes && onShareMinutes({ ...m, minutes: draft }); }} style={{ ...btn('primary'), opacity: draft.trim() ? 1 : .5 }}>회의록 확정 · 참석자 공유</button>
                  </div>
                </>
              ) : (
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, height: 160, marginTop: 10, border: `1.5px dashed ${C.strong}`, borderRadius: 12, fontSize: 13.5, color: C.text3, cursor: 'pointer' }}>
                  📎 txt 회의록 파일 고르기
                  <span style={{ fontSize: 12, color: C.text4 }}>{m.minutesFileName ? `현재: ${m.minutesFileName}` : '올리면 바로 저장돼요'}</span>
                  <input type="file" accept=".txt" onChange={readFile} style={{ display: 'none' }} />
                </label>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px', borderTop: `1px solid ${C.line2}` }}>
          {onDelete && <button type="button" onClick={() => { if (window.confirm('이 회의를 삭제할까요? 되돌릴 수 없어요.')) onDelete(); }} style={{ padding: 0, border: 0, background: 'none', color: C.red, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>회의 삭제</button>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={btn()}>닫기</button>
        </div>
      </div>
    </div>
  );
}
