// 일정 화면(#6b·#6c) 파생값 — 화면 전용. 저장은 App 의 기존 핸들러가 한다.
import { splitAssignees } from './morningBrief.js';

// 종류 태그 색 — 핸드오프: PT·현설·세미나·회의·휴가는 지정색, 나머지는 회색 계열
export const TYPE_META = {
  pt: { label: 'PT', bg: '#dbeafe', fg: '#0F4C75' },
  briefing: { label: '현설', bg: '#dcfce7', fg: '#15803d' },
  seminar: { label: '세미나', bg: '#BBE1FA', fg: '#0F4C75' },
  meeting: { label: '회의', bg: '#f1f5f9', fg: '#475569' },
  vacation: { label: '휴가', bg: '#fef3c7', fg: '#b45309' },
  sales: { label: '영업', bg: '#f1f5f9', fg: '#64748b' },
  asq: { label: '아.스.퀘', bg: '#f1f5f9', fg: '#64748b' },
  personal: { label: '개인', bg: '#f1f5f9', fg: '#64748b' },
};
export const TYPE_ORDER = ['pt', 'briefing', 'meeting', 'seminar', 'vacation', 'sales', 'asq', 'personal'];

export function typeMeta(type) {
  return TYPE_META[type] || { label: type || '기타', bg: '#f1f5f9', fg: '#64748b' };
}

export function assigneesOf(s) {
  if (!s) return [];
  if (s.type === 'meeting') return [...(s.attendees || [])];
  if (s.type === 'pt' || s.type === 'briefing' || s.type === 'sales') {
    const fromField = splitAssignees(s.ptAssignee || s.assignee);
    if (fromField.length) return fromField;
  }
  return [...new Set([...(s.assignees || []), ...splitAssignees(s.ptAssignee)])].filter(Boolean);
}

// App.isUnassigned 와 같은 기준 (pt·현설·아스퀘·개인만 미배정 대상)
export function isUnassignedItem(s) {
  if (!s) return false;
  if (s.type === 'pt') return !s.ptAssignee;
  if (s.type === 'briefing') return !s.assignee;
  if (s.type === 'asq') return !s.ptAssignee && !(s.assignees && s.assignees.length);
  if (s.type === 'personal') return !(s.assignees && s.assignees.length);
  return false;
}

export function titleOf(s) {
  return s?.siteName || s?.title || '(제목 없음)';
}

export function subOf(s) {
  return [s?.workType, s?.location || s?.address].filter(Boolean)[0] || '';
}

export function timeKey(t) {
  const m = String(t || '').match(/(\d{1,2})\s*[:시]\s*(\d{2})?/);
  return m ? +m[1] * 60 + (m[2] ? +m[2] : 0) : -1; // 시간 없는 일정(종일)은 맨 위
}

export function shortTime(t) {
  const m = String(t || '').match(/(\d{1,2})\s*[:시]\s*(\d{2})?/);
  if (!m) return '종일';
  return `${String(+m[1]).padStart(2, '0')}:${m[2] || '00'}`;
}

export function matchesSearch(s, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  return [s.siteName, s.title, s.address, s.workType, s.ptAssignee, s.assignee, (s.assignees || []).join(' '), (s.attendees || []).join(' '), s.requester, s.note, s.location]
    .some(v => String(v || '').toLowerCase().includes(needle));
}

export function matchesWorkType(s, wt) {
  if (!wt || wt === 'all') return true;
  return String(s.workType || '').includes(wt) || String(s.mainCategory || '').includes(wt);
}

export function matchesWho(s, who) {
  if (!who || who === 'all') return true;
  return assigneesOf(s).includes(who);
}

export function monthCells(year, month0) {
  const first = new Date(year, month0, 1).getDay();
  const dim = new Date(year, month0 + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(`${year}-${String(month0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function sortDay(items) {
  return [...items].sort((a, b) => timeKey(a.time) - timeKey(b.time) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
}

// #6c 리스트 필터 (PT 기준)
export const LIST_FILTERS = {
  upcoming: (s, today) => s.date > today,
  planned: (s, today) => s.date > today && !!s.ptAssignee,
  unassigned: (s, today) => s.date > today && !s.ptAssignee,
  past: (s, today) => s.date <= today,
  all: () => true,
};
export const LIST_TITLES = { upcoming: '앞으로 일정', planned: '배정 완료 일정', unassigned: '담당 미배정 PT', past: '지난 PT', all: '전체 PT' };
