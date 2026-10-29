import React, { useState } from 'react';
import { defaultMeetingTitle } from '../utils/meetings.js';

// 새 회의 (#13b, 520px) — 날짜를 고르면 제목("{월}월 영업회의")·시간·장소·참석자(전원)가 기본으로 채워진다.
// 등록은 onCreate({ title, date, time, endTime, location, attendees }, invite) — 기존 addMeetingSchedule + (선택) 잔디 초대.

const C = {
  brand: '#0F4C75', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c',
};
const DEFAULT_PLACE = '본사 2층 회의실';
const input = { display: 'block', width: '100%', height: 42, boxSizing: 'border-box', marginTop: 6, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 14, fontFamily: 'inherit', color: C.ink, background: '#fff' };
const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: C.text2 };

export default function NewMeetingModal({ people, initialDate, onCreate, onClose }) {
  const [date, setDate] = useState(initialDate || '');
  const [time, setTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [title, setTitle] = useState(defaultMeetingTitle(initialDate));
  const [titleTouched, setTitleTouched] = useState(false);
  const [location, setLocation] = useState(DEFAULT_PLACE);
  const [att, setAtt] = useState(people || []);
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const all = (people || []).length > 0 && (people || []).every(p => att.includes(p));
  const ok = date && title.trim() && !busy;

  const pickDate = v => { setDate(v); if (!titleTouched) setTitle(defaultMeetingTitle(v)); };
  const toggle = name => setAtt(a => (a.includes(name) ? a.filter(x => x !== name) : [...a, name]));
  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const r = await onCreate({ title: title.trim(), date, time, endTime, location: location.trim(), attendees: att }, invite);
      if (r !== false) setDone(r || {});
    } finally { setBusy(false); }
  };

  return (
    <div role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nm-title" style={{ width: 520, maxWidth: 'calc(100% - 32px)', marginBottom: 20, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', color: C.ink }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', padding: '18px 22px 14px', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ flex: 1 }}>
            <h2 id="nm-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>새 회의</h2>
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>날짜를 고르면 나머지는 기본으로 채워져요</div>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, marginTop: -4, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
        </div>

        {done ? (
          <div style={{ padding: '22px' }}>
            <div style={{ padding: '14px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 14, fontWeight: 700 }}>
              ✓ 등록됨{done.invited ? ` · 초대 ${done.invited}명 발송` : ''}{done.noHook && done.noHook.length ? ` · 잔디 미연결 ${done.noHook.length}명` : ''}
            </div>
            {done.noHook && done.noHook.length > 0 && <div style={{ fontSize: 12, color: C.text3, marginTop: 8 }}>잔디 개인 웹훅이 없어 초대를 못 보낸 분: {done.noHook.join(', ')}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={onClose} style={{ height: 40, padding: '0 18px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>닫기</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 22px', display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 8 }}>
                <label style={label}>날짜<input type="date" value={date} onChange={e => pickDate(e.target.value)} style={input} /></label>
                <label style={label}>시작<input value={time} onChange={e => setTime(e.target.value)} placeholder="09:00" style={input} /></label>
                <label style={label}>종료<input value={endTime} onChange={e => setEndTime(e.target.value)} placeholder="10:00" style={input} /></label>
              </div>
              <label style={label}>제목<input value={title} onChange={e => { setTitle(e.target.value); setTitleTouched(true); }} placeholder="날짜를 고르면 '12월 영업회의'처럼 채워져요" style={{ ...input, fontWeight: 600 }} /></label>
              <label style={label}>장소<input value={location} onChange={e => setLocation(e.target.value)} style={input} /></label>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={label}>참석 대상</span>
                  <span style={{ fontSize: 12, color: C.text3 }}>{att.length}명</span>
                  <button type="button" aria-pressed={all} onClick={() => setAtt(all ? [] : [...people])} style={{ marginLeft: 'auto', height: 28, padding: '0 10px', borderRadius: 8, border: `1px solid ${all ? C.brand : C.line}`, background: all ? C.active : '#fff', color: all ? C.brand : C.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{all ? '✓ 전원' : '전원'}</button>
                </div>
                <div role="group" aria-label="참석 대상" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {(people || []).map(name => {
                    const on = att.includes(name);
                    return <button key={name} type="button" aria-pressed={on} onClick={() => toggle(name)} style={{ height: 34, padding: '0 14px', borderRadius: 999, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.text2 }}>{name}</button>;
                  })}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text2, cursor: 'pointer' }}>
                <input type="checkbox" checked={invite} onChange={e => setInvite(e.target.checked)} />등록하면 참석자에게 잔디로 초대 + 참석 여부 묻기
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderTop: `1px solid ${C.line2}` }}>
              <span style={{ flex: 1, fontSize: 12.5, color: C.text3 }}>{date ? `${date} ${time || ''} · ${att.length}명` : '날짜를 골라주세요'}</span>
              <button type="button" onClick={onClose} style={{ height: 40, padding: '0 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>취소</button>
              <button type="button" disabled={!ok} onClick={submit} style={{ height: 40, padding: '0 20px', borderRadius: 8, border: 0, background: ok ? C.brand : '#cbd5e1', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: ok ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>{busy ? '등록 중…' : '등록'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
