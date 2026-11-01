import fs from 'node:fs';
import { expect, test } from '@playwright/test';

export const AUTH = 'e2e/.auth/state.json';

// 로그인 상태 파일이 없으면 로그인이 필요한 점검은 건너뛴다(안내만)
export function requireLogin() {
  test.skip(!fs.existsSync(AUTH), '로그인 상태가 없어요 — 먼저 `npm run e2e:login` 으로 한 번 로그인해 주세요.');
}

/** 페이지 에러·콘솔 에러 수집 + 혹시 뜨는 confirm/alert 는 무조건 '취소' (저장·발송 방지). */
export function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|Failed to load resource: the server responded with a status of 404/.test(t)) return;
    errors.push(`console: ${t}`);
  });
  page.on('dialog', d => d.dismiss());
  return errors;
}

/** 가로 스크롤(페이지 폭 넘침) 없음 */
export async function expectNoHorizontalOverflow(page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `페이지가 화면 폭(${iw}px)보다 넓어요(${sw}px)`).toBeLessThanOrEqual(iw + 1);
}

/** 한 글자씩 줄바꿈될 만큼 좁아진 글 칸 찾기 — 글자가 4자 이상인데 폭이 28px 미만 */
export async function squashedTextCells(page, root = 'main') {
  return page.evaluate(sel => {
    const out = [];
    for (const el of document.querySelectorAll(`${sel} span, ${sel} div, ${sel} td`)) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (t.length < 4) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width < 28 && r.height > 60) out.push(`${t.slice(0, 20)} (${Math.round(r.width)}px)`);
    }
    return out.slice(0, 5);
  }, root);
}
