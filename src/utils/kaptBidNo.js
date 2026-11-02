// K-APT 공고번호 추출 — 공고번호 그대로, 또는 상세 페이지 URL 통째로 붙여넣은 값에서 뽑는다.
//   구형 URL: ?bidNum=...  ?bidcode=...
//   신형 URL: ?bidNo=...  ?m=...  (bidNo= 가 비어있는 케이스 대비 m= fallback)
// 형식이 안 맞으면 null.
const KEYS = ['bidNum', 'bidNo', 'bidno', 'm', 'bidcode'];

export function extractKaptBidNo(raw) {
  let input = String(raw || '').trim();
  if (!input) return null;
  for (const key of KEYS) {
    const mm = input.match(new RegExp('(?:^|[?&])' + key + '=([a-z0-9_]+)', 'i'));
    if (mm && mm[1]) {
      const v = mm[1];
      input = (v.startsWith('kg2b_') || /^\d+$/.test(v)) ? v : 'kg2b_' + v;
      break;
    }
  }
  return /^(\d{14,20}|kg2b_\d+)$/.test(input) ? input : null;
}
