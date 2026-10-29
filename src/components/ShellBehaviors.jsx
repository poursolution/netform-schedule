import React, { useEffect, useState } from 'react';

// README "기본 동작 규칙" 중 화면 공통 동작
// - 네트워크 끊김: 상단 얇은 배너 "오프라인 · 연결되면 자동 저장" (Firebase가 재연결 시 쓰기를 다시 보냄)
// - `/` 키: 현재 화면의 검색창에 포커스 (입력 중·모달 안에서는 무시)
const SEARCH_SELECTOR = '#md-search, #sw-search';

export default function ShellBehaviors() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      const el = Array.from(document.querySelectorAll(SEARCH_SELECTOR)).find(n => n.offsetParent !== null);
      if (!el) return;
      e.preventDefault();
      el.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 새 화면(전체 화면 고정 오버레이)이 떠 있으면 그 밑에 깔린 기존 화면은 inert —
  // 보이지 않는 기존 헤더 버튼(로그아웃 등)이 Tab 포커스·화면 낭독기에 먼저 잡히지 않게
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    const isOverlay = el => el.style.position === 'fixed' && Number(el.style.zIndex) >= 500 && el.style.inset === '0px';
    let marked = [];
    let raf = 0;
    const apply = () => {
      raf = 0;
      const fixedTop = Array.from(root.querySelectorAll('div[style*="fixed"]')).filter(el => el.style.position === 'fixed' && Number(el.style.zIndex) >= 500);
      const overlays = fixedTop.filter(isOverlay);
      const next = new Set();
      overlays.forEach(ov => {
        for (let node = ov; node && node !== root; node = node.parentElement) {
          const parent = node.parentElement;
          if (!parent) break;
          Array.from(parent.children).forEach(sib => {
            // 오버레이·모달(고정, z 500+)을 품은 형제는 건드리지 않음 — 위에 뜬 창이 같이 잠기지 않게
            if (sib === node || sib.style.position === 'fixed' || fixedTop.some(o => sib.contains(o))) return;
            next.add(sib);
          });
        }
      });
      marked.forEach(el => { if (!next.has(el)) el.removeAttribute('inert'); });
      next.forEach(el => { if (!el.hasAttribute('inert')) el.setAttribute('inert', ''); });
      marked = Array.from(next);
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(apply); });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    apply();
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); marked.forEach(el => el.removeAttribute('inert')); };
  }, []);

  if (online) return null;
  return (
    <div role="status" style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, height: 28, padding: '0 14px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, background: '#1e293b', color: '#fff', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(15,23,42,.18)' }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: '#fbbf24' }} />
      오프라인 · 연결되면 자동 저장
    </div>
  );
}
