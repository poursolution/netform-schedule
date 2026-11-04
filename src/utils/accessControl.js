export const FULL_DATA_VIEWER_NAMES = Object.freeze([
  '한준엽',
  '황윤선',
  '이승우',
]);

const FULL_DATA_VIEWER_SET = new Set(FULL_DATA_VIEWER_NAMES);

// 게스트 계정은 실적(결과·금액·정산)을 어떤 화면에서도 보지 못한다
export function isGuestAccount(account) {
  return !!account && (account.id === 'guest' || account.name === '게스트');
}

export function hasFullDataViewAccess(account) {
  if (!account) return false;
  return account.isAdmin === true || FULL_DATA_VIEWER_SET.has(account.name);
}
