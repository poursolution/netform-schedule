# POUR 영업운영시스템 — 운영 기준 문서

**버전:** v1.0  
**대상:** 관리자 · 담당자 · 급여 담당(김유림) · 대표  
**용도:** 분쟁 방지 / 운영 일관성 / 급여 반영 근거

---

## 1. 분기 귀속 기준 (가장 중요)

**정산 귀속은 PT 진행일이 아니라 "실적 확정일(resultConfirmDate)" 기준.**

### 확정일 우선순위 (fallback 체인)
1. `settlement.{assignee}.finalConfirmedAt` — 담당자 2라운드 최종 확정 시각
2. `settlement.{assignee}.requestedAt` — 정산요청 체크 타임스탬프
3. `pt.resultConfirmDate[assignee]` — **승/무/패 버튼을 클릭한 날짜** (결과 입력 시점)
4. `pt.date` — PT 진행일 (최종 fallback, 레거시 데이터)

> `resultConfirmDate[assignee]` 은 `saveResults()` 실행 시 자동 세팅.  
> 결과값이 변경되지 않는 한 덮어쓰지 않음 — 재저장으로 분기 귀속이 이동하는 버그 방지.

### 예시
| PT 진행일 | 실적 확정일 | 귀속 분기 | 급여 반영월 |
|---|---|---|---|
| 2026-02-15 | 2026-03-10 | 2026-Q1 | 2026-04 |
| 2025-12-20 | 2026-04-08 | **2026-Q2** | 2026-07 |
| 2026-01-20 | 2026-04-25 | **2026-Q2** | 2026-07 |

> ⚠ PT 를 언제 했느냐가 아니라 **결과를 언제 확정했느냐**가 기준.

---

## 2. 분기 마감일

분기 종료 후 **다음 달 30일** 까지 확정된 건만 해당 분기 집계에 포함.

| 분기 | 범위 | 마감일 | 급여 반영월 |
|---|---|---|---|
| Q1 | 1~3월 | 4월 30일 | 4월 |
| Q2 | 4~6월 | 7월 30일 | 7월 |
| Q3 | 7~9월 | 10월 30일 | 10월 |
| Q4 | 10~12월 | 다음해 1월 30일 | 1월 |

---

## 3. 금액 기준

| 결과 | 금액 |
|---|---|
| 승 | 500,000원 |
| 무 | 250,000원 |
| 지원 | 250,000원 |
| 패 | 0원 |
| 감리 (결과 무관) | 80,000원 |

### 지역별 단가 (감리 아닌 일반 PT 는 고정 금액 · 지역별 단가는 현설 정산용)
시스템 내 `showPriceTable` 모달 참조.

---

## 4. 제외 기준 (excludedReason)

아래 항목은 금액 0원 + excludedReason 영구 저장.

| excludedReason | 의미 | 판정 시점 |
|---|---|---|
| `self_pt` | 본인이 직접 진행한 PT | `pt.selfPT === true` |
| `self_sales` | 본인영업 체크 | `settlement.{a}.selfSales === true` |
| `vendor_self_pt` | 협약사 자체 PT | `pt.selfPT === true` (동일 체크박스) |
| `main_lost` | 지원자 — 주담당자 패배 | 주담 결과 === '패' |
| `draw_support_excluded` | 지원자 — 주담당자 무승부 | 주담 결과 === '무' (예외승인 없을 때) |
| `loss` | 본인이 패 | `result === '패'` |
| `cancelled_notice` | K-APT 취소공고 확인됨 | `pt.kaptVerified.status === 'cancelled'` |
| `unverified` | 검증 완료 안 됨 | K-APT/잔디/manualVerified 모두 없음 |

---

## 5. 지원 종속 규칙

**PT 에 주담당자 + 지원자 있을 때 지원자 정산은 주담 결과에 종속됨.**

| 주담 결과 | 지원자 처리 |
|---|---|
| 승 | 지원 인정 (250,000원) |
| 무 | 제외 (`draw_support_excluded`) — 관리자 예외승인 시만 지원 인정 |
| 패 | 지원자도 패 (`main_lost`, 0원) |
| 미입력 | 판정 대기 (`status='unsettled'`) |

### 주담당자 판별
`ptAssignee` 문자열의 첫 번째 토큰 (`/`, `,`, `+`, `&` 구분자 기준).  
예: `"한준엽/조재연"` → 주담 = 한준엽, 지원 = 조재연.

---

## 6. 정산 상태 모델 (6단계)

| status | 의미 | 다음 단계 |
|---|---|---|
| `unsettled` | 미정산 (결과 있으나 요청 전) | → requested |
| `needs_review` | 검토 필요 (미검증) | → requested (검증 후) or excluded |
| `requested` | 정산요청 (담당자 체크 or 자동) | → confirmed |
| `confirmed` | 정산확정 (관리자 확정) | → completed |
| `completed` | 정산완료 (지급 완료) | (최종) |
| `excluded` | 제외 | (최종) |

### 상태 전환 가드
- 결과 '승' + 미검증 → `needs_review` 로 고정 (requested 자동 차단)
- 감리 / 잔디 증빙 / K-APT verified → 자동 `requested`
- 관리자 수동 체크박스는 언제나 허용 (감사 로그 기록)

---

## 7. 검증 성공 조건 (K-APT)

다음 중 하나라도 만족 시 검증 완료 인정:
- **K-APT 자동 검증 성공** — `kaptVerified.status === 'verified'`
- **잔디 공고문 파일 매칭** — `pt.evidenceFiles` 에 파일 1개 이상
- **관리자 수동 승인** — `settlement.{a}.manualVerified === true`
- **감리 공종** — `workType` 또는 `siteName` 에 "감리" 포함 (자동 예외)
- **K-APT 취소공고 확인** — `kaptVerified.status === 'cancelled'` (제외로 분류)

---

## 8. 2라운드 담당자 확인 플로우

```
[Phase 1] 관리자: 분기정산 생성 (💰 분기정산 → 지금 생성)
   ↓
[Phase 2] 담당자 확인 (1라운드)
   잔디 자동 발송 → 마이페이지 [이상없음] / [검증·수정 요청]
   매일 09/17 KST 리마인드 (Worker cron)
   ↓
[Phase 3] 관리자: 검증요청 처리
   분기정산 모달에서 ⚠ 검증요청 [처리완료]
   ↓
[Phase 4] 담당자 최종 확정 (2라운드)
   관리자 [📝 최종확정 요청] → 담당자 [최종 확정]
   ↓
[Phase 5] 김유림 발송
   전원 finalConfirmed 확인 → 🚀 발송 (PDF + Excel + mailto)
   reportVersion 자동 증가, history 보존
```

### 관리자 긴급 우회 (비권장)
- [⚡ 전체 최종확정]: 담당자 확인 절차 건너뛰고 관리자 직권 처리
- 김유림 모달 [긴급 우회] 체크박스: 미확정 상태에서도 발송 허용
- 두 경우 모두 Activity Log · 잔디 알림으로 이력 기록

---

## 9. 분기 마감 정책 (closed)

관리자가 분기정산 모달에서 **[🔒 분기 마감]** 클릭 시:

- `quarterlySettlements/{qKey}/totals.closed = true`
- 이후 Firebase 수정 차단 (updateRowStatus / Backfill / 최종확정 등)
- 마감 전 체크: 자가확인 미완 / 검증요청 미처리 / 최종확정 미완 → 경고 후 진행
- 마감 잔디 이력 발송

### 마감 해제 (예외)
- **[🔓 마감 해제]** 클릭 → `closed=false` + `reopenedAt/reopenedBy` 기록
- 해제 시점 Activity Log 기록 → 감사 가능
- 남발 금지 (급여 반영 기준이 흔들림)

---

## 10. 김유림 산출물 (급여 전달)

### 고정 포맷
- **분기명** (YYYY-QN)
- **급여 반영월** (YYYY-MM)
- **마감일** (YYYY-MM-DD)
- **담당자별**: 승 / 무 / 지원 / 제외 / 검토필요 / 건수 / 지급합계
- **총합**
- **reportVersion** (v1, v2, ...)
- **sentAt / sentBy / reportedTo**
- **파일**: PDF + Excel 동시 다운로드 + mailto 링크

### 재발송 시
- `reportVersion` 자동 증가
- 이전 버전 `history/v{N}` 에 보존 (수정본 추적용)
- 담당자별 `reportedToPayroll` / `reportedAt` 자동 기록

---

## 11. 담당자별 개인 잔디 webhook

현재 등록된 9명:
- 김성민 · 송보람 · 이필선 · 정정훈 · 조재연 · 조현식 · 한인규 · 한준엽 · 황윤선

### 자동 발송 이벤트
1. **분기정산 생성 시**: 각자에게 본인 실적 요약 + 확인 요청
2. **검토요청 처리완료**: 관리자가 [처리완료] 눌렀을 때
3. **최종확정 요청 발송**: 관리자 [📝 최종확정 요청]
4. **Q2+ 자동 정산대상 전환**: K-APT 검증 성공 시점
5. **매일 09/17 KST 리마인드**: 마감일까지 미확인자

---

## 12. Activity Log (감사 추적)

Firebase `activityLog/` 노드에 자동 기록 (최근 100건 표시):

| event | 의미 |
|---|---|
| `result_input` | 결과 입력 (승/무/패/지원) |
| `settlement_requested` | 정산요청 체크 |
| `settlement_completed` | 정산완료 체크 |
| `quarter_closed` | 분기 마감 |
| `quarter_reopened` | 마감 해제 |
| `final_confirmed` | 담당자 최종 확정 |
| `manual_verified` | 관리자 수동 승인 |
| `candidate_selected` | K-APT 후보 선택 |
| `report_sent` | 김유림 발송 |

관리자 [📜 로그] 버튼으로 확인. who/when/what 한 줄 요약.

---

## 13. UAT (운영 투입 전 검증)

관리자 [🧪 UAT] 버튼 → 8가지 시나리오 자동 체크:

1. 승리+미검증 → needs_review 유지
2. 지원+주담 패배 → 정산 제외
3. selfPT/selfSales → 0원 + excludedReason
4. 과거 PT 이번 분기 확정 → 확정일 기준 귀속
5. 마감 분기 수정 가드
6. completed 우회 차단 (requested 선행)
7. reportedToPayroll 후 변경 (closed 필수)
8. calculatedAmount 영구 저장

운영 투입 전 반드시 통과 확인.

---

## 14. 분쟁 대응 지침

### "왜 내 정산이 적은가?"
1. 시스템 실적 카드에서 해당 PT 확인
2. `excludedReason` 표시 확인 (본인PT / 본인영업 / 주담패배 / 미검증 등)
3. 분기정산 모달에서 담당자별 상세 내역 조회
4. `calculatedAmount` 와 `confirmedAt/completedAt` 확인

### "왜 이번 분기 집계가 달라 보이나?"
1. 확정일 기준이지 PT일 기준이 아님을 확인 (§1)
2. 마감일 이후 확정된 건은 다음 분기
3. UAT 러너로 데이터 건전성 체크

### "김유림에게 보낸 자료가 달라졌다"
1. 분기보고서 모달 상단 `reportVersion` 확인
2. 이전 버전 이력에서 발송 시각·금액 비교
3. Activity Log `report_sent` 이벤트 확인

---

## 15. 관리자 체크리스트 (매 분기)

### 분기 초 (예: 1분기는 4월 첫째주)
- [ ] 이전 분기 데이터 최종 확인
- [ ] 담당자 9명 잔디 webhook 정상 작동 체크

### 분기 마감 주 (예: 1분기는 4/24 직전)
- [ ] [💰 분기정산] → [지금 생성]
- [ ] 검토필요 건 처리 (K-APT 검증 / 취소공고 마킹 / 수동 승인)
- [ ] [📝 최종확정 요청] 발송 → 담당자 응답 대기
- [ ] 미응답자 리마인드 (자동 or 개별 연락)

### 마감일 당일 (마지막주 월요일)
- [ ] [🧪 UAT] 8개 시나리오 통과 확인
- [ ] 전원 최종확정 확인
- [ ] 김유림 분기보고서 발송 (PDF + Excel + mailto)
- [ ] [🔒 분기 마감] 실행
- [ ] Activity Log 확인

### 필요 시 (드물게)
- 마감 해제: [🔓 마감 해제] (이력 남음, 남발 금지)
- 긴급 우회 발송: 김유림 모달 체크박스

---

## 16. 시스템 접근 경로 (관리자)

```
상단 헤더
  🏠 메인 · 일정 · 파이프라인 · 📊 실적 · 🏠 회의 · 설정
  [김유림 분기보고서] [📈 분석] [🧪 UAT] [📜 로그] [📋 예외]

실적 페이지
  └ 상단 요약바 (분기 승/무/패/지원 + 예상금액)
  └ 상태 탭: 전체 · 승 · 무 · 패 · 지원 · 진행중 · ⚠ 미검증
  └ 정산 필터: 전체 · 정산대상 · 미정산 · 정산요청 · 정산완료

관리자 분기정산 모달 (💰)
  [지금 생성] [일괄 확정] [📝 최종확정 요청] [⚡ 전체 최종확정] [🔧 Backfill] [🔒 분기 마감]
  · 담당자별 행: 검토요청 확장 / 상태 변경 / 수동 액션
  · 메타 배너: 분기 / 마감일 / 급여반영월 / 집계기준 / 신뢰도
```

---

## 17. 운영 기술 스택

- **프런트엔드**: React (Vite) · Firebase Web SDK · Cloudflare Pages
- **데이터**: Firebase Realtime Database · Firebase Storage (공고문)
- **Worker**: Cloudflare Worker (kapt-verify-worker) — K-APT 검증 / 분기정산 / cron
- **알림**: 잔디 Incoming Webhook (관리자 + 담당자 9명 개인 채널)
- **분기정산 cron**: 매주 월요일 09:00 KST (분기 마지막월 마지막주만 실행)
- **리마인드 cron**: 매일 09/17 KST (미확인자만)

---

**최종 업데이트:** 2026-04-22  
**작성자:** 관리자 + Claude Code (AI-assisted)  
**저장소:** `OPERATIONS.md` @ main branch  
**변경 시 반드시**: 영업팀 공지 + Activity Log 기록
