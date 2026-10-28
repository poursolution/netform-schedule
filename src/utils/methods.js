// 공고문 기재 공법 — 칩 UI 용 분류 (결과 기록 모달 #10a · 일정 모달 #7a 공용).
// 판정은 technologies.js judgeResultByMethods 를 그대로 쓴다.

import { matchOurTechnology } from './technologies.js';

export const OUR_CHIPS = ['POUR', 'CNC', 'DO', 'DETEX'];
export const OTHER_CHIPS = ['4A시스템', '금영ENC'];

// 저장 문자열("POUR공법, 4A시스템, XX") → { chips: 칩 이름[], etc: 직접 입력 공법[] }
export function parseMethods(value) {
  const tokens = (Array.isArray(value) ? value : String(value || '').split(','))
    .map(s => String(s).trim()).filter(Boolean);
  const chips = [];
  const etc = [];
  for (const t of tokens) {
    // 기존 데이터의 "POUR공법" 같은 표기도 칩으로 (끝의 "공법"을 떼고 판별)
    const ours = matchOurTechnology(t) || matchOurTechnology(t.replace(/\s*공법$/, ''));
    let chip = null;
    if (ours && OUR_CHIPS.includes(ours)) chip = ours;
    else if (/4A/i.test(t)) chip = '4A시스템';
    else if (/금영/.test(t)) chip = '금영ENC';
    if (chip) { if (!chips.includes(chip)) chips.push(chip); }
    else if (!etc.includes(t)) etc.push(t);
  }
  return { chips, etc };
}

export function joinMethods(chips, etc) {
  return [...chips, ...etc].join(', ');
}
