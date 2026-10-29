// 영업회의(#12d)·회의 상세(#13a)·새 회의(#13b) — 화면 전용 파생값. 저장 구조는 기존 meetings/{id} 그대로
//   { title, date, time, endTime?, location, attendees[], responses{ 이름: { status: '참석'|'불참'|'미정', reason } }, agenda(문자열), minutes, ... }

export function responseOf(meeting, name) {
  const r = meeting?.responses?.[name];
  const status = (r && typeof r === 'object' ? r.status : r) || '미정';
  return { status: status === '참석' || status === '불참' ? status : '미정', reason: (r && typeof r === 'object' && r.reason) || '' };
}

export function responseCounts(meeting) {
  const names = meeting?.attendees || [];
  const c = { total: names.length, yes: 0, no: 0, pending: 0, pendingNames: [] };
  names.forEach(n => {
    const s = responseOf(meeting, n).status;
    if (s === '참석') c.yes += 1;
    else if (s === '불참') c.no += 1;
    else { c.pending += 1; c.pendingNames.push(n); }
  });
  return c;
}

// "261106 영업회의" 같은 제목은 "11월 영업회의"로 보여준다 (데이터는 그대로)
export function displayTitle(meeting) {
  const t = String(meeting?.title || '').trim();
  const m = /^(\d{2})(\d{2})(\d{2})\s*(영업회의.*)$/.exec(t);
  if (m) return `${+m[2]}월 ${m[4]}`;
  return t || '(제목 없음)';
}

export function defaultMeetingTitle(date) {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(String(date || ''));
  return m ? `${+m[1]}월 영업회의` : '';
}

export function dday(date, todayStr) {
  if (!date || !todayStr) return null;
  return Math.round((new Date(date + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000);
}

export function meetingState(meeting, todayStr) {
  const d = dday(meeting?.date, todayStr);
  if (d === null) return 'none';
  return d < 0 ? 'done' : 'upcoming';
}

// 오늘 포함 가장 가까운 예정 회의
export function nextMeeting(meetings, todayStr) {
  return [...(meetings || [])].filter(m => m?.date && m.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')))[0] || null;
}

// 안건 문자열 → 항목 목록 (한 줄 = 한 안건, 앞 번호·기호는 뗀다)
export function agendaItems(agenda) {
  return String(agenda || '').split(/\r?\n/).map(l => l.replace(/^\s*(\d+[.)]|[-•·*])\s*/, '').trim()).filter(Boolean);
}

export function joinAgenda(items) {
  return (items || []).map((t, i) => `${i + 1}. ${t}`).join('\n');
}

// 회의록 틀 — 안건 번호·제목 + 빈 메모 줄
export function minutesTemplate(agenda) {
  const items = agendaItems(agenda);
  return items.length ? items.map((t, i) => `${i + 1}. ${t}\n- `).join('\n\n') : '';
}
