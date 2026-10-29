import React from 'react';

// 모바일 고정 하단 탭 (#5a·#5b 공통) — 5열, 가운데 [+ 일정추가] 원형 버튼

const BRAND = '#0F4C75';
const OFF = '#94a3b8';

function TabIcon({ name, active }) {
  const s = { width: 22, height: 22, fill: 'none', stroke: active ? BRAND : OFF, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'home') return <svg viewBox="0 0 24 24" style={s}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>;
  if (name === 'calendar') return <svg viewBox="0 0 24 24" style={s}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
  if (name === 'won') return <svg viewBox="0 0 24 24" style={s}><path d="M4 7l3 10 3-8 2 0 3 8 3-10" /><path d="M3 11h18" /></svg>;
  if (name === 'chart') return <svg viewBox="0 0 24 24" style={s}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
  return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
}

// tabs: [{ key, label, icon, active, badge, primary, onClick }]
export default function MobileTabBar({ tabs }) {
  return (
    <nav aria-label="하단 메뉴" style={{ flex: 'none', height: 'calc(64px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)', boxSizing: 'border-box', background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'start' }}>
      {tabs.map(t => t.primary ? (
        <button key={t.key} type="button" onClick={t.onClick} aria-label="일정 추가" style={{ border: 0, background: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', fontFamily: 'inherit', color: '#475569', fontSize: 10.5, fontWeight: 600 }}>
          <span aria-hidden="true" style={{ width: 54, height: 54, marginTop: -22, borderRadius: '50%', background: BRAND, color: '#fff', fontSize: 28, display: 'grid', placeItems: 'center', boxShadow: '0 10px 22px rgba(15,76,117,.34)' }}>+</span>
          {t.label}
        </button>
      ) : (
        <button key={t.key} type="button" onClick={t.onClick} aria-current={t.active ? 'page' : undefined} style={{ position: 'relative', border: 0, background: 'none', padding: '10px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', fontFamily: 'inherit', color: t.active ? BRAND : OFF, fontSize: 10.5, fontWeight: 600 }}>
          <TabIcon name={t.icon} active={t.active} />
          {t.label}
          {t.badge ? <span style={{ position: 'absolute', top: 6, left: 'calc(50% + 6px)', minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 999, background: '#b91c1c', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{t.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}
