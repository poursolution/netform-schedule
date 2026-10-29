import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// 날짜 팝오버 (#14a) — 달력 칸에 붙어 "무슨 일정인가요?"를 묻는다.
// PT·현설·영업·세미나·회의·아.스.퀘 → onPickKind(kind) 로 입력 창(#14b 등)을 연다.
// 개인·휴가 → 팝오버 안 간단 폼에서 바로 저장 — onQuickSave({ type, title, assignees, time }) 는 저장된 항목 id 를 돌려준다.

const C = { brand: '#0F4C75', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', text2: '#475569', text3: '#64748b', text4: '#94a3b8' };
const KINDS = [
  { key: 'pt', name: 'PT', dot: '#0F4C75', desc: '담당자 · 공고 공법 · 요청사까지' },
  { key: 'briefing', name: '현설', dot: '#0F4C75' },
  { key: 'sales', name: '영업', dot: '#15803d' },
  { key: 'seminar', name: '세미나', dot: '#b45309' },
  { key: 'meeting', name: '회의', dot: '#475569' },
  { key: 'asq', name: '아.스.퀘', dot: '#475569' },
  { key: 'personal', name: '개인', dot: '#64748b', quick: true },
  { key: 'vacation', name: '휴가', dot: '#b91c1c', quick: true },
];
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const TIMES = Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);
const W = 300;

export function dateTitle(ds) {
  const d = new Date(`${ds}T00:00:00`);
  return Number.isNaN(d.getTime()) ? ds : `${d.getMonth() + 1}월 ${d.getDate()}일 (${KDAY[d.getDay()]})`;
}

export default function DatePopover({ date, anchor, people = [], me, onPickKind, onQuickSave, onUndo, onClose }) {
  const ref = useRef(null);
  const [kind, setKind] = useState(null);       // 개인·휴가 간단 폼일 때만
  const [title, setTitle] = useState('');
  const [who, setWho] = useState(me && people.includes(me) ? [me] : []);
  const [allDay, setAllDay] = useState(true);
  const [time, setTime] = useState('09:00');
  const [saved, setSaved] = useState(null);     // 저장된 id
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState({ left: -9999, top: 0, side: 'right' });

  // 칸 오른쪽에 붙이고, 화면을 넘으면 왼쪽으로. 세로는 화면 안으로 당긴다
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const h = ref.current.offsetHeight;
    const right = anchor.right + 10 + W <= window.innerWidth - 8;
    const left = right ? anchor.right + 10 : Math.max(8, anchor.left - 10 - W);
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8));
    setPos({ left, top, side: right ? 'right' : 'left', arrow: Math.max(14, Math.min(anchor.top - top + 16, h - 26)) });
  }, [anchor, kind, saved]);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onScroll = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; // 칸이 움직이면 위치가 어긋나므로 닫는다
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    // 칸을 누른 그 클릭이 바로 닫지 않도록 다음 틱부터
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  const meta = KINDS.find(k => k.key === kind);
  const pick = k => { if (k.quick) { setKind(k.key); setSaved(null); } else onPickKind(k.key); };
  const back = () => { setKind(null); setSaved(null); };
  const toggle = n => setWho(w => (w.includes(n) ? w.filter(x => x !== n) : [...w, n]));
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await onQuickSave({ type: kind, title: title.trim() || meta.name, assignees: who, time: allDay ? '' : time });
      if (id) setSaved(id);
    } finally { setBusy(false); }
  };
  const undo = async () => { if (saved && onUndo) await onUndo(kind, saved); setSaved(null); };

  const kindBtn = k => ({
    display: 'flex', alignItems: 'center', gap: 10, gridColumn: k.key === 'pt' ? '1 / -1' : undefined,
    height: k.key === 'pt' ? 52 : 44, padding: '0 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: C.ink,
    border: `1px solid ${k.key === 'pt' ? C.brand : C.line}`, background: k.key === 'pt' ? C.active : '#fff',
  });
  const dot = c => ({ width: 10, height: 10, borderRadius: '50%', background: c, flex: 'none' });
  const pill = c => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: c === '#b91c1c' ? '#fef2f2' : C.line2, color: c });
  const whoChip = on => ({ height: 30, padding: '0 11px', borderRadius: 999, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.text2 });

  return (
    <div ref={ref} role="dialog" aria-label={`${dateTitle(date)} 일정 추가`} style={{ position: 'fixed', left: pos.left, top: pos.top, width: W, zIndex: 900, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 16px 40px rgba(15,23,42,.18)', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif', color: C.ink }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: pos.arrow || 22, width: 12, height: 12, background: '#fff', transform: 'rotate(45deg)', ...(pos.side === 'right'
        ? { left: -7, borderLeft: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }
        : { right: -7, borderRight: `1px solid ${C.line}`, borderTop: `1px solid ${C.line}` }) }} />
      {!kind ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 10px' }}>
            <div>
              <div style={{ fontSize: 11.5, color: C.text4 }}>{dateTitle(date)}</div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.01em' }}>무슨 일정인가요?</div>
            </div>
            <button type="button" aria-label="닫기" onClick={onClose} style={{ marginLeft: 'auto', width: 28, height: 28, border: 0, borderRadius: 8, background: C.line2, color: C.text3, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '0 12px 12px' }}>
            {KINDS.map(k => (
              <button key={k.key} type="button" onClick={() => pick(k)} style={kindBtn(k)}>
                <span style={dot(k.dot)} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{k.name}</span>
                  {k.desc && <span style={{ display: 'block', fontSize: 11.5, color: C.text3, marginTop: 1 }}>{k.desc}</span>}
                </span>
              </button>
            ))}
          </div>
          <div style={{ padding: '8px 16px 12px', borderTop: `1px solid ${C.line2}`, fontSize: 11.5, color: C.text4 }}>종류를 고르면 바로 입력 창이 열려요 · Esc 닫기</div>
        </>
      ) : (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={pill(meta.dot)}>{meta.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{dateTitle(date)}</span>
            {!saved && <button type="button" onClick={back} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: C.text4, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>종류 변경</button>}
          </div>
          <input aria-label="제목" autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !saved) save(); }} placeholder={kind === 'vacation' ? '제목 (예: 연차 / 반차)' : '제목 (예: 병원 / 외근)'} disabled={!!saved}
            style={{ height: 40, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 14, fontFamily: 'inherit', color: C.ink }} />
          <div role="group" aria-label="담당자" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {people.map(n => <button key={n} type="button" aria-pressed={who.includes(n)} disabled={!!saved} onClick={() => toggle(n)} style={whoChip(who.includes(n))}>{n}</button>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.text2, cursor: 'pointer' }}>
              <input type="checkbox" checked={allDay} disabled={!!saved} onChange={e => setAllDay(e.target.checked)} style={{ width: 16, height: 16, margin: 0 }} />종일
            </label>
            {!allDay && (
              <select aria-label="시작 시간" value={time} disabled={!!saved} onChange={e => setTime(e.target.value)} style={{ height: 32, padding: '0 8px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
                {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>
          {saved ? (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 12px', borderRadius: 10, background: '#dcfce7', color: '#15803d', fontSize: 13, fontWeight: 700 }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center' }}>✓</span>
              저장됨 · 달력에 표시
              <button type="button" onClick={undo} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#15803d', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>되돌리기</button>
            </div>
          ) : (
            <button type="button" onClick={save} disabled={busy} style={{ height: 42, border: 0, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{busy ? '저장 중…' : '저장'}</button>
          )}
          {!saved && <div style={{ fontSize: 11.5, color: C.text4 }}>
            자세한 입력이 필요하면 <button type="button" onClick={() => onPickKind(kind)} style={{ padding: 0, border: 0, background: 'none', color: C.brand, fontWeight: 600, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>전체 입력 창 열기</button>
          </div>}
        </div>
      )}
    </div>
  );
}
