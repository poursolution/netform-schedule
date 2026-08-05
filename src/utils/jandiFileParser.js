// 잔디 "입찰 공고(POUR공법)" 채널 파일명 파서
// 파일명 규칙: {순번}_{단지명}({공법/자재}).{ext}
// 예시:
//   251_신성둔촌미소지움아파트1차(금속기와후커).pdf
//   252_소만마을6단지 성원아파트(우레탄).hwpx
//   250_마곡센트레빌아파트(아스콘).hwp
//
// 목적:
//   - 잔디 채널에서 수집한 HWP/PDF 파일명을 구조화
//   - 실적(pt/{scheduleId}) 매칭 키(단지명·공법) 추출
//   - 순번(seq)으로 중복/누락 감지

// 지원 확장자 (공고문 관련)
const SUPPORTED_EXT = ['pdf', 'hwp', 'hwpx', 'doc', 'docx'];

// 우리 공법/자재 키워드 (있으면 isOurMethod=true)
// 참고: src/utils/technologies.js 의 OUR_TECHNOLOGIES 와 별개로,
//       잔디 파일명에는 "POUR공법" 외에도 자재명이 들어감 → 둘 다 대응
const OUR_METHOD_KEYWORDS = ['POUR', 'CNC', 'DO', 'DETEX', '시멘트분말'];

// 단지명 앞에 붙는 공법 prefix (긴 것부터 체크 — DO공법이 DO보다 먼저)
// 예) "009_DO공법_이천 대림휴먼빌 아파트(재도장).hwp" → prefix="DO공법", siteName="이천 대림휴먼빌 아파트"
const METHOD_PREFIXES = [
  'POUR공법', 'CNC공법', 'DO공법', 'DETEX공법',
  'POUR솔루션', 'POUR시스템',
  'POUR', 'CNC', 'DO', 'DETEX', '시멘트분말',
];

// 파일명 끝에 붙는 개정/재공고 표식. 이 표식을 단지명으로 인식하면
// "OO아파트"와 "OO아파트(방수)_재공고"가 서로 다른 단지로 계산된다.
const REVISION_SUFFIX_RE = /(?:[_\s-]*(?:재공고|재입찰|수정공고|정정공고|변경공고|수정본|정정본|변경본|재업로드|특허오기재|v\d+))(?:[_\s-]*\((?:수정|정정|변경)\))?$/i;
const DATE_SUFFIX_RE = /[_\s-]+(?:\d{2}[.\-_]?\d{2}|\d{4}[.\-_]?\d{2}[.\-_]?\d{2})$/;
const REVISION_PREFIX_RE = /^(?:\(?\s*(?:재공고|재입찰|수정공고|정정공고|변경공고|수정본|정정본|변경본)\s*\)?[_\s-]*)+/i;

export function stripJandiFilenameSuffix(value) {
  let next = String(value || '').trim();
  let previous = null;
  while (next && next !== previous) {
    previous = next;
    next = next.replace(DATE_SUFFIX_RE, '').replace(REVISION_SUFFIX_RE, '').replace(/[_\s-]+$/, '').trim();
  }
  return next;
}

/**
 * 파일명에서 구조화된 메타데이터 추출
 * @param {string} filename 예) "251_신성둔촌미소지움아파트1차(금속기와후커).pdf"
 * @returns {{
 *   ok: boolean,
 *   seq: number|null,
 *   siteName: string,
 *   method: string,
 *   methodPrefix: string,
 *   ext: string,
 *   isSupportedExt: boolean,
 *   isOurMethod: boolean,
 *   raw: string
 * }}
 */
export function parseJandiFilename(filename) {
  const result = {
    ok: false,
    seq: null,
    siteName: '',
    method: '',
    methodPrefix: '',
    ext: '',
    isSupportedExt: false,
    isOurMethod: false,
    raw: filename,
  };
  if (!filename || typeof filename !== 'string') return result;

  // 확장자 분리
  const extMatch = filename.match(/\.([a-z0-9]+)$/i);
  if (!extMatch) return result;
  result.ext = extMatch[1].toLowerCase();
  result.isSupportedExt = SUPPORTED_EXT.includes(result.ext);
  const base = stripJandiFilenameSuffix(filename.slice(0, -extMatch[0].length));

  // 순번_[공법prefix_]단지명(공법) 패턴
  // 케이스:
  //   A: "251_신성둔촌미소지움아파트1차(금속기와후커)"
  //   B: "신성둔촌미소지움아파트1차(금속기와후커)"  (순번 누락)
  //   C: "009_DO공법_이천 대림휴먼빌 아파트(재도장)"  (공법 prefix 있음)
  //   D: "011_DO_평택장당우미이노스빌3차아파트(재도장,옥상)"
  const m = base.match(/^(?:(\d+)_)?(.+?)(?:\(([^)]+)\))?\s*$/);
  if (!m) return result;

  if (m[1]) result.seq = parseInt(m[1], 10);
  let rest = (m[2] || '').trim();
  rest = rest.replace(REVISION_PREFIX_RE, '').trim();
  result.method = (m[3] || '').trim();

  // 공법 prefix 제거 (DO_, DO공법_, CNC_, POUR_, ...)
  for (const prefix of METHOD_PREFIXES) {
    if (rest.startsWith(prefix + '_')) {
      result.methodPrefix = prefix;
      rest = rest.slice(prefix.length + 1).trim();
      break;
    }
  }

  result.siteName = rest;

  // siteName 최소 2자 (한글·영문) 있어야 유효
  if (result.siteName.length < 2) return result;

  // 우리 공법 여부 (prefix/method/siteName 중 하나라도 우리 키워드면 true)
  const combined = (result.methodPrefix + ' ' + result.method + ' ' + result.siteName).toUpperCase();
  result.isOurMethod = OUR_METHOD_KEYWORDS.some(k => combined.includes(k.toUpperCase()));

  result.ok = true;
  return result;
}

/**
 * 단지명 정규화 — PT 레코드와 매칭할 때 사용
 * 공백/괄호/숫자단지표기 일부 제거
 */
export function normalizeSiteName(s) {
  return String(s || '')
    .replace(/^\d+_/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, '')
    .replace(/[()()[\]【】._\-/\\·•‧⋅,，~～]/g, '')
    .replace(/(?:아파트|apt)$/i, '')
    .toLowerCase();
}

function similarity(a, b) {
  const left = normalizeSiteName(a);
  const right = normalizeSiteName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.max(0.88, Math.min(left.length, right.length) / Math.max(left.length, right.length));
  }
  const longer = left.length >= right.length ? left : right;
  const shorter = left.length >= right.length ? right : left;
  let best = 0;
  for (let len = shorter.length; len >= 2 && len > best; len--) {
    for (let i = 0; i + len <= shorter.length; i++) {
      if (longer.includes(shorter.slice(i, i + len))) { best = len; break; }
    }
  }
  return best / longer.length;
}

const SEARCH_METHOD_TOKENS = [
  '재도장', '외벽도장', '균열', '에폭시', '우레탄', '방수', '슬라브',
  '싱글', '금속기와', '아스콘', '보도블럭', '배면차수', 'pour', 'cnc', 'detex',
];

/**
 * 검토 패널에서 잔디 증빙 후보를 정렬하기 위한 점수.
 * 자동 확정에 쓰지 않고, 사람이 고를 후보의 순서에만 사용한다.
 */
export function scoreJandiEvidenceCandidate(evidence, pt, query = '') {
  const parsed = evidence?.parsedSiteName
    ? { siteName: evidence.parsedSiteName, method: evidence.parsedMethod || '' }
    : parseJandiFilename(evidence?.filename || '');
  const targetName = String(query || pt?.siteName || '').trim();
  const nameScore = similarity(parsed.siteName, targetName);

  const evMethod = String(parsed.method || evidence?.parsedMethod || '').toLowerCase();
  const ptMethod = String(pt?.workType || '').toLowerCase();
  const evTokens = SEARCH_METHOD_TOKENS.filter(token => evMethod.includes(token));
  const ptTokens = SEARCH_METHOD_TOKENS.filter(token => ptMethod.includes(token));
  const methodScore = evTokens.length && ptTokens.length
    ? (evTokens.some(token => ptTokens.includes(token)) ? 1 : -0.35)
    : 0;

  const score = Math.max(0, Math.min(1, nameScore * 0.92 + methodScore * 0.08));
  return {
    score: Number(score.toFixed(3)),
    nameScore: Number(nameScore.toFixed(3)),
    methodScore,
    parsedSiteName: parsed.siteName || '',
    parsedMethod: parsed.method || '',
  };
}

/**
 * 파일명들에서 순번 누락 감지
 * @param {string[]} filenames
 * @returns {{ maxSeq: number|null, missing: number[], duplicates: number[] }}
 */
export function detectSequenceGaps(filenames) {
  const seqs = filenames
    .map(f => parseJandiFilename(f).seq)
    .filter(s => typeof s === 'number' && s > 0);
  if (seqs.length === 0) return { maxSeq: null, missing: [], duplicates: [] };

  const maxSeq = Math.max(...seqs);
  const seen = new Map();
  for (const s of seqs) seen.set(s, (seen.get(s) || 0) + 1);

  const missing = [];
  for (let i = 1; i <= maxSeq; i++) if (!seen.has(i)) missing.push(i);
  const duplicates = [...seen.entries()].filter(([, c]) => c > 1).map(([s]) => s);

  return { maxSeq, missing, duplicates };
}

/**
 * 파일명 파서 결과 + PT 레코드로 매칭 스코어 계산
 * @param {ReturnType<typeof parseJandiFilename>} parsed
 * @param {{ site?: string, siteName?: string, ptAssignee?: string, ptDate?: string }} pt
 * @returns {number} 0~1
 */
export function scoreMatch(parsed, pt) {
  if (!parsed.ok) return 0;
  const ptSite = normalizeSiteName(pt.site || pt.siteName || '');
  const fileSite = normalizeSiteName(parsed.siteName);
  if (!ptSite || !fileSite) return 0;

  // 단지명 유사도 (단순 포함 + 공통문자수 기반)
  let nameScore = 0;
  if (ptSite === fileSite) nameScore = 1;
  else if (ptSite.includes(fileSite) || fileSite.includes(ptSite)) nameScore = 0.85;
  else {
    // 공통 서브스트링 길이 / 긴 쪽 길이
    const longer = ptSite.length >= fileSite.length ? ptSite : fileSite;
    const shorter = ptSite.length >= fileSite.length ? fileSite : ptSite;
    let common = 0;
    for (let len = shorter.length; len >= 2; len--) {
      for (let i = 0; i + len <= shorter.length; i++) {
        if (longer.includes(shorter.slice(i, i + len))) { common = len; break; }
      }
      if (common) break;
    }
    nameScore = common / longer.length;
  }

  return nameScore;
}
