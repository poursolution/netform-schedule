// 운영 DB 쓰기 안전장치 — 통째 덮어쓰기·영구 삭제로 남의 기록이 지워지지 않게.
// (영업운영시스템 쪽 legacyPtWrite.js · 숨김 삭제 규칙과 같은 기준)

// 일정 수정창이 소유하지 않는 칸 — 결과·정산·검증·이력은 각자 전용 저장 경로가 있다.
//   수정창 저장에 이 칸을 같이 쓰면, 창을 연 뒤 다른 사람이 넣은 결과·정산이 옛 값으로 되돌아간다.
//   (공고문 공법·공고번호는 A 수정창이 직접 편집하므로 막지 않는다)
export const RECORD_OWNED_FIELDS = new Set([
  'operations', 'operationsData', 'originalType', 'settlement',
  'result', 'results', 'resultReasons', 'resultConfirmDate', 'resultChangeHistory',
  'ptStatus', 'lastCheckDate', 'statusLog', 'selfPT', 'selfPtHistory', 'bidNoHistory',
  'kaptVerified', 'verification', 'verificationReviewHistory', 'screenshotRequestHistory',
  'memoReview', 'memoReviewHistory', 'evidenceFiles', 'exceptionRequests', 'scheduleEditHistory',
  'announcementRecheck', 'jandiVerified', 'deleted', 'deletion', 'superseded', 'supersededBy',
  // 회의 — 응답·회의록은 각자 저장 경로
  'responses', 'responseHistory', 'minutes', 'minutesConfirmedAt', 'minutesConfirmedBy',
]);

// 수정창 저장용 — 소유하지 않는 칸·undefined 를 뺀 칸 단위 update 객체
export function editableFields(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key, item]) =>
    item !== undefined && !RECORD_OWNED_FIELDS.has(key.split('/')[0])));
}

// 운영 기록(결과·정산·검증·증빙·예외·회의 응답/회의록 등)이 붙어 있는지 — 유형 변경 차단용
const hasValue = v => v !== undefined && v !== null && v !== false && v !== ''
  && (typeof v !== 'object' || Object.keys(v).length > 0);
const OPERATIONAL_FIELDS = ['result', 'results', 'resultReasons', 'settlement', 'kaptVerified', 'verification',
  'evidenceFiles', 'exceptionRequests', 'statusLog', 'resultChangeHistory', 'scheduleEditHistory',
  'selfPtHistory', 'bidNoHistory', 'minutes', 'responseHistory', 'announcementRecheck'];
export function hasOperationalRecord(row) {
  if (!row) return false;
  if (OPERATIONAL_FIELDS.some(k => hasValue(row[k]))) return true;
  if (row.source === 'hiworks') return true;
  return Object.values(row.responses || {}).some(r => r && (hasValue(r.reason) || (r.status && r.status !== '미정')));
}

// 숨김 삭제된 기록(deleted: true)은 화면·집계에서 뺀다
export const isLiveRecord = row => !!row && !row.deleted;

// 영구 삭제 대신 숨김 삭제 — 기록은 그대로 두고 표시만(되살리기·감사 가능)
export function softDeletePatch({ by = '', at = new Date().toISOString() } = {}) {
  return { deleted: true, deletion: { by, at } };
}

/**
 * 결과 일괄 저장(saveResults)용 — 바뀐 담당자의 결과 칸과 정산 칸만 경로로 쓴다.
 * @param pt          저장할 로컬 PT (편집 반영된 값)
 * @param changed     결과가 바뀐 담당자 이름들
 * @param legacy      단일 result(레거시) 가 바뀌었는지
 * @param dirty       예전 화면에서 정산·본인PT·공고번호를 바꿨는지 → 담당자별 settlement·selfPT·bidNo
 * @param assignees   PT 담당자 전체 (dirty 일 때 정산 칸 범위)
 * @returns pt/{id} 기준 상대 경로 { 'results/김성민': '승', ... }
 */
export function resultSavePaths(pt, { changed = [], legacy = false, dirty = false, assignees = [] } = {}) {
  const out = {};
  const v = x => (x === undefined ? null : x);
  if (legacy) out.result = v(pt.result);
  changed.forEach(a => {
    out[`results/${a}`] = v(pt.results?.[a]);
    out[`resultReasons/${a}`] = v(pt.resultReasons?.[a]);
    out[`resultConfirmDate/${a}`] = v(pt.resultConfirmDate?.[a]);
  });
  if (legacy || changed.length) out.inProgress = false;
  if (dirty) {
    assignees.forEach(a => { if (pt.settlement?.[a] !== undefined) out[`settlement/${a}`] = pt.settlement[a]; });
    if (pt.selfPT !== undefined) out.selfPT = pt.selfPT;
    if (pt.bidNo !== undefined) out.bidNo = pt.bidNo;
  }
  return out;
}
