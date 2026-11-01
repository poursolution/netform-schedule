// 화면 자동 점검(스모크) — 운영 DB를 그대로 읽는 로컬 dev 서버(3002)에서 화면만 열어 본다.
// 저장·발송·결과 입력 같은 버튼은 누르지 않는다. 로그인은 사람이 한 번(`npm run e2e:login`) 해 두고 상태를 재사용.
import { defineConfig } from '@playwright/test';

const AUTH = 'e2e/.auth/state.json';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3002',
    channel: 'chrome', // 설치된 크롬 사용 — 브라우저 별도 다운로드 없음
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 3002 --strictPort',
    url: 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'logged-out', testMatch: /login\.spec\.js/, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'desktop', testMatch: /screens\.spec\.js/, use: { storageState: AUTH, viewport: { width: 1440, height: 900 } } },
    { name: 'narrow', testMatch: /screens\.spec\.js/, use: { storageState: AUTH, viewport: { width: 820, height: 900 } } },
    { name: 'mobile', testMatch: /mobile\.spec\.js/, use: { storageState: AUTH, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
