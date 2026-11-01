import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, watch } from './helpers.js';

test('로그아웃 상태 — 로그인 화면이 깨지지 않고 뜬다', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  // 메인은 로그아웃이어도 열린다 — '일정추가' 같은 보호 동작에서 로그인 화면으로
  await expect(page.locator('#root')).not.toBeEmpty();
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
