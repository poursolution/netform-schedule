import React, { useState } from 'react';

// 새 화면 공통 사이드바 (핸드오프 "공통 셸") — 실적 작업대·일정 화면이 같이 쓴다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', line: '#e2e8f0', muted: '#f8fafc',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};

export default function AppSidebar({ nav, adminNav, currentUser, onOpenMyPage, onLogout, onOpenLegacy, footer, profileActive }) {
  const [openAdminItem, setOpenAdminItem] = useState(null);
  return (
    <aside style={{ width: 208, boxSizing: 'border-box', flex: 'none', background: '#fff', borderRight: `1px solid ${C.line}`, color: C.text2, display: 'flex', flexDirection: 'column', padding: '18px 12px', position: 'sticky', top: 0, height: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 22px' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: C.brand, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>P</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>POUR 영업운영</div>
      </div>
      <nav aria-label="주 메뉴" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(nav || []).map(n => (
          <button key={n.key} type="button" onClick={n.onClick} aria-current={n.active ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, fontSize: 13.5, border: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: n.active ? C.brand : C.text2, fontWeight: n.active ? 700 : 400, background: n.active ? C.active : 'transparent' }}>
            <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box', ...(n.active ? { background: C.brand } : { border: `1.5px solid ${C.text4}` }) }} />
            {n.label}
            {n.badge ? <span style={{ marginLeft: 'auto', fontSize: 11, background: '#b91c1c', color: '#fff', borderRadius: 999, padding: '1px 7px' }}>{n.badge}</span> : null}
          </button>
        ))}
      </nav>
      {adminNav && adminNav.length > 0 && (
        <>
          <div style={{ marginTop: 22, padding: '0 10px', fontSize: 11, fontWeight: 600, color: C.text4, letterSpacing: '.04em' }}>관리</div>
          <nav aria-label="관리 메뉴" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
            {adminNav.map(n => (
              <React.Fragment key={n.key}>
                <button type="button" aria-expanded={n.items ? openAdminItem === n.key : undefined} onClick={n.items ? () => setOpenAdminItem(o => o === n.key ? null : n.key) : n.onClick} style={{ padding: '8px 10px', borderRadius: 8, fontSize: 13, color: C.text3, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  {n.label}{n.badge ? <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginLeft: 4 }}>{n.badge}</span> : null}
                </button>
                {n.items && openAdminItem === n.key && n.items.map(it => (
                  <button key={it.key} type="button" onClick={it.onClick} style={{ padding: '6px 10px 6px 22px', borderRadius: 8, fontSize: 12.5, color: C.text3, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
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
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: profileActive ? C.brand : C.accent, color: profileActive ? '#fff' : C.brand, fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flex: 'none' }}>{(currentUser?.name || '?').slice(0, 1)}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text }}>{currentUser?.name}</span>
          <span style={{ display: 'block', fontSize: 11, color: C.text4 }}>마이페이지</span>
        </span>
      </button>
      <div style={{ display: 'flex', marginTop: 6 }}>
        <button type="button" onClick={onLogout} style={{ padding: '6px 10px', border: 0, background: 'transparent', color: C.text3, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>로그아웃</button>
        {onOpenLegacy && <button type="button" onClick={onOpenLegacy} style={{ marginLeft: 'auto', padding: '6px 10px', border: 0, background: 'transparent', color: C.text3, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>이전 화면</button>}
      </div>
    </aside>
  );
}
