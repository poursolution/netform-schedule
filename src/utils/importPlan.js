// 구글시트 가져오기 — 무엇을 어떻게 쓸지 계획만 세운다(순수 함수, Firebase 모름).
//
// 원칙
// - 시트가 아는 칸(SHEET_FIELDS)만 바꾼다. 결과·정산·K-APT 검증·증빙·메모 등 앱에서 쌓인 값은 절대 건드리지 않는다.
// - 시트 칸이 비어 있으면 앱 값을 지우지 않는다(앱에서 배정한 담당자가 빈 시트로 사라지지 않게).
// - 기존 PT는 칸 단위 경로(pt/{id}/{field})로만 쓴다 — 다른 사람이 방금 바꾼 다른 칸을 덮지 않게.
// - 쓰기 전에 손대는 PT의 원래 값을 backup 으로 돌려준다(되돌리기용, 새로 만든 PT는 null = 되돌리면 삭제).

export const SHEET_FIELDS = [
  'dateType', 'date', 'expectedMonth', 'dateNote',
  'siteName', 'address', 'time', 'participants', 'workType', 'mainCategory',
  'requester', 'contactPerson', 'competitor', 'useSummit', 'status', 'ptAssignee',
];

const isBlank = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
// 시트가 날짜를 정해 주면 날짜 관련 칸은 한 묶음으로 바뀐다(확정 → 월만 등) — 빈 값도 그대로 반영
const DATE_FIELDS = new Set(['dateType', 'date', 'expectedMonth', 'dateNote']);
const same = (a, b) => String(a ?? '') === String(b ?? '');

export const importKey = s => `${s.siteName}_${s.date || s.expectedMonth || s.dateNote}`.toLowerCase().replace(/\s/g, '');

const safeId = id => String(id).replace(/[.#$/[\]]/g, '_');

// 기존 PT에 시트 행을 얹었을 때 바뀌는 칸만 { field: value }
export function sheetChanges(existing, row) {
  const out = {};
  for (const f of SHEET_FIELDS) {
    const v = DATE_FIELDS.has(f) ? (row[f] ?? '') : row[f]; // Firebase 는 undefined 를 못 씀
    if (!DATE_FIELDS.has(f) && isBlank(v)) continue;
    if (!same(existing[f], v)) out[f] = v;
  }
  // 메모: 앱에 메모가 없을 때만 시트의 "담당: ○○" 를 채운다
  if (isBlank(existing.note) && !isBlank(row.note)) out.note = row.note;
  return out;
}

/**
 * @param existing  현재 PT 목록(앱 상태)
 * @param imported  시트에서 매핑한 행(id 포함 — 새로 만들 때 씀)
 * @param mode      'merge' | 'addNew' | 'replace'
 * @returns {{ updates, backup, next, counts }}
 *   updates — database.ref().update(updates) 에 그대로 넣을 다중 경로
 *   backup  — { id: 원래 노드 | null }
 *   next    — 반영 후 PT 목록(로컬 상태)
 */
export function planImport(existing, imported, mode) {
  const updates = {};
  const backup = {};
  const counts = { added: 0, updated: 0, unchanged: 0, skipped: 0, removed: 0 };
  const byKey = new Map();
  existing.forEach(s => byKey.set(importKey(s), s));
  const nextById = new Map(existing.map(s => [s.id, s]));

  if (mode === 'replace') {
    const keep = new Set();
    imported.forEach(row => {
      const id = safeId(row.id);
      keep.add(id);
      updates[`pt/${id}`] = { ...row, id };
      backup[id] = null;
      counts.added++;
    });
    existing.forEach(s => {
      backup[s.id] = s;
      if (!keep.has(s.id)) { updates[`pt/${s.id}`] = null; counts.removed++; }
    });
    return { updates, backup, next: imported.map(r => ({ ...r, id: safeId(r.id) })), counts };
  }

  const seenNew = new Map(); // 같은 시트 안 중복 행 — 나중 행이 이김(예전 동작과 같음)
  imported.forEach(row => {
    const key = importKey(row);
    const cur = byKey.get(key);
    if (cur && !seenNew.has(key)) {
      if (mode === 'addNew') { counts.skipped++; return; }
      const ch = sheetChanges(nextById.get(cur.id), row);
      if (!Object.keys(ch).length) { counts.unchanged++; return; }
      if (!(cur.id in backup)) backup[cur.id] = cur;
      Object.entries(ch).forEach(([f, v]) => { updates[`pt/${cur.id}/${f}`] = v; });
      nextById.set(cur.id, { ...nextById.get(cur.id), ...ch });
      counts.updated++;
      return;
    }
    const id = seenNew.get(key) || safeId(row.id);
    if (!seenNew.has(key)) { counts.added++; backup[id] = null; } else counts.skipped++;
    seenNew.set(key, id);
    const node = { ...row, id };
    updates[`pt/${id}`] = node;
    nextById.set(id, node);
  });

  return { updates, backup, next: Array.from(nextById.values()), counts };
}

// 되돌리기 — 백업을 그대로 되쓰는 다중 경로(새로 만든 PT는 삭제)
export function undoUpdates(backup) {
  const out = {};
  Object.entries(backup || {}).forEach(([id, node]) => { out[`pt/${id}`] = node || null; });
  return out;
}
