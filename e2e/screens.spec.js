import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, requireLogin, squashedTextCells, watch } from './helpers.js';

// 사이드바 메뉴 → 화면 제목. 메뉴 이동만 하고 다른 버튼은 누르지 않는다.
const SCREENS = [
  { nav: '메인', h1: '메인' },
  { nav: '일정', h1: '일정' },
  { nav: '실적', h1: '실적' },
  { nav: '정산', h1: '분기정산' },
];

test.beforeEach(() => requireLogin());

for (const s of SCREENS) {
  test(`${s.nav} 화면`, async ({ page }, info) => {
    const errors = watch(page);
    await page.goto('/');
    const nav = page.locator('aside').getByRole('button', { name: s.nav, exact: true });
    await expect(nav, '사이드바가 안 보여요 — 로그인 상태가 만료됐으면 `npm run e2e:login`').toBeVisible({ timeout: 30_000 });
    await nav.click();
    await expect(page.getByRole('heading', { level: 1, name: s.h1 }).first()).toBeVisible();
    await page.waitForTimeout(800); // 데이터 반영 후 레이아웃
    await expectNoHorizontalOverflow(page);
    expect(await squashedTextCells(page), '글 칸이 너무 좁아 한 글자씩 줄바꿈돼요').toEqual([]);
    await info.attach(`${s.nav}.png`, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
    expect(errors).toEqual([]);
  });
}

test('일정 리스트 — 담당 미배정 목록', async ({ page }, info) => {
  const errors = watch(page);
  await page.goto('/');
  await page.locator('aside').getByRole('button', { name: '일정', exact: true }).click();
  await page.getByRole('button', { name: '리스트', exact: true }).click();
  await page.getByRole('button', { name: /^미배정 \d+/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: /담당 미배정 PT/ })).toBeVisible();
  await page.waitForTimeout(500);
  await expectNoHorizontalOverflow(page);
  expect(await squashedTextCells(page), '리스트 칸이 찌그러졌어요').toEqual([]);
  await info.attach('일정-리스트.png', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});
