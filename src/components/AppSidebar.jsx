import React, { useEffect, useRef, useState } from 'react';

// 새 화면 공통 사이드바 — 핸드오프 "공통 셸 v2"(#15a): 224px, 로고 줄 64px(헤더와 선 맞춤),
// 메뉴는 로고 줄 아래 48px부터, 44px 항목 + 실제 아이콘. 하단은 프로필 카드 하나(⋯ 메뉴에 마이페이지·로그아웃·이전 화면).

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};

// 18px 선 아이콘 — 메뉴 키별
const ICONS = {
  main: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  perf: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  settle: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  home: <><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></>,
};
const Icon = ({ k }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    {ICONS[k] || <rect x="4" y="4" width="16" height="16" rx="4" />}
  </svg>
);

export default function AppSidebar({ nav, adminNav, currentUser, onOpenMyPage, onLogout, onOpenLegacy, footer, profileActive }) {
  const [openAdminItem, setOpenAdminItem] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  const menuItem = { display: 'block', width: '100%', textAlign: 'left', height: 36, padding: '0 12px', border: 0, borderRadius: 8, background: 'transparent', fontSize: 13.5, color: C.text, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <aside style={{ width: 224, boxSizing: 'border-box', flex: 'none', background: '#fff', borderRight: `1px solid ${C.line}`, color: C.text2, display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
      <div style={{ height: 64, flex: 'none', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: C.brand, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>P</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>POUR 영업운영</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <nav aria-label="주 메뉴" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '48px 12px 0' }}>
          {(nav || []).map(n => (
            <button key={n.key} type="button" onClick={n.onClick} aria-current={n.active ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 12px', borderRadius: 10, fontSize: 14.5, border: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: n.active ? C.brand : C.text2, fontWeight: n.active ? 700 : 500, background: n.active ? C.active : 'transparent' }}>
              <Icon k={n.icon || n.key} />
              {n.label}
              {n.badge ? <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: '#b91c1c', color: '#fff', borderRadius: 999, padding: '2px 7px' }}>{n.badge}</span> : null}
            </button>
          ))}
        </nav>
        {adminNav && adminNav.length > 0 && (
          <>
            <div style={{ margin: '36px 24px 10px', fontSize: 11, fontWeight: 700, color: C.text4, letterSpacing: '.06em' }}>관리</div>
            <nav aria-label="관리 메뉴" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
              {adminNav.map(n => (
                <React.Fragment key={n.key}>
                  <button type="button" aria-expanded={n.items ? openAdminItem === n.key : undefined} onClick={n.items ? () => setOpenAdminItem(o => o === n.key ? null : n.key) : n.onClick} style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 12px', borderRadius: 10, fontSize: 14, color: C.text2, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    {n.label}{n.badge ? <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#b45309' }}>{n.badge}</span> : null}
                  </button>
                  {n.items && openAdminItem === n.key && n.items.map(it => (
                    <button key={it.key} type="button" onClick={it.onClick} style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 12px 0 24px', borderRadius: 8, fontSize: 13, color: C.text3, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                      {it.label}{it.badge ? <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#b45309' }}>{it.badge}</span> : null}
                    </button>
                  ))}
                </React.Fragment>
              ))}
            </nav>
          </>
        )}
      </div>
      {footer && <div style={{ padding: '0 12px' }}>{footer}</div>}
      <div ref={menuRef} style={{ position: 'relative', margin: '0 12px 16px' }}>
        {menuOpen && (
          <div role="menu" style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 6px)', padding: 4, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,.12)', zIndex: 10 }}>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenMyPage && onOpenMyPage(); }} style={menuItem}>마이페이지</button>
            {onOpenLegacy && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenLegacy(); }} style={menuItem}>이전 화면으로 보기</button>}
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onLogout && onLogout(); }} style={{ ...menuItem, color: '#b91c1c' }}>로그아웃</button>
          </div>
        )}
        <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-current={profileActive ? 'page' : undefined} onClick={() => setMenuOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${profileActive ? C.accent : C.line}`, background: profileActive ? C.active : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: profileActive ? C.brand : C.accent, color: profileActive ? '#fff' : C.brand, fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flex: 'none' }}>{(currentUser?.name || '?').slice(0, 1)}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.text }}>{currentUser?.name}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: C.text4 }}>마이페이지 · 로그아웃</span>
          </span>
          <span aria-hidden="true" style={{ color: C.text4, fontSize: 12 }}>⋯</span>
        </button>
      </div>
    </aside>
  );
}
