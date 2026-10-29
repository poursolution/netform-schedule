import React, { useState } from 'react';

// 새 화면 공통 사이드바 (핸드오프 "공통 셸") — 실적 작업대·일정 화면이 같이 쓴다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', line: '#e2e8f0', muted: '#f8fafc',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};

export default function AppSidebar({ nav, adminNav, currentUser, onOpenMyPage, onLogout, onOpenLegacy, footer, profileActive }) {
  const [openAdminItem, setOpenAdminItem] = useState(null);
  return (
    <aside style={{ width: 232, boxSizing: 'border-box', flex: 'none', background: '#fff', borderRight: `1px solid ${C.line}`, color: C.text2, display: 'flex', flexDirection: 'column', padding: '20px 14px', position: 'sticky', top: 0, height: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '2px 8px 26px' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: C.brand, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15 }}>P</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text, letterSpacing: '-.01em' }}>POUR 영업운영</div>
      </div>
      <nav aria-label="주 메뉴" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(nav || []).map(n => (
          <button key={n.key} type="button" onClick={n.onClick} aria-current={n.active ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 46, padding: '0 12px', borderRadius: 10, fontSize: 15, border: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: n.active ? C.brand : C.text2, fontWeight: n.active ? 700 : 500, background: n.active ? C.active : 'transparent' }}>
            <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 5, boxSizing: 'border-box', ...(n.active ? { background: C.brand } : { border: `1.5px solid ${C.text4}` }) }} />
            {n.label}
            {n.badge ? <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, background: '#b91c1c', color: '#fff', borderRadius: 999, padding: '2px 8px' }}>{n.badge}</span> : null}
          </button>
        ))}
      </nav>
      {adminNav && adminNav.length > 0 && (
        <>
          <div style={{ marginTop: 30, padding: '0 12px', fontSize: 12, fontWeight: 700, color: C.text4, letterSpacing: '.04em' }}>관리</div>
          <nav aria-label="관리 메뉴" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
            {adminNav.map(n => (
              <React.Fragment key={n.key}>
                <button type="button" aria-expanded={n.items ? openAdminItem === n.key : undefined} onClick={n.items ? () => setOpenAdminItem(o => o === n.key ? null : n.key) : n.onClick} style={{ height: 40, padding: '0 12px', borderRadius: 9, fontSize: 14, color: C.text3, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  {n.label}{n.badge ? <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginLeft: 5 }}>{n.badge}</span> : null}
                </button>
                {n.items && openAdminItem === n.key && n.items.map(it => (
                  <button key={it.key} type="button" onClick={it.onClick} style={{ padding: '8px 12px 8px 24px', borderRadius: 8, fontSize: 13.5, color: C.text3, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    {it.label}{it.badge ? <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginLeft: 4 }}>{it.badge}</span> : null}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </nav>
        </>
      )}
      <div style={{ flex: 1 }} />
      {footer}
      <button type="button" onClick={onOpenMyPage} aria-current={profileActive ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, border: `1px solid ${profileActive ? C.accent : C.line}`, background: profileActive ? C.active : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: profileActive ? C.brand : C.accent, color: profileActive ? '#fff' : C.brand, fontSize: 13, fontWeight: 700, display: 'grid', placeItems: 'center', flex: 'none' }}>{(currentUser?.name || '?').slice(0, 1)}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: C.text }}>{currentUser?.name}</span>
          <span style={{ display: 'block', fontSize: 12, color: C.text4 }}>마이페이지</span>
        </span>
      </button>
      <div style={{ display: 'flex', marginTop: 6 }}>
        <button type="button" onClick={onLogout} style={{ padding: '6px 10px', border: 0, background: 'transparent', color: C.text3, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>로그아웃</button>
        {onOpenLegacy && <button type="button" onClick={onOpenLegacy} style={{ marginLeft: 'auto', padding: '6px 10px', border: 0, background: 'transparent', color: C.text3, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>이전 화면</button>}
      </div>
    </aside>
  );
}
