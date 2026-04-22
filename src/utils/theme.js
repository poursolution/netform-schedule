// 디자인 토큰 — IT 팔레트 (Deep Space / Royal Blue / Sky Focus / Soft Cloud)
// 역할 기반 네이밍으로 장기 유지보수성 확보.
//
// 사용 원칙:
//   1) 의미 색상 (의도)은 절대 건드리지 않음 — 메인 일정 색/승패 색 등
//   2) 여기 정의된 토큰 외 임의 hex 쓰지 않음 (예외: 일회성 실험)
//   3) 새 UI 만들 때는 이 토큰 먼저 확인 후 없으면 추가
//
// 이식 우선순위: 신규 컴포넌트 → 최근 수정된 부분 → 전체 점진 이식.

// ====== 원색 팔레트 (레퍼런스용 — 직접 쓰지 말고 아래 역할 토큰으로) ======
export const PALETTE = {
  deepSpace: '#1B262C',
  royalBlue: '#0F4C75',
  skyFocus: '#3282B8',
  softCloud: '#BBE1FA',
};

// ====== 역할 기반 토큰 ======

// 브랜드 — 핵심 CTA · 활성 탭 · 포커스 링
export const brandPrimary = '#0F4C75';      // Royal Blue
export const brandSecondary = '#3282B8';    // Sky Focus
export const brandDark = '#1B262C';         // Deep Space

// 표면(배경)
export const surfaceBase = '#ffffff';        // 기본 카드/패널
export const surfaceMuted = '#f8fafc';       // 2차 배경 (구분선 대체)
export const surfaceAccent = '#BBE1FA';      // 강조 배경 (선택된 상태 등)

// 테두리
export const borderDefault = '#e2e8f0';      // 기본
export const borderStrong = '#cbd5e1';       // 강조

// 텍스트
export const textPrimary = '#1e293b';        // 본문 본색
export const textSecondary = '#64748b';      // 보조 설명
export const textMuted = '#94a3b8';          // 비활성 · 힌트
export const textOnBrand = '#ffffff';        // brandPrimary 배경 위

// 의미 색상 (절대 변경 금지 — 승패/정산 상태/리스크 의미를 전달)
export const semantic = {
  success: '#16a34a',       // 승 / 정산완료
  successBg: '#dcfce7',
  warning: '#d97706',       // 무 / 주의
  warningBg: '#fef3c7',
  danger: '#b91c1c',        // 패 / 미설정
  dangerBg: '#fef2f2',
  info: '#0F4C75',          // 정산요청 (Royal Blue)
  infoBg: '#dbeafe',
};

// ====== 공용 프리셋 ======

// 관리자 버튼 — 아웃라인 (Royal Blue)
export const adminOutlineButton = {
  background: surfaceBase,
  color: brandPrimary,
  border: `1px solid ${brandPrimary}`,
  borderRadius: '8px',
  fontWeight: '600',
  cursor: 'pointer',
};

// 관리자 버튼 — 경고(노랑)
export const adminWarnButton = {
  background: semantic.warningBg,
  color: '#b45309',
  border: '1px solid #f59e0b',
  borderRadius: '8px',
  fontWeight: '600',
  cursor: 'pointer',
};

// 관리자 버튼 — 오류(빨강)
export const adminDangerButton = {
  background: semantic.dangerBg,
  color: semantic.danger,
  border: '1px solid #fca5a5',
  borderRadius: '8px',
  fontWeight: '600',
  cursor: 'pointer',
};

// 카운트 배지 — 브랜드
export const countBadge = {
  background: brandPrimary,
  color: textOnBrand,
  fontSize: 10,
  padding: '1px 6px',
  borderRadius: 10,
  marginLeft: 4,
  fontWeight: 700,
};
