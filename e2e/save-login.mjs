// 화면 자동 점검용 로그인 상태 저장 — 크롬 창이 뜨면 직접 로그인하세요. 메인 화면이 보이면 자동으로 저장하고 닫힘.
// 저장 파일(e2e/.auth/state.json)은 이 컴퓨터에만 두고 git 에 올리지 않는다(.gitignore).
// 주의: '자동 로그인'을 켜면 이 파일 안 localStorage 에 비밀번호가 그대로 들어간다 — 자동 로그인은 끄고 로그인하세요.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.env.E2E_BASE_URL || 'http://localhost:3002';
const out = 'e2e/.auth/state.json';

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
await page.goto(base);
console.log(`\n크롬 창에서 로그인해 주세요 (${base}). 최대 5분 기다려요.\n`);
await page.locator('aside').getByRole('button', { name: '실적', exact: true }).waitFor({ timeout: 300_000 });
fs.mkdirSync('e2e/.auth', { recursive: true });
await context.storageState({ path: out });
const hasPw = JSON.stringify(JSON.parse(fs.readFileSync(out, 'utf8'))).includes('autoLogin');
console.log(`저장했어요: ${out}${hasPw ? '\n⚠ 자동 로그인 정보(비밀번호)가 들어 있어요. 이 파일은 공유하지 마세요.' : ''}`);
await browser.close();
