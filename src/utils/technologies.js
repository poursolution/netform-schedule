// 우리 회사 공법 (POUR솔루션 / 넷폼R&D 보유 특허 5종)
// 출처: 전체특허리스트_26.03.27.xlsx
// - POUR 공법 (40 특허)
// - CNC 공법 (10 특허)
// - DO 공법 (13 특허)
// - DETEX 공법 (10 특허)
// - 시멘트분말 (15 특허)
// 입찰 공고문에 위 키워드 중 하나라도 포함되면 "우리 공법으로 입찰" 인정

export const OUR_TECHNOLOGIES = ['POUR', 'CNC', 'DO', 'DETEX', '시멘트분말'];

// 입찰공고에 표기될 수 있는 변형 (영문/한글/축약)
const TECHNOLOGY_ALIASES = {
  'POUR': ['POUR', '포어'],
  'CNC': ['CNC'],
  'DO': ['DO'],
  'DETEX': ['DETEX', '디텍스'],
  '시멘트분말': ['시멘트분말', '시멘트 분말', 'CEMENT POWDER'],
};

// 정규화: 입찰공고 텍스트의 한 항목이 우리 공법인지 판별 + 매칭된 정식 공법명 반환
// "POUR + α" 같은 복합 표기도 처리
export function matchOurTechnology(rawMethod) {
  if (!rawMethod) return null;
  const upper = String(rawMethod).toUpperCase().trim();
  for (const tech of OUR_TECHNOLOGIES) {
    const aliases = TECHNOLOGY_ALIASES[tech] || [tech];
    for (const alias of aliases) {
      const aliasUpper = alias.toUpperCase();
      if (upper === aliasUpper) return tech;
      // 단어 경계 매칭 (DO 같은 짧은 명칭 false positive 방지)
      const re = new RegExp(`(^|[^A-Z가-힣])${escapeRegex(aliasUpper)}([^A-Z가-힣]|$)`);
      if (re.test(upper)) return tech;
    }
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 결과 자동 판정 (공법 배열 입력 → 승/무/패)
//  - 우리 공법(POUR/CNC/DO/DETEX/시멘트분말) 중 하나라도 있고 다른 공법 없음 → 승
//  - 우리 공법 + 타공법 동시 입찰 → 무
//  - 우리 공법 전혀 없음 → 패
export function judgeResultByMethods(methods) {
  if (!methods || methods.length === 0) return null;
  const ourMatched = [];
  const others = [];
  methods.forEach(m => {
    const matched = matchOurTechnology(m);
    if (matched) ourMatched.push(matched);
    else if (m && String(m).trim()) others.push(String(m).trim());
  });
  if (ourMatched.length === 0) return '패';
  if (others.length === 0) return '승';
  return '무';
}

// PT 데이터에서 우리 공법 추출 (집계용)
// announcementMethods는 콤마 구분 문자열
export function extractOurTechnologies(announcementMethods) {
  if (!announcementMethods) return [];
  const items = String(announcementMethods).split(/[,/+]/).map(s => s.trim()).filter(Boolean);
  const matched = new Set();
  items.forEach(item => {
    const m = matchOurTechnology(item);
    if (m) matched.add(m);
  });
  return Array.from(matched);
}

// 공법별 라벨 색상 (보고서/UI용)
export const TECHNOLOGY_COLORS = {
  'POUR': { bg: '#dbeafe', text: '#1d4ed8' },
  'CNC': { bg: '#dcfce7', text: '#15803d' },
  'DO': { bg: '#fef3c7', text: '#a16207' },
  'DETEX': { bg: '#fce7f3', text: '#be185d' },
  '시멘트분말': { bg: '#e0e7ff', text: '#4338ca' },
};
