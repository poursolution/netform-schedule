// 공고문·첨부파일 판정 엔진 (3단계 신호 체계 + 점수제)
//
// 분석서 피드백 반영:
//  - "기술사용 협약" 같은 일반 표현은 단독 매칭 금지 (너도나도 검색됨)
//  - STRONG(강한 신호, +10, 단독 확정) / COMBO(결합 시 +8, strong 과 ±200자 이내 있어야 유효) / WEAK(+3, 점수만 기여)
//  - 판정:
//     our≥10 & competitor=0 → win
//     our≥10 & competitor≥10 → draw
//     our=0 & competitor≥10 → loss
//     애매(our 3~9, 혼재, 첨부 미확보 등) → needs_review  (절대 자동 loss 금지)
//
// 세 곳에서 재사용:
//  - src/App.jsx (UI 에서 직접 호출 시)
//  - cloudflare-worker/src/index.js (Worker 런타임 — import 불가라 복사)
//  - playwright-server/server.js (VPS 런타임 — import 불가라 복사)

// ===== 우리 공법/특허 사전 =====
export const OUR_STRONG_PATTERNS = [
  // 공법명 (단독 유효, +10)
  { re: /POUR\s*공법/i, label: 'POUR공법', w: 10 },
  { re: /포어\s*공법/, label: '포어공법', w: 10 },
  { re: /POUR\s*솔루션/i, label: 'POUR솔루션', w: 10 },
  { re: /POUR\s*시스템/i, label: 'POUR시스템', w: 10 },
  { re: /CNC\s*공법/i, label: 'CNC공법', w: 10 },
  { re: /DO\s*공법/i, label: 'DO공법', w: 10 },
  { re: /DETEX\s*공법/i, label: 'DETEX공법', w: 10 },
  { re: /DETEX\s*시스템/i, label: 'DETEX시스템', w: 10 },
  { re: /시멘트\s*분말/, label: '시멘트분말공법', w: 10 },
];

// 우리 특허번호 (정확 매칭 — 숫자 그대로)
export const OUR_PATENT_NUMBERS = [
  '10-1520738','10-1703553','10-1828211','10-1831299','10-1883132','10-1885983','10-1905536','10-1923102','10-1935719','10-1994773',
  '10-2119347','10-2122691','10-2122700','10-2272203','10-2274045','10-2320426','10-2345836','10-2398289','10-2398296','10-2398304',
  '10-2425081','10-2425088','10-2474761','10-2516517','10-2532155','10-2535699','10-2536398','10-2539919','10-2541308','10-2544157',
  '10-2544161','10-2562854','10-2562855','10-2574833','10-2574836','10-2586662','10-2603257','10-2614027','10-2643734','10-2664685',
  '10-2664703','10-2694890','10-2680047','10-2677910','10-2699417','10-2709702','10-2709705','10-2715409','10-2743867','10-2780472',
  '10-2784426','10-2793770','10-2803706','10-2805601','10-2820585','10-2816037','10-2826539','10-2844945','10-2846086','10-2856577',
  '10-2856580','10-2856581','10-2856582','10-2856572','10-2859388','10-2856575','10-2859385','10-2859386','10-2859390','10-2861078',
  '10-2862312','10-2865278','10-2865281','10-2870425','10-2870421','10-2869493','10-2888024','10-2893921','10-2896797','10-2900226',
  '10-2907890','10-2914079','10-2917109','10-2917107','10-2937091',
];
const OUR_PATENT_SET = new Set(OUR_PATENT_NUMBERS);

// 일반 표현 — 단독이면 무효, STRONG 과 ±200자 이내 있을 때만 +8 (오탐 방지 핵심)
export const OUR_COMBO_PATTERNS = [
  { re: /기술사용\s*협약/, label: '기술사용 협약', w: 8 },
  { re: /기술\s*협약\s*(서|체결)/, label: '기술 협약서/체결', w: 8 },
  { re: /협약서\s*발행/, label: '협약서 발행', w: 8 },
  { re: /기술사용\s*승인/, label: '기술사용 승인', w: 8 },
  { re: /기술사용\s*확인서?/, label: '기술사용 확인서', w: 8 },
];

// 약한 신호 — 점수만 기여 (+3), 단독 확정 금지
export const OUR_WEAK_PATTERNS = [
  { re: /넷폼/, label: '넷폼(브랜드)', w: 3 },
  { re: /(주)\s*넷폼/, label: '(주)넷폼', w: 3 },
  { re: /\bPOUR\b/i, label: 'POUR(단독)', w: 3 },  // "POUR공법" 등은 이미 strong에서 잡힘
];

// ===== 경쟁사 =====
export const COMPETITOR_STRONG_PATTERNS = [
  { re: /우레탄\s*(방수|공법|복합|도막)/, label: '우레탄 공법', w: 10 },
  { re: /실리콘\s*(방수|공법)/, label: '실리콘 방수', w: 10 },
  { re: /아스팔트\s*(방수|공법|재포장)/, label: '아스팔트 공법', w: 10 },
  { re: /에폭시\s*(방수|공법|도막)/, label: '에폭시 공법', w: 10 },
  { re: /FRP\s*방수/i, label: 'FRP 방수', w: 10 },
  { re: /시트\s*방수/, label: '시트 방수', w: 10 },
  { re: /복합\s*시트\s*방수/, label: '복합시트 방수', w: 10 },
  { re: /노출\s*우레탄/, label: '노출 우레탄', w: 10 },
];

// ===== 유틸 =====
function norm(text) {
  return String(text || '').replace(/\s+/g, ' ');
}

// 두 위치가 ±200자 이내인지 (COMBO 결합 거리)
function within(a, b, maxDist = 200) {
  return Math.abs(a - b) <= maxDist;
}

// 특허번호 추출 (10-XXXXXXX 형식)
function extractPatents(text) {
  const matches = [...(text.matchAll(/10-\d{7}/g) || [])];
  return matches.map(m => ({ num: m[0], idx: m.index }));
}

// ===== 핵심 함수: scoreText =====
// 입력: 공고문/첨부 합쳐진 텍스트
// 출력: { our: { score, matches }, competitor: { score, matches } }
export function scoreText(rawText) {
  const text = norm(rawText);
  const our = { score: 0, matches: [] };
  const comp = { score: 0, matches: [] };

  // 1) 우리 STRONG
  const strongPositions = [];
  for (const p of OUR_STRONG_PATTERNS) {
    for (const m of text.matchAll(new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g'))) {
      strongPositions.push(m.index);
      our.score += p.w;
      our.matches.push({ type: 'strong', label: p.label, value: m[0], weight: p.w, pos: m.index });
    }
  }
  // 2) 우리 특허번호
  for (const pat of extractPatents(text)) {
    if (OUR_PATENT_SET.has(pat.num)) {
      strongPositions.push(pat.idx);
      our.score += 10;
      our.matches.push({ type: 'strong', label: `특허 ${pat.num}`, value: pat.num, weight: 10, pos: pat.idx });
    }
  }
  // 3) 우리 COMBO — STRONG 과 ±200자 이내 있을 때만 인정
  for (const p of OUR_COMBO_PATTERNS) {
    for (const m of text.matchAll(new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g'))) {
      const near = strongPositions.some(sp => within(sp, m.index));
      if (near) {
        our.score += p.w;
        our.matches.push({ type: 'combo', label: p.label, value: m[0], weight: p.w, pos: m.index, combo: true });
      } else {
        our.matches.push({ type: 'combo_alone', label: p.label, value: m[0], weight: 0, pos: m.index, combo: false, note: 'STRONG 없음 — 무효' });
      }
    }
  }
  // 4) 우리 WEAK
  for (const p of OUR_WEAK_PATTERNS) {
    for (const m of text.matchAll(new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g'))) {
      // POUR 단독 WEAK 는 이미 STRONG 에서 POUR공법/솔루션 잡혔으면 중복 스킵
      if (p.label === 'POUR(단독)' && strongPositions.some(sp => within(sp, m.index, 10))) continue;
      our.score += p.w;
      our.matches.push({ type: 'weak', label: p.label, value: m[0], weight: p.w, pos: m.index });
    }
  }

  // 5) 경쟁사 STRONG
  for (const p of COMPETITOR_STRONG_PATTERNS) {
    for (const m of text.matchAll(new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g'))) {
      comp.score += p.w;
      comp.matches.push({ type: 'strong', label: p.label, value: m[0], weight: p.w, pos: m.index });
    }
  }
  // 6) 경쟁사 특허번호 (우리 특허번호 제외한 모든 10-XXXXXXX)
  for (const pat of extractPatents(text)) {
    if (!OUR_PATENT_SET.has(pat.num)) {
      comp.score += 10;
      comp.matches.push({ type: 'strong', label: `타사 특허 ${pat.num}`, value: pat.num, weight: 10, pos: pat.idx });
    }
  }

  return { our, competitor: comp };
}

// ===== 판정 =====
// 반환: { verdict, reason, ourScore, competitorScore, ourTopMatches, competitorTopMatches, needsReviewReason? }
// verdict: 'win' | 'draw' | 'loss' | 'needs_review'
export function judge(scoreResult, opts = {}) {
  const { our, competitor } = scoreResult;
  const hasText = opts.hasText !== false;  // 기본값 true. 첨부 파싱 실패 시 false
  const ourScore = our.score;
  const compScore = competitor.score;

  if (!hasText) {
    return {
      verdict: 'needs_review', reason: 'text_unavailable',
      ourScore, competitorScore: compScore,
      ourMatches: our.matches, competitorMatches: competitor.matches,
    };
  }

  if (ourScore >= 10 && compScore === 0) {
    return {
      verdict: 'win', reason: 'our_strong_no_competitor',
      ourScore, competitorScore: compScore,
      ourMatches: our.matches, competitorMatches: competitor.matches,
    };
  }
  if (ourScore >= 10 && compScore >= 10) {
    return {
      verdict: 'draw', reason: 'both_strong',
      ourScore, competitorScore: compScore,
      ourMatches: our.matches, competitorMatches: competitor.matches,
    };
  }
  if (ourScore === 0 && compScore >= 10) {
    return {
      verdict: 'loss', reason: 'competitor_only',
      ourScore, competitorScore: compScore,
      ourMatches: our.matches, competitorMatches: competitor.matches,
    };
  }
  // 애매한 영역 — 자동 판정 금지
  return {
    verdict: 'needs_review',
    reason: ourScore === 0 && compScore === 0 ? 'no_signal' : 'weak_or_mixed',
    ourScore, competitorScore: compScore,
    ourMatches: our.matches, competitorMatches: competitor.matches,
  };
}

// 편의 함수 — 텍스트 주면 바로 판정
export function analyzeText(text, opts = {}) {
  const scoreResult = scoreText(text);
  return judge(scoreResult, { ...opts, hasText: !!(text && text.length > 100) });
}
