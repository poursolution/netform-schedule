import React, { useMemo, useState } from 'react';
import AppSidebar from './AppSidebar.jsx';
import { responseCounts, displayTitle, dday, meetingState, nextMeeting, agendaItems } from '../utils/meetings.js';

// 영업회의 (#12d) — 다음 회의 크게(안건·응답 막대·리마인드) + 회의 표. 저장·발송은 App 콜백.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c', green: '#16a34a', amber: '#b45309',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' });
const btn = kind => ({
  height: 34, padding: '0 14px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  ...(kind === 'primary' ? { border: 0, background: C.brand, color: '#fff', fontWeight: 700 }
    : kind === 'outline' ? { border: `1px solid ${C.brand}`, background: '#fff', color: C.brand, fontWeight: 700 }
    : { border: `1px solid ${C.line}`, background: '#fff', color: C.ink }),
});
const dayText = date => { if (!date) return ''; const d = new Date(date + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()} (${KDAY[d.getDay()]})`; };
const timeText = m => [m.time, m.endTime].filter(Boolean).join('~');

function Bar({ c, h = 10 }) {
  const w = v => `${c.total ? v / c.total * 100 : 0}%`;
  return (
    <div aria-hidden="true" style={{ display: 'flex', height: h, borderRadius: 999, overflow: 'hidden', background: C.line2 }}>
      <span style={{ width: w(c.yes), background: C.green }} />
      <span style={{ width: w(c.no), background: C.red }} />
    </div>
  );
}

export default function MeetingsPage({ meetings, todayStr, sidebar, onNew, onOpen, onRemind }) {
  const [filter, setFilter] = useState('all');
  const next = useMemo(() => nextMeeting(meetings, todayStr), [meetings, todayStr]);
  const rows = useMemo(() => [...(meetings || [])].filter(m => m?.date)
    .filter(m => filter === 'all' || meetingState(m, todayStr) === (filter === 'upcoming' ? 'upcoming' : 'done'))
    .sort((a, b) => b.date.localeCompare(a.date)), [meetings, filter, todayStr]);
  const counts = { all: (meetings || []).length, upcoming: (meetings || []).filter(m => meetingState(m, todayStr) === 'upcoming').length };
  counts.done = counts.all - counts.upcoming;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.muted, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
      <AppSidebar {...sidebar} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 60, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>영업회의</h1>
          <span style={{ fontSize: 12.5, color: C.text3 }}>매월 첫 금요일 09:00 · 본사 2층</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onNew} style={btn('primary')}>+ 새 회의</button>
        </div>

        <div style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 다음 회의 */}
          {next ? (() => {
            const c = responseCounts(next);
            const d = dday(next.date, todayStr);
            const items = agendaItems(next.agenda);
            return (
              <section aria-label="다음 회의" style={{ background: '#fff', border: `1px solid ${C.accent}`, borderRadius: 14, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px' }}>
                <div style={{ padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.text3 }}>
                    <span style={pill('#dbeafe', C.brand)}>다음 회의 · {d === 0 ? '오늘' : `D-${d}`}</span>
                    <span>{dayText(next.date)} {timeText(next)}{next.location ? ` · ${next.location}` : ''}</span>
                  </div>
                  <h2 style={{ margin: '10px 0 0', fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>{displayTitle(next)}</h2>
                  <div style={{ fontSize: 13, color: items.length ? C.text2 : C.text4, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {items.length ? `안건 ${items.length}개 · ${items.join(' · ')}` : '아직 안건이 없어요'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => onOpen(next, 'agenda')} style={btn()}>안건 편집</button>
                    <button type="button" onClick={() => onOpen(next, 'minutes')} style={btn()}>회의록 열기</button>
                    {c.pending > 0 && onRemind && <button type="button" onClick={() => onRemind(next, c.pendingNames)} style={btn('outline')}>미응답 {c.pending}명 리마인드</button>}
                  </div>
                </div>
                <div style={{ padding: '18px 20px', borderLeft: `1px solid ${C.line2}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12.5, color: C.text3 }}>참석 응답</span>
                    <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800 }}>{c.yes}<span style={{ fontSize: 13, color: C.text4, fontWeight: 600 }}> / {c.total}</span></span>
                  </div>
                  <div style={{ marginTop: 8 }}><Bar c={c} /></div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: C.text3, marginTop: 6 }}>
                    <span style={{ color: '#15803d' }}>참석 {c.yes}</span><span style={{ color: C.red }}>불참 {c.no}</span><span>미응답 {c.pending}</span>
                  </div>
                  {c.pendingNames.length > 0 && <div style={{ fontSize: 12, color: C.text3, marginTop: 8, lineHeight: 1.5 }}>미응답 · {c.pendingNames.join(', ')}</div>}
                </div>
              </section>
            );
          })() : (
            <section style={{ padding: '22px', borderRadius: 14, border: `1.5px dashed ${C.strong}`, textAlign: 'center', fontSize: 13.5, color: C.text3, lineHeight: 1.6 }}>
              예정된 회의가 없어요<br />
              <span style={{ fontSize: 12, color: C.text4 }}>[+ 새 회의]로 날짜를 고르면 제목·시간·장소·참석자가 기본으로 채워지고, 등록하면 참석자에게 잔디로 초대가 가요</span>
            </section>
          )}

          {/* 회의 표 */}
          <section aria-label="회의 목록" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px', borderBottom: `1px solid ${C.line2}` }}>
              <h2 style={{ margin: '0 8px 0 0', fontSize: 14, fontWeight: 700 }}>회의</h2>
              {[['all', '전체'], ['upcoming', '예정'], ['done', '종료']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} style={{ height: 28, padding: '0 10px', borderRadius: 8, border: `1px solid ${filter === k ? C.brand : C.line}`, background: filter === k ? C.brand : '#fff', color: filter === k ? '#fff' : C.text2, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{l} {counts[k]}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '88px minmax(140px, 1fr) 170px 92px', gap: 14, padding: '8px 18px', background: C.muted, fontSize: 11.5, fontWeight: 600, color: C.text4 }}>
              <span>일시</span><span>회의</span><span>참석</span><span>회의록</span>
            </div>
            {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: C.text4 }}>회의가 없어요</div>}
            {rows.map(m => {
              const c = responseCounts(m);
              const st = meetingState(m, todayStr);
              const isToday = m.date === todayStr;
              const items = agendaItems(m.agenda);
              return (
                <div key={m.id} role="button" tabIndex={0} onClick={() => onOpen(m)} onKeyDown={e => { if (e.key === 'Enter') onOpen(m); }}
                  style={{ display: 'grid', gridTemplateColumns: '88px minmax(140px, 1fr) 170px 92px', gap: 14, alignItems: 'center', padding: '12px 18px', borderTop: `1px solid ${C.line2}`, background: isToday ? C.active : '#fff', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{dayText(m.date)}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>{timeText(m) || '—'}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayTitle(m)}</span>
                      {isToday ? <span style={pill('#dbeafe', C.brand)}>오늘</span> : st === 'upcoming' ? <span style={pill('#dbeafe', C.brand)}>예정</span> : <span style={pill('#f1f5f9', C.text3)}>종료</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[items.length ? `안건 ${items.length}개` : '', m.location].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <div>
                    <Bar c={c} h={8} />
                    <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: C.text3, marginTop: 4 }}>
                      <span style={{ color: '#15803d' }}>{c.yes}</span><span style={{ color: C.red }}>{c.no}</span><span>{c.pending}</span>
                      {st === 'upcoming' && c.pending > 0 && onRemind && (
                        <button type="button" onClick={e => { e.stopPropagation(); onRemind(m, c.pendingNames); }} style={{ marginLeft: 'auto', padding: 0, border: 0, background: 'none', color: C.amber, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>미응답 리마인드</button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5 }}>
                    {m.minutes ? <button type="button" onClick={e => { e.stopPropagation(); onOpen(m, 'minutes'); }} style={{ padding: 0, border: 0, background: 'none', color: C.brand, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>보기</button>
                      : st === 'done' ? <span style={{ color: C.amber, fontWeight: 600 }}>회의록 없음</span> : <span style={{ color: C.text4 }}>—</span>}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </main>
    </div>
  );
}
