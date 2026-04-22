// 아파트 단지명 매칭 공용 유틸 (P1)
// 기존 중복 작성된 유사도/normalize 로직을 이곳으로 일원화.
// 화면·스크립트에서 직접 쓰지 말고 반드시 이 파일 함수를 import 해서 사용.
//
// 사용처:
//  - App.jsx 실적 매칭 / K-APT 후보 검색 / 잔디 파일 매칭
//  - src/utils/jandiFileParser.js (레거시)
//  - src/utils/verdictEngine.js (판정은 그대로 — 이건 단지명 매칭과 다름)
//  - playwright-server/server.js · cloudflare-worker 는 독립 런타임이라 복제 필요

// ===== 상수 =====

// 후행어 (단지명 끝에 자주 붙는 접미사 — normalize 시 제거)
const TRAILING_SUFFIXES = [
  '아파트', 'APT', 'apt',
  '오피스텔', '주상복합', '타운하우스',
  '1단지', '2단지', '3단지', '4단지', '5단지',
  '6단지', '7단지', '8단지', '9단지', '10단지',
  // 단지는 숫자 분리로도 처리되지만 후행어 패턴으로도 시도
];

// 자주 쓰이는 브랜드명 (토큰 추출 우선순위용)
// src/utils/technologies.js 와 별개 — 경쟁사 포함
export const BRAND_TOKENS = [
  // 대형 브랜드
  '푸르지오', '더샵', '아이파크', '센트럴파크', '이편한세상', 'e편한세상', 'e 편한세상',
  '래미안', '자이', 'SK뷰', 'SK VIEW', '힐스테이트', '롯데캐슬', '두산위브',
  '리슈빌', '포스코', '더클래식', '시티자이', '시티파크', '금호어울림', '호반베르디움',
  '베르디움', '모아엘가', '한라비발디', '한양수자인', '우미린', '아너스빌',
  '서해그랑블', '한신휴플러스', '어울림', '휴먼빌', '코오롱하늘채', '위브', '위브트레지움',
  '롯데아파트', '경남아너스빌', '센트레빌', '네오하우스', '센트로하임', '지웰시티',
  '현대아파트', '현대1차', '푸르지오써밋',
  // 추가될 수 있음 — alias 사전과 함께 관리
];

// ===== normalize =====

/**
 * 아파트 단지명 정규화 — 매칭용 표준 형태로 변환.
 *  - 공백/특수문자/괄호 제거
 *  - 후행어('아파트', 'APT' 등) 제거
 *  - 한영 대소문자 통일 (소문자)
 *  - "제2"·"2차"·"2단지" 등 숫자표기 보존하되 구분자 제거
 *  - "N동"·"N차"·"N단지" 숫자+접미어 묶음 유지 (오매칭 방지)
 *
 * 예시:
 *   "산들마을 서광청구 아파트"        → "산들마을서광청구"
 *   "거제 덕산아내프리미엄 1차 아파트" → "거제덕산아내프리미엄1차"
 *   "e편한세상밀양삼문"               → "e편한세상밀양삼문"
 */
export function normalizeApartmentName(name) {
  if (!name) return '';
  let s = String(name);

  // 1) 괄호·대괄호 및 그 안 내용 제거 (예: "(주)", "[재건축]")
  s = s.replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, '');

  // 2) 특수문자 제거 (하이픈·슬래시·쉼표·점·공백은 일단 유지)
  s = s.replace(/[·ㆍ•∙·‧⋅]/g, '');
  s = s.replace(/[,.;:!?"'"'`]/g, '');

  // 3) 모든 공백 제거
  s = s.replace(/\s+/g, '');

  // 4) 소문자화 (영문)
  s = s.toLowerCase();

  // 5) 후행어 제거 (긴 것 먼저 매칭)
  const sortedSuffixes = [...TRAILING_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suffix of sortedSuffixes) {
    const lower = suffix.toLowerCase();
    while (s.endsWith(lower)) {
      s = s.slice(0, -lower.length);
    }
  }

  // 6) "제2차"·"제N차" 의 "제" 제거
  s = s.replace(/제(\d+)(차|단지|동)/g, '$1$2');

  // 7) 맨 뒤 "-" "_" 제거
  s = s.replace(/[-_]+$/, '');

  return s;
}

/**
 * 단지명에서 토큰 추출.
 *  - 지역 prefix (예: "거제", "용인")
 *  - 브랜드 토큰 (예: "푸르지오", "SK뷰")
 *  - 단지번호/차수 (1차 / 2단지 등)
 *  - 핵심명 (나머지)
 *
 * 예: "거제 덕산아내프리미엄 1차 아파트"
 *   → { region: '거제', core: '덕산아내프리미엄', unit: '1차', brand: null }
 */
export function extractApartmentTokens(name) {
  const normalized = normalizeApartmentName(name);
  const tokens = {
    raw: String(name || ''),
    normalized,
    region: null,
    brand: null,
    core: normalized,
    unit: null,  // "1차" / "2단지" 등
    unitNumber: null,  // 1, 2, 3 숫자
    unitSuffix: null,  // "차" / "단지" / "동"
  };

  // 단지번호/차수 추출 (끝에 있는 것 우선)
  const unitMatch = normalized.match(/(\d+)(차|단지|동)$/);
  if (unitMatch) {
    tokens.unit = unitMatch[0];
    tokens.unitNumber = parseInt(unitMatch[1], 10);
    tokens.unitSuffix = unitMatch[2];
    tokens.core = normalized.slice(0, normalized.length - unitMatch[0].length);
  }

  // 브랜드 추출 — core 안에 알려진 브랜드 포함되어 있으면 표시
  for (const brand of BRAND_TOKENS) {
    const brandNorm = brand.toLowerCase().replace(/\s+/g, '');
    if (tokens.core.includes(brandNorm)) {
      tokens.brand = brand;
      break;
    }
  }

  return tokens;
}

// ===== alias =====

/**
 * aliasMap 에서 양방향 alias 조회.
 *  aliasMap 구조:
 *    {
 *      "산들마을서광청구": ["산들마을2단지청구"],
 *      "산들마을2단지청구": ["산들마을서광청구"]
 *    }
 *  이미 양방향으로 저장되어 있다고 가정. 저장 시 양쪽 모두 저장하는 헬퍼 별도.
 *
 * @returns {string[]} — 정규화된 alias 목록 (입력값 자체는 제외)
 */
export function getApartmentAliases(name, aliasMap) {
  if (!name || !aliasMap) return [];
  const key = normalizeApartmentName(name);
  const list = aliasMap[key];
  return Array.isArray(list) ? list.filter(a => a && a !== key) : [];
}

/**
 * 수동 매칭 승인 시 alias 양방향 저장.
 *  @returns 갱신된 aliasMap (immutable 스타일 — 호출자가 Firebase 에 PATCH 하면 됨)
 */
export function addApartmentAlias(aliasMap, nameA, nameB) {
  const a = normalizeApartmentName(nameA);
  const b = normalizeApartmentName(nameB);
  if (!a || !b || a === b) return aliasMap;
  const out = { ...(aliasMap || {}) };
  const listA = new Set(out[a] || []);
  const listB = new Set(out[b] || []);
  listA.add(b);
  listB.add(a);
  out[a] = [...listA];
  out[b] = [...listB];
  return out;
}

// ===== 유사도 계산 (기존 substring + subsequence 엔진) =====

function similarityRaw(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  // substring 공통
  let best = 0;
  for (let len = shorter.length; len >= 3 && len > best; len--) {
    for (let i = 0; i + len <= shorter.length; i++) {
      if (longer.includes(shorter.slice(i, i + len))) { best = len; break; }
    }
  }
  const subScore = best / longer.length;
  // subsequence
  let seq = 0;
  if (shorter.length >= 4) {
    let i = 0, j = 0, m = 0;
    while (i < shorter.length && j < longer.length) {
      if (shorter[i] === longer[j]) { m++; i++; }
      j++;
    }
    if (i === shorter.length) {
      seq = m / longer.length;
      if (shorter.length / longer.length >= 0.5) seq = Math.max(seq, 0.85);
    }
  }
  return Math.max(subScore, seq);
}

// ===== scoreApartmentMatch (핵심 함수) =====

/**
 * PT 레코드와 공고(bid)/후보 evidence 를 매칭하고 종합 점수 반환.
 *
 * @param {Object} pt — { siteName, address, workType, date }
 * @param {Object} bid — { siteName | bidKaptname | parsedSiteName, address?, bidTitle?, workType?, bidRegdate? }
 * @param {Object} aliasMap — apartmentAliasMap (optional)
 * @returns {Object} {
 *   score: 0~1,
 *   breakdown: { name, alias, token, brand, unit, region, address, workType, date },
 *   matchedVia: 'alias' | 'name' | 'token' | ...
 * }
 */
export function scoreApartmentMatch(pt, bid, aliasMap) {
  const ptName = pt?.siteName || pt?.parsedSiteName || '';
  const bidName = bid?.siteName || bid?.bidKaptname || bid?.parsedSiteName || '';

  const ptNorm = normalizeApartmentName(ptName);
  const bidNorm = normalizeApartmentName(bidName);

  const ptTok = extractApartmentTokens(ptName);
  const bidTok = extractApartmentTokens(bidName);

  const breakdown = {
    name: 0,         // 정규화 이름 유사도
    alias: 0,        // alias 매칭 시 1.0 bonus
    core: 0,         // core 단어 매칭
    unit: 0,         // 단지번호/차수 일치
    brand: 0,        // 브랜드명 일치
    region: 0,       // 주소 내 지역 키워드 일치
    address: 0,      // 주소 substring 유사도
    workType: 0,     // 공종 키워드 매칭
    date: 0,         // PT일자 ↔ 공고일 근접
  };

  // 1) 정규화 이름 유사도
  breakdown.name = similarityRaw(ptNorm, bidNorm);

  // 2) alias 직접 매칭
  if (aliasMap) {
    const aliases = getApartmentAliases(ptName, aliasMap);
    if (aliases.includes(bidNorm)) breakdown.alias = 1;
  }

  // 3) core 유사도
  breakdown.core = similarityRaw(ptTok.core, bidTok.core);

  // 4) 단지번호/차수 일치
  if (ptTok.unitNumber != null && bidTok.unitNumber != null) {
    if (ptTok.unitNumber === bidTok.unitNumber) {
      breakdown.unit = 1;  // 정확 일치
    } else {
      breakdown.unit = -0.3;  // 단지번호 다르면 감점 (같은 브랜드 다른 단지)
    }
  } else if (ptTok.unitNumber != null || bidTok.unitNumber != null) {
    breakdown.unit = 0.3;  // 한쪽만 있음 → 중립(부분 점수)
  }

  // 5) 브랜드 일치
  if (ptTok.brand && bidTok.brand && ptTok.brand === bidTok.brand) {
    breakdown.brand = 1;
  }

  // 6) 지역 / 주소
  const ptAddr = (pt?.address || '').toLowerCase();
  const bidAddr = (bid?.address || '').toLowerCase();
  if (ptAddr && bidAddr) {
    breakdown.address = similarityRaw(ptAddr, bidAddr);
  }
  // 지역 키워드 (ptName 앞 2~3 한글이 bidAddr 에 포함되는지)
  const firstTok = ptName.match(/^[가-힣]{2,3}/)?.[0];
  if (firstTok && bidAddr.includes(firstTok)) breakdown.region = 0.7;
  else if (firstTok && bidName.includes(firstTok)) breakdown.region = 0.4;

  // 7) workType 매칭 (공종 키워드 일치)
  const ptWt = (pt?.workType || '').replace(/\s+/g, '');
  const bidWt = (bid?.workType || bid?.bidTitle || '').replace(/\s+/g, '');
  if (ptWt && bidWt) {
    const ptWtTokens = ptWt.split(/[,/]/);
    for (const tok of ptWtTokens) {
      if (tok && bidWt.includes(tok)) { breakdown.workType = 0.5; break; }
    }
  }

  // 8) 날짜 근접도 (±90일 이내)
  if (pt?.date && bid?.bidRegdate) {
    try {
      const d1 = new Date(pt.date).getTime();
      const d2 = new Date(bid.bidRegdate).getTime();
      if (d1 && d2) {
        const daysDiff = Math.abs(d1 - d2) / 86400000;
        if (daysDiff <= 30) breakdown.date = 1;
        else if (daysDiff <= 90) breakdown.date = 0.5;
        else if (daysDiff <= 180) breakdown.date = 0.2;
      }
    } catch (_) {}
  }

  // ===== 종합 점수 =====
  // alias 매칭이면 최우선 (1.0)
  if (breakdown.alias === 1) {
    return {
      score: 1,
      breakdown,
      matchedVia: 'alias',
    };
  }

  // 가중 평균 (primary signals + secondary bonuses)
  //  name/core 가 중심 (70%)
  //  unit 일치 여부 (+15%)
  //  brand/region/workType/address/date 는 보조 (+15% 합)
  const primary = Math.max(breakdown.name, breakdown.core);
  const secondary = Math.max(0,
    breakdown.unit * 0.15 +
    breakdown.brand * 0.05 +
    breakdown.region * 0.05 +
    breakdown.address * 0.05
  );
  // workType/date 는 tie-breaker
  const tieBreak = breakdown.workType * 0.03 + breakdown.date * 0.02;

  let score = primary * 0.72 + secondary + tieBreak;
  // unit 이 -0.3 감점일 때 (단지번호 다름) 최대치 제한
  if (breakdown.unit < 0) score = Math.min(score, 0.75);
  score = Math.max(0, Math.min(1, score));

  return {
    score: Number(score.toFixed(3)),
    breakdown,
    matchedVia: primary === breakdown.name ? 'name' : 'core',
  };
}

// ===== 편의 함수 =====

/**
 * 주 담당자 추출 — ptAssignee 의 첫 토큰 (split '/', ',', '+', '&')
 */
export function getMainAssignee(pt) {
  const raw = pt?.ptAssignee || '';
  const tokens = raw.split(/[\/,+&]/).map(t => t.trim()).filter(Boolean);
  return tokens[0] || null;
}
