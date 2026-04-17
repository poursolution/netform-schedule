# 영업일정관리 - Vite 버전 (파일 분리)

파일별로 분리되어 있어서 **수정이 필요할 때 해당 파일만 찾아서 수정**하면 됩니다.

## 📁 프로젝트 구조

```
src/
├── App.jsx             # 메인 앱
├── main.jsx            # 진입점
├── styles.css          # 스타일
│
├── components/         # UI 컴포넌트
│   ├── Header.jsx      # 헤더, 네비게이션
│   ├── Calendar.jsx    # 캘린더 뷰
│   ├── ListView.jsx    # 리스트 뷰
│   ├── Performance.jsx # 실적관리
│   └── MeetingView.jsx # 회의관리
│
├── modals/             # 모달
│   ├── LoginModal.jsx      # 로그인
│   ├── ScheduleModal.jsx   # 일정 추가/수정
│   ├── SettingsModal.jsx   # 설정
│   └── PasswordModal.jsx   # 비밀번호 변경
│
├── hooks/              # 비즈니스 로직
│   ├── useSchedules.js # 일정 CRUD
│   ├── useMeetings.js  # 회의 관리
│   └── useAuth.js      # 로그인/계정
│
└── utils/              # 유틸리티
    ├── constants.js    # ⭐ 담당자, 계정, 단가 등
    ├── firebase.js     # Firebase 설정
    └── helpers.js      # 헬퍼 함수
```

## 🔧 수정 가이드

| 수정 내용 | 파일 |
|----------|------|
| 담당자 목록 | `utils/constants.js` |
| 계정 추가/수정 | `utils/constants.js` |
| 지역별 단가 | `utils/constants.js` |
| Firebase 설정 | `utils/firebase.js` |
| PT/현설/개인 폼 | `modals/ScheduleModal.jsx` |
| 캘린더 UI | `components/Calendar.jsx` |
| 리스트 UI | `components/ListView.jsx` |
| 실적관리 | `components/Performance.jsx` |
| 회의관리 | `components/MeetingView.jsx` |
| 헤더/메뉴 | `components/Header.jsx` |

## 🚀 시작하기

```bash
# 1. 의존성 설치
npm install

# 2. 개발 서버
npm run dev

# 3. 빌드
npm run build
```

## 📱 포함된 기능

- PT/현설/개인 일정 관리
- 회의 관리 (참석여부 체크)
- 실적 관리 (승/무/패/지원)
- 캘린더/리스트 뷰
- 필터링 (담당자, 공종, 기간)
- 구글시트 가져오기/내보내기
- 로그인/계정관리
- PWA 지원
- Firebase 실시간 동기화

## 🔄 Claude에게 수정 요청하기

파일들을 압축해서 업로드하고 요청하세요:
- "constants.js에 담당자 '홍길동' 추가해줘"
- "ScheduleModal.jsx PT폼에 '계약금액' 필드 추가해줘"
- "Performance.jsx에 월별 그래프 추가해줘"
