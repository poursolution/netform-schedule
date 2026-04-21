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

/**
 * 파일명에서 구조화된 메타데이터 추출
 * @param {string} filename 예) "251_신성둔촌미소지움아파트1차(금속기와후커).pdf"
 * @returns {{
 *   ok: boolean,
 *   seq: number|null,
 *   siteName: string,
 *   method: string,
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
  const base = filename.slice(0, -extMatch[0].length);

  // 순번_단지명(공법) 패턴
  // 순번은 없을 수도 있으므로 optional
  //   케이스A: "251_신성둔촌미소지움아파트1차(금속기와후커)"
  //   케이스B: "신성둔촌미소지움아파트1차(금속기와후커)"  (순번 누락)
  //   케이스C: "251_신성둔촌미소지움아파트1차"           (공법 누락)
  //   케이스D: "신성둔촌미소지움아파트1차"                (둘 다 누락)
  const m = base.match(/^(?:(\d+)_)?(.+?)(?:\(([^)]+)\))?\s*$/);
  if (!m) return result;

  if (m[1]) result.seq = parseInt(m[1], 10);
  result.siteName = (m[2] || '').trim();
  result.method = (m[3] || '').trim();

  // siteName 최소 2자 (한글·영문) 있어야 유효
  if (result.siteName.length < 2) return result;

  // 우리 공법 여부
  const combined = (result.method + ' ' + result.siteName).toUpperCase();
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
    .replace(/\s+/g, '')
    .replace(/[()()[\]【】]/g, '')
    .toLowerCase();
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
