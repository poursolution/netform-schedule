import React, { useEffect } from 'react';

// 로그인 전 화면 — 로그인하기 전에는 앱 화면(데이터)을 덮는다. 새 화면들과 같은 톤(브랜드 블루 · 흰 카드).
// 로그인 처리는 기존 handleLogin 그대로.

const C = { brand: '#0F4C75', brand2: '#3282B8', accent: '#BBE1FA', ink: '#1e293b', line: '#e2e8f0', muted: '#f8fafc', text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c' };
const input = { display: 'block', width: '100%', height: 48, boxSizing: 'border-box', marginTop: 6, padding: '0 14px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, fontFamily: 'inherit', color: C.ink, background: '#fff' };
const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: C.text2 };
const POINTS = [
  ['일정', 'PT·현설·회의를 달력 하나로'],
  ['실적', 'PT 끝나면 승·무·패 한 번만'],
  ['정산', 'K-APT 자동 확인 후 분기 급여 반영'],
];

export default function LoginScreen({ isMobile, loginId, onLoginId, loginPw, onLoginPw, error, onLogin, autoPending }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const submit = e => { e.preventDefault(); onLogin(); };
  const ready = loginId.trim() && loginPw;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', background: C.muted, color: C.ink, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      {!isMobile && (
        <aside style={{ flex: '0 0 42%', maxWidth: 520, background: C.brand, color: '#fff', padding: '48px 44px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: '#fff', color: C.brand, fontSize: 17, fontWeight: 800, display: 'grid', placeItems: 'center' }}>P</span>
            <span style={{ fontSize: 16, fontWeight: 800 }}>POUR 영업운영</span>
          </div>
          <div style={{ marginTop: 'auto' }}>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.3 }}>오늘 할 일부터<br />정산까지 한 곳에서</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
              {POINTS.map(([t, d]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 44, height: 28, borderRadius: 999, background: 'rgba(255,255,255,.14)', color: C.accent, fontSize: 12.5, fontWeight: 700, display: 'grid', placeItems: 'center', flex: 'none' }}>{t}</span>
                  <span style={{ fontSize: 14, opacity: .9 }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 'auto', fontSize: 12, opacity: .6 }}>석민이앤씨 · POUR솔루션 · 아파트스퀘어</div>
        </aside>
      )}

      <main style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '32px 16px' : 40, boxSizing: 'border-box' }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: isMobile ? '28px 20px' : '32px 32px 28px', boxSizing: 'border-box' }}>
          {isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: C.brand, color: '#fff', fontSize: 17, fontWeight: 800, display: 'grid', placeItems: 'center' }}>P</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>POUR 영업운영</span>
            </div>
          )}
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>로그인</h2>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 6 }}>관리자에게 받은 아이디로 들어와요</div>

          {autoPending && !error && (
            <div role="status" style={{ marginTop: 18, padding: '10px 12px', borderRadius: 10, background: '#eef5fb', color: C.brand, fontSize: 13, fontWeight: 600 }}>자동 로그인 중…</div>
          )}
          {error && (
            <div role="alert" style={{ marginTop: 18, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: C.red, fontSize: 13 }}>{error}</div>
          )}

          <label style={{ ...label, marginTop: 20 }}>아이디
            <input type="text" autoComplete="username" autoFocus={!isMobile} value={loginId} onChange={e => onLoginId(e.target.value)} placeholder="아이디" style={input} />
          </label>
          <label style={{ ...label, marginTop: 14 }}>비밀번호
            <input type="password" autoComplete="current-password" value={loginPw} onChange={e => onLoginPw(e.target.value)} placeholder="비밀번호" style={input} />
          </label>

          <button type="submit" disabled={!ready} style={{ width: '100%', height: 50, marginTop: 22, border: 0, borderRadius: 12, background: ready ? C.brand : '#cbd5e1', color: '#fff', fontSize: 16, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>로그인</button>
          <div style={{ fontSize: 12, color: C.text4, textAlign: 'center', marginTop: 14 }}>계정이 없거나 비밀번호를 잊었으면 관리자에게 문의하세요</div>
        </form>
      </main>
    </div>
  );
}
