// 분기 확인 리마인드(Worker cron 09/17 KST)의 대상 분기.
//   분기정산은 분기 마지막 달 마지막 월요일에 만들어지고, 확인 마감은 분기 다음 달 30일 (OPERATIONS §8).
//   → 분기 마지막 달부터는 그 분기, 그 전에는 마감이 안 지난 지난 분기. 둘 다 아니면 null (보낼 분기 없음).
//   예전에는 늘 "이번 분기"를 써서, 분기 첫날부터 3개월 넘게 매일 두 번 리마인드가 나갔다.

function kstParts(now) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return { y: kst.getUTCFullYear(), m: kst.getUTCMonth() + 1 };
}

// 분기 종료 다음 달 30일 00:00 UTC — Worker 의 getQuarterDeadlineDate 와 같은 기준
export function quarterDeadline(quarterKey) {
  const mt = /^(\d{4})-Q([1-4])$/.exec(String(quarterKey || ''));
  if (!mt) return null;
  const y = +mt[1], endMonth = +mt[2] * 3;
  const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
  return new Date(Date.UTC(endMonth === 12 ? y + 1 : y, nextMonth - 1, 30));
}

export function reminderQuarterKey(now = new Date()) {
  const { y, m } = kstParts(now);
  const q = Math.ceil(m / 3);
  if (m === q * 3) return `${y}-Q${q}`;
  const prev = q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
  const dl = quarterDeadline(prev);
  return dl && now <= dl ? prev : null;
}
