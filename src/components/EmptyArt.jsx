import React from 'react';

// 빈 상태 선화 — 아이소메트릭 얇은 선(자료정리함 HAIRLINE 스타일)을 직접 그린 SVG.
// 장식이라 aria-hidden, 색은 brand 선 + accent 면. 문구는 그림 아래 기존 텍스트 그대로.

const STROKE = '#0F4C75';
const FILL = '#eef5fb';
const ACC = '#BBE1FA';

const ART = {
  // 달력 블록 — 일정 없음
  calendar: (
    <>
      <path d="M14 30 L48 12 L82 30 L48 48 Z" fill={FILL} />
      <path d="M14 30 L14 40 L48 58 L82 40 L82 30" fill="#fff" />
      <path d="M14 30 L48 12 L82 30 L48 48 Z M14 30 L14 40 L48 58 L82 40 L82 30 M48 48 L48 58" />
      <path d="M30 24 L30 16 M48 15 L48 7 M64 24 L64 16" />
      <path d="M33 33 l6 -3 M45 39 l6 -3 M45 27 l6 -3 M57 33 l6 -3" stroke={ACC} strokeWidth="2.4" />
    </>
  ),
  // 돋보기 + 카드 — 조건에 맞는 결과 없음
  search: (
    <>
      <path d="M12 36 L40 22 L62 33 L34 47 Z" fill={FILL} />
      <path d="M12 36 L40 22 L62 33 L34 47 Z M12 36 L12 40 L34 51 L62 37 L62 33" />
      <path d="M22 37 l14 -7 M27 40 l14 -7" stroke={ACC} strokeWidth="2.4" />
      <circle cx="66" cy="22" r="11" fill="#fff" />
      <circle cx="66" cy="22" r="11" />
      <path d="M74 30 L84 40" strokeWidth="2.6" />
    </>
  ),
  // 체크 클립보드 — 처리할 것 없음(다 끝남)
  done: (
    <>
      <path d="M22 26 L50 12 L76 25 L48 39 Z" fill={FILL} />
      <path d="M22 26 L22 34 L48 47 L76 33 L76 25" fill="#fff" />
      <path d="M22 26 L50 12 L76 25 L48 39 Z M22 26 L22 34 L48 47 L76 33 L76 25 M48 39 L48 47" />
      <path d="M38 25 L45 29 L60 20" stroke="#15803d" strokeWidth="2.6" />
      <path d="M8 46 l5 -2.5 M84 44 l5 2.5 M50 54 l0 5" stroke={ACC} />
    </>
  ),
};

export default function EmptyArt({ kind = 'search', size = 88, style }) {
  return (
    <svg aria-hidden="true" width={size} height={size * 0.68} viewBox="0 0 96 64" fill="none" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', margin: '0 auto 10px', opacity: 0.9, ...style }}>
      {ART[kind] || ART.search}
    </svg>
  );
}
