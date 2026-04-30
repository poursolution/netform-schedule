# CLAUDE.md — 이 프로젝트에서 Claude가 매 세션 자동으로 알아야 할 것

> **OPERATIONS.md가 운영 기준의 단일 출처(Single Source of Truth).** 정산 분기 귀속·금액·검증 조건 등 운영 룰은 거기서 확인. 이 파일은 "Claude가 매번 새 세션에서 헷갈리지 않도록" 빠른 참조용.

---

## 0. 말투

- **사용자에게는 항상 존댓말.**

---

## 1. K-APT 공고 확인은 "잔디 루트"가 이미 셋업되어 있음 — 사용자에게 "어떻게 확인할까요?" 묻지 말 것

사용자가 "공고 확인해" / "공고취소 확인해" 라고 할 때 따라야 할 정답 루트:

1. **자동 — Cloudflare Worker가 K-APT(data.go.kr) 조회**
   - 진입점: `src/utils/kaptVerify.js` → `verifyKaptForPt({ scheduleId, assignee, siteName, workType, bidNo, ptDate, by })`
   - PT 결과 "승" 입력, 또는 K-APT 재검증 모달, 또는 분기정산 최종확정 시 자동 호출됨 (App.jsx:2951, 14872, 15031, 19293)
   - 결과: `pt.kaptVerified.status` = `'verified'` | `'cancelled'` | `'needs_review'`
   - **취소공고면** `kaptVerified.status === 'cancelled'` → 정산에서 자동 제외, UI에 🚫 취소공고 배지

2. **검토필요 시 자동으로 잔디 발송**
   - `sendDirectJandiCrossCheck()` (kaptVerify.js:136) → "🔍 PT 크로스체크 요청" 메시지를 관리자 잔디 채널로
   - 메시지 빌더: `src/utils/jandi.js:33 buildCrossCheckMessage()`
   - 웹훅 URL: Firebase `config/jandiWebhookUrl`

**Claude가 절대 하지 말 것:**
- "직접 K-APT 사이트 가서 확인해보세요" 같은 안내 (이미 자동화되어 있음)
- "방법 A/B/C 중 고르세요" 같은 셀렉트 메뉴 (사용자는 이미 정답 루트 알고 있음 — 그냥 그 루트로 처리)
- 잔디 확인 요청을 받으면, 코드/PT를 트리거해서 그 루트가 자동으로 발사되도록 하거나, 안 되면 솔직히 "이 환경에선 운영 Firebase에 못 붙어서 직접 발사 못 함" 한 줄로 설명

## 2. 단지명 별칭 (apartmentAliases)

- 저장: Firebase `config/apartmentAliases` — `{ 정규화키: [별칭, ...] }` 양방향
- 헬퍼: `src/utils/apartmentMatch.js` → `addApartmentAlias(map, nameA, nameB)` (immutable)
- 자동 학습: K-APT 검증 모달에서 후보 클릭 시 (App.jsx:14843)
- 사용자가 "A → B 별칭 등록해" 하면 → 그냥 위 헬퍼로 등록 코드 짜드리면 됨, 방법 나열 X

## 3. 정산요청 필터 동작 (자주 헷갈리는 부분)

- 정산요청 탭 필터: `result && result !== '패' && !!stl.requested && !stl.completed && !stl.selfSales` (App.jsx:9747)
- **체크박스 해제 시 즉시 사라짐** — 2026-04-30 fix로 `window.confirm` 추가 (App.jsx:10635). 공고취소 항목은 🚫 안내 포함.

## 4. 운영 데이터 접근 — Claude의 한계

- 이 worktree 환경에는 **Firebase admin 자격증명 없음** → 운영 DB 직접 read/write 불가
- **K-APT 직접 조회 불가** (data.go.kr API 인증 필요, Worker가 처리)
- **잔디 웹훅 URL이 Firebase에 있어서** Claude가 직접 잔디 메시지 못 보냄
- 즉 "X 공고 지금 취소됐어?" 류 질문은 → 코드/플로우 안내까지가 한계, 실제 조회는 사용자가 앱/Worker로

## 5. 빌드·배포

- Vite + Firebase Realtime DB
- dev: `npm run dev` (vite, port 3002)
- worktree에 node_modules 없음 — `npm i` 먼저
- Worker: `cloudflare-worker/` 별도 배포

## 6. 주요 파일

| 영역 | 파일 |
|---|---|
| 메인 앱 | `src/App.jsx` (~21000줄) |
| K-APT 검증 | `src/utils/kaptVerify.js` |
| 잔디 알림 | `src/utils/jandi.js` |
| 단지명 매칭/별칭 | `src/utils/apartmentMatch.js` |
| 정산 계산 | `src/utils/settlement.js`, `src/utils/verification.js` |
| Cloudflare Worker | `cloudflare-worker/index.js` |
| 운영 룰 (정산·분기) | `OPERATIONS.md` ← **단일 출처** |
