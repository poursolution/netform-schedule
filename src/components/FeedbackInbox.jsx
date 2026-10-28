import React, { useState } from 'react';
import { feedbackStatus, feedbackScreen, feedbackDevice, feedbackCounts } from '../utils/feedback.js';

// 파일럿 피드백 받은편지함 (#12a, 관리자) — 상태 탭 + 한 건 펼침 + 답장.
// 상태 변경·답장은 onUpdate(id, patch, reply) — App 이 feedback/{id} 저장 + 답장은 보낸 사람 잔디 DM.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c', green: '#15803d',
};
const KIND = { 버그: ['#fef2f2', '#b91c1c'], 제안: ['#dbeafe', '#0F4C75'], 헷갈려요: ['#fef3c7', '#b45309'] };
const STATUS = { new: ['새로 들어옴', '#fef3c7', '#b45309'], doing: ['처리 중', '#dbeafe', '#0F4C75'], done: ['완료', '#dcfce7', '#15803d'] };
const TABS = [['new', '새로 들어옴'], ['doing', '처리 중'], ['done', '완료'], ['all', '전체']];
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flex: 'none' });
const metaChip = { display: 'inline-block', padding: '3px 8px', borderRadius: 6, background: C.line2, color: C.text2, fontSize: 11.5 };
const when = at => String(at || '').slice(5, 16).replace('T', ' ').replace('-', '/');

export default function FeedbackInbox({ items, onUpdate, onClose }) {
  const counts = feedbackCounts(items);
  const [tab, setTab] = useState(counts.new ? 'new' : 'all');
  const [open, setOpen] = useState(null);
  const [reply, setReply] = useState({});
  const [busy, setBusy] = useState(false);
  const list = (items || []).filter(f => tab === 'all' || feedbackStatus(f) === tab);

  const act = async (f, patch) => {
    setBusy(true);
    try {
      const ok = await onUpdate(f.id, patch, (reply[f.id] || '').trim());
      if (ok !== false) {
        setReply(r => ({ ...r, [f.id]: '' }));
        // 처리하면 이 탭의 다음 건으로
        const rest = list.filter(x => x.id !== f.id);
        setOpen(rest[0]?.id || null);
      }
    } finally { setBusy(false); }
  };

  return (
    <div role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 10500, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="fb-title" style={{ width: 760, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100vh - 60px)', marginBottom: 20, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', color: C.ink }}>
        {/* 헤더 */}
        <div style={{ padding: '18px 22px 0', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 id="fb-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>파일럿 피드백</h2>
                {counts.new > 0 && <span style={pill('#fef3c7', '#b45309')}>새 {counts.new}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>앱 우하단 버튼으로 보낸 의견 · 화면 위치·기기 정보가 같이 들어와요</div>
            </div>
            <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, marginTop: -4, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
          </div>
          <div role="tablist" style={{ display: 'flex', gap: 18, marginTop: 14 }}>
            {TABS.map(([k, l]) => {
              const on = tab === k;
              return <button key={k} type="button" role="tab" aria-selected={on} onClick={() => { setTab(k); setOpen(null); }} style={{ padding: '0 0 10px', border: 0, background: 'none', fontSize: 13.5, fontWeight: on ? 700 : 500, color: on ? C.brand : C.text3, boxShadow: on ? `inset 0 -2px 0 ${C.brand}` : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{l} {counts[k]}</button>;
            })}
          </div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.length === 0 && (
            <div style={{ padding: '22px 16px', border: `1.5px dashed ${C.strong}`, borderRadius: 12, textAlign: 'center', fontSize: 13, color: C.text3, lineHeight: 1.6 }}>
              {tab === 'new' ? '새로 들어온 의견이 없어요' : '이 탭에 의견이 없어요'}<br />
              <span style={{ fontSize: 12, color: C.text4 }}>영업사원이 앱 우하단 버튼으로 보내면 여기로 들어와요</span>
            </div>
          )}
          {list.map(f => {
            const st = feedbackStatus(f);
            const [kbg, kfg] = KIND[f.kind] || ['#f1f5f9', C.text2];
            const s = STATUS[st];
            const screen = feedbackScreen(f.context);
            if (open !== f.id) {
              return (
                <button key={f.id} type="button" onClick={() => setOpen(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>
                  <span style={pill(kbg, kfg)}>{f.kind || '기타'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.text}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: C.text3, marginTop: 2 }}>{f.submittedBy} · {when(f.at)}{screen && <> · <span style={{ color: C.brand }}>{screen}</span></>}</span>
                  </span>
                  <span style={pill(s[1], s[2])}>{s[0]}</span>
                </button>
              );
            }
            const device = feedbackDevice(f.userAgent);
            return (
              <div key={f.id} style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${C.brand}`, boxShadow: `0 0 0 3px ${C.accent}`, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={pill(kbg, kfg)}>{f.kind || '기타'}</span>
                  <span style={{ fontSize: 12.5, color: C.text3 }}>{f.submittedBy} · {when(f.at)}</span>
                  <span style={{ flex: 1 }} />
                  <span style={pill(s[1], s[2])}>{s[0]}</span>
                  <button type="button" aria-label="접기" onClick={() => setOpen(null)} style={{ border: 0, background: 'none', color: C.text4, cursor: 'pointer', fontSize: 14 }}>▴</button>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 10 }}>{f.text}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {screen && <span style={metaChip}>화면 · {screen}</span>}
                  {device && <span style={metaChip}>기기 · {device}</span>}
                  {f.appVersion && <span style={metaChip}>버전 · {f.appVersion}</span>}
                  {f.severity && <span style={metaChip}>{f.severity}</span>}
                  {f.reproducibility && <span style={metaChip}>재현 · {f.reproducibility}</span>}
                </div>
                {f.reply && (
                  <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, color: C.green, lineHeight: 1.5 }}>
                    <b>답장</b> · {f.repliedBy} {when(f.repliedAt)}<br /><span style={{ color: C.ink, whiteSpace: 'pre-wrap' }}>{f.reply}</span>
                  </div>
                )}
                {st !== 'done' ? (
                  <>
                    <textarea aria-label="답장" value={reply[f.id] || ''} onChange={e => setReply(r => ({ ...r, [f.id]: e.target.value }))} placeholder="답장 (잔디 DM) · 선택"
                      style={{ display: 'block', width: '100%', height: 56, boxSizing: 'border-box', marginTop: 10, padding: 10, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {st === 'new' && <button type="button" disabled={busy} onClick={() => act(f, { status: 'in_progress' })} style={{ flex: 1, height: 40, borderRadius: 9, border: `1px solid ${C.accent}`, background: '#fff', color: C.brand, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>처리 중으로</button>}
                      <button type="button" disabled={busy} onClick={() => act(f, { status: 'resolved' })} style={{ flex: 2, height: 40, borderRadius: 9, border: 0, background: C.brand, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{(reply[f.id] || '').trim() ? '완료 · 답장 보내기' : '완료'}</button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: C.text3 }}>
                    <span>완료 · {f.resolvedBy} {when(f.resolvedAt)}</span>
                    <button type="button" disabled={busy} onClick={() => act(f, { status: 'open' })} style={{ marginLeft: 'auto', height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>다시 열기</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 22px', borderTop: `1px solid ${C.line2}` }}>
          <button type="button" onClick={onClose} style={{ height: 38, padding: '0 18px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>닫기</button>
        </div>
      </div>
    </div>
  );
}
