export const FULL_DATA_VIEWER_NAMES = Object.freeze([
  '한준엽',
  '황윤선',
  '이승우',
]);

const FULL_DATA_VIEWER_SET = new Set(FULL_DATA_VIEWER_NAMES);

export function hasFullDataViewAccess(account) {
  if (!account) return false;
  return account.isAdmin === true || FULL_DATA_VIEWER_SET.has(account.name);
}
