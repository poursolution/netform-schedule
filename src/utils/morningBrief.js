// 아침 브리핑(#6c) — PT 일정 안내 메시지 생성.
// 앱(수동 발송·미리보기)과 Cloudflare Worker(09:00 자동 발송)가 같은 파일을 쓴다. 외부 의존성 없음.

const KDAY = ['일', '월', '화', '수', '목', '금', '토'];

const pad = n => String(n).padStart(2, '0');
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };

export function splitAssignees(value) {
  return [...new Set(String(value || '').replace(/님/g, '').split(/[\/,+&]/).map(t => t.trim()).filter(Boolean))];
}

export function kDate(dateStr) {
  if (!dateStr) return '';
  return `${dateStr}(${KDAY[fromKey(dateStr).getDay()]})`;
}

export function kDayShort(dateStr) {
  return kDate(dateStr).slice(5).replace('-', '/');
}

// "14:00" / "14시" / "14:30~16:00" → "오후 2:00". 숫자가 없으면 원문(없으면 '시간 미정')
export function kTime(time) {
  const m = String(time || '').match(/(\d{1,2})\s*[:시]\s*(\d{2})?/);
  if (!m) return String(time || '').trim() || '시간 미정';
  const h = +m[1], mi = m[2] ? +m[2] : 0;
  return `${h < 12 ? '오전' : '오후'} ${(h % 12) || 12}:${pad(mi)}`;
}

function timeSortKey(time) {
  const m = String(time || '').match(/(\d{1,2})\s*[:시]\s*(\d{2})?/);
  return m ? +m[1] * 60 + (m[2] ? +m[2] : 0) : 9999;
}

/**
 * 오늘 다음날부터 영업일(주말·공휴일 제외) n일.
 * isHoliday(dateStr) → truthy 면 공휴일.
 */
export function nextBusinessDays(todayStr, n = 2, isHoliday = () => false) {
  const out = [];
  const d = fromKey(todayStr);
  for (let guard = 0; out.length < n && guard < 31; guard++) {
    d.setDate(d.getDate() + 1);
    const key = toKey(d);
    const dow = d.getDay();
    if (dow === 0 || dow === 6 || isHoliday(key)) continue;
    out.push(key);
  }
  return out;
}

export function briefRows(ptSchedules, days) {
  const set = new Set(days);
  return (ptSchedules || [])
    .filter(s => s && set.has(s.date) && (!s.dateType || s.dateType === 'confirmed'))
    .map(s => ({
      id: s.id,
      date: s.date,
      time: s.time || '',
      siteName: s.siteName || s.title || '(현장명 없음)',
      workType: s.workType || '',
      assignees: splitAssignees(s.ptAssignee),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || timeSortKey(a.time) - timeSortKey(b.time));
}

export function rowsFor(rows, assignee) {
  return assignee ? rows.filter(r => r.assignees.includes(assignee)) : rows;
}

export function briefTitle(days) {
  if (!days.length) return '📋 PT 일정 안내';
  const a = kDayShort(days[0]).replace(/\(.\)$/, '');
  const b = kDayShort(days[days.length - 1]).replace(/\(.\)$/, '');
  return `📋 PT 일정 안내 (${a === b ? a : `${a}~${b}`})`;
}

export const BRIEF_FOOTER = '결과는 PT 끝나고 앱에서 승/무/패 한 번만 눌러주세요.';

export function groupByDay(rows, days) {
  return days
    .map(day => ({ day, items: rows.filter(r => r.date === day) }))
    .filter(g => g.items.length);
}

function line(r) {
  const who = r.assignees.length ? r.assignees.join('+') : '⚠ 미배정';
  return `${kTime(r.time)} · ${r.siteName}${r.workType ? ` · ${r.workType}` : ''} · ${who}`;
}

// 복사·미리보기용 평문
export function buildBriefText(rows, days, assignee = null) {
  const mine = rowsFor(rows, assignee);
  const parts = [briefTitle(days)];
  for (const g of groupByDay(mine, days)) {
    parts.push('', `▸ ${kDayShort(g.day)}`, ...g.items.map(r => `  ${line(r)}`));
  }
  if (!mine.length) parts.push('', '예정된 PT가 없습니다.');
  parts.push('', BRIEF_FOOTER);
  return parts.join('\n');
}

// 잔디 웹훅 payload — 날짜별 connectInfo
export function buildBriefJandiMessage(rows, days, assignee = null) {
  const mine = rowsFor(rows, assignee);
  const groups = groupByDay(mine, days);
  return {
    body: `${briefTitle(days)}${assignee ? ` — ${assignee}님` : ''} · ${mine.length}건`,
    connectColor: '#0F4C75',
    connectInfo: [
      ...groups.map(g => ({ title: `▸ ${kDayShort(g.day)}`, description: g.items.map(line).join('\n') })),
      { title: '안내', description: BRIEF_FOOTER },
    ],
  };
}

// 개인 발송 대상: 그 기간 PT 에 배정된 담당자
export function briefRecipients(rows) {
  return [...new Set(rows.flatMap(r => r.assignees))];
}
