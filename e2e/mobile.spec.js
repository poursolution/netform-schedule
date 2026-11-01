import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, requireLogin, watch } from './helpers.js';

test.beforeEach(() => requireLogin());

test('휴대폰 메인 → 하단 탭 이동', async ({ page }, info) => {
  const errors = watch(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '메인' }).first()).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalOverflow(page);
  await info.attach('모바일-메인.png', { body: await page.screenshot(), contentType: 'image/png' });

  for (const tab of ['일정', '실적']) {
    const btn = page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click();
    await page.waitForTimeout(800);
    await expectNoHorizontalOverflow(page);
    await info.attach(`모바일-${tab}.png`, { body: await page.screenshot(), contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
});
