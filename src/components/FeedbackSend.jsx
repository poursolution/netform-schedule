import React, { useState } from 'react';
import { FEEDBACK_KINDS } from '../utils/feedback.js';

// 파일럿 피드백 보내기 (#12a, 전체 사용자) — 종류 3택 + 한 줄. 화면·기기 정보는 자동 첨부.

const C = { brand: '#0F4C75', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', text2: '#475569', text3: '#64748b', text4: '#94a3b8' };
const KIND = { 버그: ['#fef2f2', '#b91c1c', '#fecaca'], 제안: ['#dbeafe', '#0F4C75', '#93c5fd'], 헷갈려요: ['#fef3c7', '#b45309', '#fcd34d'] };
const HINT = { 버그: '예: 결과 저장했는데 새로고침해야 반영돼요', 제안: '예: 일정 카드에 요청사 전화번호도 보이면 좋겠어요', 헷갈려요: '예: "정산요청" 체크가 무슨 뜻인지 모르겠어요' };

export default function FeedbackSend({ screen, device, onSubmit, onClose }) {
  const [kind, setKind] = useState('버그');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const ok = text.trim().length > 0;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { if (await onSubmit({ kind, text: text.trim() }) !== false) setSent(true); }
    finally { setBusy(false); }
  };

  return (
    <div role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 10500, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16, fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="fbs-title" style={{ width: 440, maxWidth: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', padding: '18px 20px 20px', color: C.ink, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2 id="fbs-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>의견 보내기</h2>
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>한 줄이면 충분해요 · 관리자가 확인하고 잔디로 답해요</div>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, marginTop: -4, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
        </div>

        {sent ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ padding: '14px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 14, fontWeight: 700 }}>✓ 보냈어요 · 고마워요!</div>
            <button type="button" onClick={onClose} style={{ width: '100%', height: 44, marginTop: 12, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>닫기</button>
          </div>
        ) : (
          <>
            <div role="group" aria-label="종류" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
              {FEEDBACK_KINDS.map(k => {
                const on = kind === k, c = KIND[k];
                return <button key={k} type="button" aria-pressed={on} onClick={() => setKind(k)} style={{ height: 44, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, background: on ? c[0] : '#fff', color: on ? c[1] : C.text3, border: `1px solid ${on ? c[2] : C.line}` }}>{k}</button>;
              })}
            </div>
            <textarea autoFocus aria-label="내용" value={text} onChange={e => setText(e.target.value)} placeholder={HINT[kind]}
              style={{ display: 'block', width: '100%', height: 88, boxSizing: 'border-box', marginTop: 10, padding: 12, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ fontSize: 11.5, color: C.text4, marginTop: 8 }}>자동 첨부 · {[screen && `화면 ${screen}`, device && `기기 ${device}`].filter(Boolean).join(' · ') || '현재 화면·기기 정보'}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, height: 44, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>취소</button>
              <button type="button" disabled={!ok || busy} onClick={submit} style={{ flex: 2, height: 44, borderRadius: 10, border: 0, background: ok ? C.brand : '#cbd5e1', color: '#fff', fontSize: 14, fontWeight: 700, cursor: ok ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>보내기</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
