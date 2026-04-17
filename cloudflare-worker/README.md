# K-APT 자동 검증 Cloudflare Worker

PT 결과 "승" 입력 시 클라이언트에서 호출되어 K-APT(공동주택관리정보시스템) 입찰결과를 자동 조회하고, 우리 회사 낙찰 여부를 판정하여 잔디 채널에 알림을 발송하는 Cloudflare Worker입니다.

## 흐름

```
[POUR영업운영시스템 클라이언트]
  PT 결과 "승" 저장
  → fetch(WORKER_URL/verify, body)
       ↓
[Cloudflare Worker]
  1) data.go.kr OpenAPI 호출 (입찰결과 조회)
     - 공고번호 있으면: 공고번호 기준 정확 조회
     - 공고번호 없으면: 단지명 기반 검색
  2) 우리 회사 낙찰 여부 판정 (OUR_COMPANY_NAMES 매칭)
  3) 결과:
     - 우리 낙찰 ✅  → status: 'verified'
     - 공고 못 찾음 ⚠️  → 잔디 알림 + needs_review
     - 타사 낙찰 ❌  → 잔디 알림 + needs_review
       ↓
[클라이언트] 검증 결과를 PT 데이터에 audit log 기록
```

## 사전 준비

### 1. data.go.kr API 키 발급 (사용자 작업)

1. <https://www.data.go.kr> 회원가입
2. 다음 두 API V2에 활용신청 (필수: 입찰결과 / 권장: 입찰공고):
   - **공동주택 입찰결과공지 정보제공 서비스 V2** ★ 필수
     End Point: `https://apis.data.go.kr/1613000/ApHusBidResultNoticeInfoOfferServiceV2`
   - **공동주택 입찰공고 정보제공 서비스 V2** (선택)
     End Point: `https://apis.data.go.kr/1613000/ApHusBidPblAncInfoOfferServiceV2`
3. 승인 후 마이페이지 → 개발계정 → 일반 인증키(Encoding) 복사

### 사용하는 API endpoint

| 호출 시점 | endpoint | 용도 |
|---|---|---|
| 공고번호 입력 시 | `/getBidEntrpsInfoSearchV2?bidNum=...` | 응찰업체 + 낙찰여부 직접 조회 |
| 단지명만 있을 때 | `/getHsmpNmSearchV2?hsmpNm=...&srchYear=...` | 단지명으로 입찰 후보 검색 → 후보 N개로 위 endpoint 호출 |

### 응답 핵심 필드

**`/getHsmpNmSearchV2`** 응답:
- `bidNum` 입찰번호
- `aptCode` 단지코드
- `bidKaptname` 단지명
- `bidTitle` 입찰제목
- `bidRegdate`/`bidDeadline` 등록일/마감일
- `amount` 낙찰금액
- `bidReason` 낙찰/유찰 사유

**`/getBidEntrpsInfoSearchV2`** 응답:
- `companyName` 응찰회사 ★
- `competentName` 담당자
- `bidSuccessfulYn` 낙찰여부 ('Y' = 낙찰) ★

### 2. Cloudflare 계정 + Wrangler 설치

```bash
npm install -g wrangler
wrangler login   # 브라우저로 Cloudflare 로그인
```

## 배포

### 1) 의존성 설치

```bash
cd cloudflare-worker
npm install
```

### 2) Secret 등록 (코드에 노출 X)

```bash
# data.go.kr API 키
wrangler secret put DATA_GO_KR_KEY
# → 프롬프트에 키 붙여넣기

# 잔디 웹훅 URL
wrangler secret put JANDI_WEBHOOK_URL
# → https://wh.jandi.com/connect-api/webhook/26098605/...
```

### 3) 배포

```bash
wrangler deploy
```

배포 완료 시 다음과 같은 URL 발급:
```
https://kapt-verify-worker.<account-subdomain>.workers.dev
```

### 4) 영업운영시스템에 Worker URL 등록

1. `https://schedules-cip.pages.dev` admin 로그인
2. (별도 모달 추가 예정) 또는 Firebase Realtime DB 콘솔에서 직접:
   ```
   config/kaptWorker = {
     url: "https://kapt-verify-worker.xxx.workers.dev",
     enabled: true
   }
   ```

## 헬스체크

```bash
curl https://kapt-verify-worker.xxx.workers.dev/health
```

응답 예시:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "hasKey": true,
  "hasJandi": true,
  "ourCompanies": ["넷폼", "(주)넷폼", "POUR솔루션", ...]
}
```

## 검증 테스트

```bash
curl -X POST https://kapt-verify-worker.xxx.workers.dev/verify \
  -H "Content-Type: application/json" \
  -d '{
    "siteName": "해운대 센텀",
    "bidNo": "2026-04-1234",
    "assignee": "이필선",
    "ptDate": "2026-04-15",
    "by": "이필선"
  }'
```

## 로그 모니터링

```bash
wrangler tail
```

실시간으로 Worker 호출 로그를 확인할 수 있습니다.

## 환경 변수 (wrangler.toml [vars])

| 변수 | 설명 |
|---|---|
| `OUR_COMPANY_NAMES` | 콤마 구분, 우리 회사 낙찰자 매칭에 사용. 회사명 표기 변형(법인격, 영문, 약칭)을 모두 포함 |
| `ALLOWED_ORIGIN` | CORS 허용 도메인. 기본값: `https://schedules-cip.pages.dev` |

## 트러블슈팅

- **Worker 호출은 되는데 항상 needs_review** → `wrangler tail`로 로그 확인. data.go.kr 응답 구조가 예상과 다를 수 있음 (parseBidResultResponse 보정 필요)
- **CORS 에러** → wrangler.toml의 `ALLOWED_ORIGIN`이 클라이언트 도메인과 일치하는지 확인
- **잔디 알림 미수신** → `wrangler secret list`로 `JANDI_WEBHOOK_URL` 등록 확인
