# ⚠ 이 폴더는 운영 Worker 소스가 아닙니다 — 배포 금지

운영 `kapt-verify-worker`(https://kapt-verify-worker.promieses.workers.dev)의 실제 소스는
`C:\Users\User\Documents\ChatGPT\영업운영시스템\deploy-source\` 에 있습니다.

- 최신 배포본: `deploy-source/release-*/candidate/src/production-entry.js` (+ `candidate/wrangler.jsonc`)
- 운영 버전 확인: `GET /health` 의 `buildTag` (2026-11-02 기준 `schedule-only-access-2026-09-29`)
- 배포 절차: `deploy-source/OPERATING-MODEL-STATUS.md`, 각 release 폴더의 `DEPLOY.md`

이 폴더(`netform-schedule/cloudflare-worker`)는 2026-05~08 무렵에 멈춘 옛 버전입니다.
여기서 배포하면 운영 Worker가 옛 코드로 되돌아가 9월 이후 기능(잔디 공고 재확인·정산 보호 API·일정 전용 계정 등)이 사라집니다.

그래서:
- `wrangler.toml` → `wrangler.stale.toml` 로 이름을 바꿔 `wrangler deploy` 가 동작하지 않게 했고,
- `npm run deploy` 는 안내 후 실패하게 했습니다.

이 폴더 코드는 테스트(`tests/settlement.test.js`, `tests/exceptions.test.js`)에서 앱 정산 계산과 같은 규칙인지 비교하는 참고용으로만 씁니다.
Worker 동작을 바꿔야 하면 영업운영시스템 쪽 최신 배포본을 복사한 새 release 폴더에서 고치고, 배포는 사용자가 합니다.
