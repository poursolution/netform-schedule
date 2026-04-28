// PT 실적 승·무·패 검증 시스템
// ────────────────────────────────────────────────────────────────────
// 담당자 결과 입력 → 자동 잔디 근거 매칭 또는 검증필요 → 수동 검증 → 최종 확정
//
// 데이터 위치: pt/{ptId}/verification/{assignee}
//   - status, selfCheckedValue, autoSource, manualVerification, history
//
// 최종 실적 반영 기준: status === 'verified_win' | 'verified_draw' | 'verified_loss'
// 그 외(self_checked / need_review / excluded) 는 정산·보고서에 미반영.

// === 상태 enum ===
export const VERIFICATION_STATUS = {
  UNCHECKED:        'unchecked',          // 결과 미입력
  SELF_CHECKED:     'self_checked',       // 담당자 체크만 완료
  AUTO_WIN_CHECKED: 'auto_win_checked',   // 잔디 근거 자동 확인 통과 (즉시 verified_win 으로 전이)
  NEED_REVIEW:      'need_review',        // 검증필요 (자동 거부 또는 무/패)
  MANUAL_CHECKED:   'manual_checked',     // 수동 검증 진행 중 (선택적 중간 상태)
  VERIFIED_WIN:     'verified_win',
  VERIFIED_DRAW:    'verified_draw',
  VERIFIED_LOSS:    'verified_loss',
  EXCLUDED:         'excluded',
};

// 최종 확정 상태 (정산·보고서 반영 대상)
export const FINAL_VERIFIED_STATUSES = new Set([
  VERIFICATION_STATUS.VERIFIED_WIN,
  VERIFICATION_STATUS.VERIFIED_DRAW,
  VERIFICATION_STATUS.VERIFIED_LOSS,
  VERIFICATION_STATUS.AUTO_WIN_CHECKED,  // auto 통과는 즉시 verified_win 과 동등하게 반영
]);

// === 자동 승리 확인 키워드 ===
// 잔디 evidence·workType·메모 등에서 검색
export const WIN_BRAND_KEYWORDS = [
  'POUR', '포어', 'POUR솔루션', '복합시트', '복합 시트',
];
export const WIN_AGREEMENT_KEYWORDS = [
  '기술사용 협약', '기술사용협약', '협약서', '특허',
];
export const WIN_RESULT_KEYWORDS = [
  '낙찰', '선정', '계약', '결과', '공고', '입찰결과',
];
const PATENT_NUMBER_REGEX = /(?:10-)?\d{7}|특허\s*제?\s*\d{4,8}/g;

// === 액션 enum (수동 검증 시) ===
export const VERIFICATION_ACTION = {
  CONFIRM_WIN:  'confirm_win',
  CONFIRM_DRAW: 'confirm_draw',
  CONFIRM_LOSS: 'confirm_loss',
  HOLD:         'hold',
  EXCLUDE:      'exclude',
};

// === 신뢰도 임계값 ===
export const AUTO_WIN_CONFIDENCE_THRESHOLD = 0.85;
export const AUTO_WIN_NAME_MATCH_FLOOR = 0.7;  // 단지명 매칭 최저 요구 (이 미만이면 무조건 거부)

// ────────────────────────────────────────────────────────────────────
// 자동 승리 확인 — 신뢰도 산출
// ────────────────────────────────────────────────────────────────────

/**
 * PT + 담당자 기준으로 잔디 근거의 신뢰도 점수 계산.
 *
 * 신호:
 *  - evidence 매칭 score (pt.evidenceFiles 의 matchScore 평균)
 *  - kaptVerified.status === 'verified'
 *  - evidence 파일 ≥ 1개
 *  - 키워드 hit 비율 (브랜드/협약/결과/특허번호 카테고리당 1점, 4점 만점)
 *
 * @param {Object} pt PT 객체
 * @param {string} assignee 담당자
 * @returns {{
 *   confidence: number,         // 0~1
 *   shouldAutoWin: boolean,
 *   nameMatchScore: number,
 *   evidenceCount: number,
 *   kaptVerified: boolean,
 *   keywordsHit: string[],
 *   keywordHitRatio: number,
 *   primaryFileId: string|null,
 *   reason: string,             // 거부 사유 (shouldAutoWin=false 일 때)
 * }}
 */
export function computeAutoWinConfidence(pt, assignee) {
  const result = {
    confidence: 0,
    shouldAutoWin: false,
    nameMatchScore: 0,
    evidenceCount: 0,
    kaptVerified: false,
    keywordsHit: [],
    keywordHitRatio: 0,
    primaryFileId: null,
    reason: '',
  };
  if (!pt) { result.reason = 'no_pt'; return result; }

  // 1) evidence 매칭 — pt.evidenceFiles 평균 matchScore + 개수
  const evFiles = pt.evidenceFiles || {};
  const evIds = Object.keys(evFiles);
  result.evidenceCount = evIds.length;
  if (evIds.length > 0) {
    let scoreSum = 0, scoreCount = 0;
    let bestId = null, bestScore = 0;
    for (const fid of evIds) {
      const ef = evFiles[fid] || {};
      // superseded/sameContentAs 등 제외 — primary 만 계산
      if (ef.supersededByFileId) continue;
      const s = Number(ef.matchScore) || 0;
      scoreSum += s; scoreCount++;
      if (s > bestScore) { bestScore = s; bestId = fid; }
    }
    if (scoreCount > 0) {
      result.nameMatchScore = scoreSum / scoreCount;
      result.primaryFileId = bestId;
    }
  }

  // 2) K-APT 자동 검증
  result.kaptVerified = pt.kaptVerified?.status === 'verified';

  // 3) 키워드 hit — 검색 대상 텍스트 모음
  const searchText = [
    pt.workType, pt.siteName, pt.note, pt.address,
    pt.kaptVerified?.matchedValue, pt.kaptVerified?.matchedText,
    ...evIds.flatMap(fid => {
      const ef = evFiles[fid] || {};
      return [ef.filename, ef.parsedMethod, ef.parsedMethodPrefix];
    }),
  ].filter(Boolean).join(' ').toLowerCase();

  const hits = new Set();
  for (const k of WIN_BRAND_KEYWORDS) {
    if (searchText.includes(k.toLowerCase())) { hits.add(k); break; }  // 카테고리당 1점
  }
  const hadBrand = hits.size > 0;
  for (const k of WIN_AGREEMENT_KEYWORDS) {
    if (searchText.includes(k.toLowerCase())) { hits.add(k); break; }
  }
  const hadAgreement = hits.size > (hadBrand ? 1 : 0);
  for (const k of WIN_RESULT_KEYWORDS) {
    if (searchText.includes(k.toLowerCase())) { hits.add(k); break; }
  }
  // 특허번호 정규식 (별도 카테고리)
  if (PATENT_NUMBER_REGEX.test(searchText)) {
    hits.add('특허번호');
  }
  PATENT_NUMBER_REGEX.lastIndex = 0;
  result.keywordsHit = [...hits];
  // 4 카테고리 (브랜드/협약/결과/특허번호) — 각 1점, 비율로 환산
  const hadResult = WIN_RESULT_KEYWORDS.some(k => searchText.includes(k.toLowerCase()));
  const hadPatent = hits.has('특허번호');
  const categoryHits = (hadBrand ? 1 : 0) + (hadAgreement ? 1 : 0) + (hadResult ? 1 : 0) + (hadPatent ? 1 : 0);
  result.keywordHitRatio = categoryHits / 4;

  // 4) 신뢰도 종합
  const confidence =
    0.4 * result.nameMatchScore +
    0.3 * (result.kaptVerified ? 1 : 0) +
    0.2 * (result.evidenceCount > 0 ? 1 : 0) +
    0.1 * result.keywordHitRatio;
  result.confidence = Number(confidence.toFixed(3));

  // 5) 자동 확정 가능 여부
  if (result.nameMatchScore < AUTO_WIN_NAME_MATCH_FLOOR && !result.kaptVerified) {
    result.shouldAutoWin = false;
    result.reason = `단지명 매칭 ${result.nameMatchScore.toFixed(2)} < ${AUTO_WIN_NAME_MATCH_FLOOR} (KAPT 검증도 없음)`;
  } else if (result.confidence >= AUTO_WIN_CONFIDENCE_THRESHOLD) {
    result.shouldAutoWin = true;
    result.reason = `신뢰도 ${result.confidence.toFixed(2)} ≥ ${AUTO_WIN_CONFIDENCE_THRESHOLD}`;
  } else {
    result.shouldAutoWin = false;
    result.reason = `신뢰도 ${result.confidence.toFixed(2)} < ${AUTO_WIN_CONFIDENCE_THRESHOLD}`;
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Firebase 업데이트 패치 빌더 (RTDB multi-path update 용)
// ────────────────────────────────────────────────────────────────────

function nowISO() { return new Date().toISOString(); }

/**
 * 결과 입력 직후 호출 — 자동 검증 시도 + verification 패치 반환.
 *
 * @param {Object} pt 변경 전 PT (또는 변경 직후 results 가 갱신된 PT)
 * @param {string} assignee
 * @param {string} resultValue '승'|'무'|'패'|'지원'
 * @param {Object} ctx { byUserName }
 * @returns {{ patch: Object, status: string, history: Object, autoSource: Object|null }}
 */
export function buildVerificationOnResultClick(pt, assignee, resultValue, ctx = {}) {
  if (!pt?.id || !assignee || !resultValue) {
    return { patch: {}, status: null, history: null, autoSource: null };
  }
  const ptId = pt.id;
  const base = `pt/${ptId}/verification/${assignee}`;
  const prevStatus = pt.verification?.[assignee]?.status || null;
  const at = nowISO();
  const by = ctx.byUserName || assignee;

  let nextStatus = VERIFICATION_STATUS.SELF_CHECKED;
  let autoSource = null;
  let needReviewReason = null;
  let auxLog = null;  // 추가 history 항목 (자동 전이 시)

  // 1) 기본: self_checked + selfCheckedValue
  const patch = {
    [`${base}/status`]: nextStatus,
    [`${base}/selfCheckedValue`]: resultValue,
    [`${base}/updatedAt`]: at,
    [`${base}/createdAt`]: prevStatus ? undefined : at,  // 신규일 때만
  };

  // 2) 승리 자동 확인 시도
  if (resultValue === '승') {
    const conf = computeAutoWinConfidence(pt, assignee);
    if (conf.shouldAutoWin) {
      // auto_win_checked + 즉시 verified_win 으로 전이
      nextStatus = VERIFICATION_STATUS.VERIFIED_WIN;
      autoSource = {
        type: conf.evidenceCount > 0 ? 'evidence' : (conf.kaptVerified ? 'kapt' : 'memo'),
        confidence: conf.confidence,
        nameMatchScore: conf.nameMatchScore,
        kaptVerified: conf.kaptVerified,
        evidenceCount: conf.evidenceCount,
        keywordsHit: conf.keywordsHit,
        keywordHitRatio: conf.keywordHitRatio,
        primaryFileId: conf.primaryFileId,
        verifiedAt: at,
      };
      patch[`${base}/status`] = nextStatus;
      patch[`${base}/autoSource`] = autoSource;
      auxLog = {
        at, by: 'system', action: 'auto_win_check',
        from: VERIFICATION_STATUS.SELF_CHECKED, to: nextStatus,
        meta: { confidence: conf.confidence, source: autoSource.type, reason: conf.reason },
      };
    } else {
      // need_review
      nextStatus = VERIFICATION_STATUS.NEED_REVIEW;
      needReviewReason = conf.reason;
      patch[`${base}/status`] = nextStatus;
      patch[`${base}/needReviewReason`] = needReviewReason;
      patch[`${base}/autoSource`] = {  // 신뢰도 근거 보존 (수동 검증 시 참고)
        type: 'auto_rejected',
        confidence: conf.confidence,
        nameMatchScore: conf.nameMatchScore,
        kaptVerified: conf.kaptVerified,
        evidenceCount: conf.evidenceCount,
        keywordsHit: conf.keywordsHit,
        keywordHitRatio: conf.keywordHitRatio,
      };
    }
  } else if (resultValue === '무' || resultValue === '패') {
    // 무/패는 자동 검증 대상 아님 — 일단 need_review (수동으로 verified_draw/loss 확정)
    nextStatus = VERIFICATION_STATUS.NEED_REVIEW;
    needReviewReason = `${resultValue} 결과 — 수동 검증 필요`;
    patch[`${base}/status`] = nextStatus;
    patch[`${base}/needReviewReason`] = needReviewReason;
  }
  // '지원' 은 self_checked 그대로 (cascade 룰은 settlement 에서 처리)

  // 3) history push (RTDB push key 위임)
  const historyEntry = {
    at, by, action: prevStatus ? 'self_check_update' : 'self_check',
    from: prevStatus, to: patch[`${base}/status`],
    meta: { selfCheckedValue: resultValue, ...(needReviewReason ? { reason: needReviewReason } : {}) },
  };

  return {
    patch,
    status: patch[`${base}/status`],
    history: historyEntry,
    auxHistory: auxLog,  // auto_win 추가 history (있으면)
    autoSource,
  };
}

/**
 * 수동 검증 액션 적용 패치 빌더.
 *
 * @param {Object} pt
 * @param {string} assignee
 * @param {string} action VERIFICATION_ACTION 중 1개
 * @param {Object} ctx { byUserName, byRole, note }
 */
export function buildManualVerificationPatch(pt, assignee, action, ctx = {}) {
  if (!pt?.id || !assignee || !action) {
    return { patch: {}, status: null, history: null };
  }
  const note = (ctx.note || '').trim();
  if (!note && action !== VERIFICATION_ACTION.HOLD) {
    return { error: '확인 사유/근거 메모는 필수입니다.' };
  }
  const ptId = pt.id;
  const base = `pt/${ptId}/verification/${assignee}`;
  const prevStatus = pt.verification?.[assignee]?.status || null;
  const at = nowISO();
  const by = ctx.byUserName || 'admin';
  const role = ctx.byRole === 'admin' ? 'admin' : 'staff';

  const STATUS_MAP = {
    [VERIFICATION_ACTION.CONFIRM_WIN]:  VERIFICATION_STATUS.VERIFIED_WIN,
    [VERIFICATION_ACTION.CONFIRM_DRAW]: VERIFICATION_STATUS.VERIFIED_DRAW,
    [VERIFICATION_ACTION.CONFIRM_LOSS]: VERIFICATION_STATUS.VERIFIED_LOSS,
    [VERIFICATION_ACTION.HOLD]:         VERIFICATION_STATUS.NEED_REVIEW,
    [VERIFICATION_ACTION.EXCLUDE]:      VERIFICATION_STATUS.EXCLUDED,
  };
  const nextStatus = STATUS_MAP[action];
  if (!nextStatus) return { error: 'unknown action: ' + action };

  const FINAL_RESULT_MAP = {
    [VERIFICATION_ACTION.CONFIRM_WIN]:  'win',
    [VERIFICATION_ACTION.CONFIRM_DRAW]: 'draw',
    [VERIFICATION_ACTION.CONFIRM_LOSS]: 'loss',
    [VERIFICATION_ACTION.HOLD]:         'hold',
    [VERIFICATION_ACTION.EXCLUDE]:      'exclude',
  };

  const manualVerification = {
    verifiedAt: at,
    verifiedBy: by,
    verifiedRole: role,
    finalResult: FINAL_RESULT_MAP[action],
    note,
    action,
  };

  const patch = {
    [`${base}/status`]: nextStatus,
    [`${base}/manualVerification`]: manualVerification,
    [`${base}/updatedAt`]: at,
  };

  const historyEntry = {
    at, by, action: 'manual_check',
    from: prevStatus, to: nextStatus,
    meta: { finalResult: FINAL_RESULT_MAP[action], role, note: note || null },
  };

  return { patch, status: nextStatus, history: historyEntry, manualVerification };
}

// ────────────────────────────────────────────────────────────────────
// 정산·보고서 통합 헬퍼
// ────────────────────────────────────────────────────────────────────

/**
 * 최종 실적에 반영 가능한지 — verified_* 또는 auto_win_checked 만 통과.
 * verification 자체가 없으면 (구버전 PT) 기존 룰 fallback 위해 null 반환.
 */
export function isFinallyVerified(pt, assignee) {
  const v = pt?.verification?.[assignee];
  if (!v?.status) return null;  // 구버전 PT — 호출자가 fallback 결정
  return FINAL_VERIFIED_STATUSES.has(v.status);
}

/**
 * verification 에서 최종 결과(승/무/패) 추출.
 * @returns {'승'|'무'|'패'|null}
 */
export function getVerifiedResult(pt, assignee) {
  const v = pt?.verification?.[assignee];
  if (!v?.status) return null;
  switch (v.status) {
    case VERIFICATION_STATUS.VERIFIED_WIN:
    case VERIFICATION_STATUS.AUTO_WIN_CHECKED:
      return '승';
    case VERIFICATION_STATUS.VERIFIED_DRAW: return '무';
    case VERIFICATION_STATUS.VERIFIED_LOSS: return '패';
    default: return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// 탭/카운트 분류 (검증 관리 페이지용)
// ────────────────────────────────────────────────────────────────────

export const VERIFICATION_TAB_KEYS = [
  'all', 'auto_win', 'need_review', 'manual_done',
  'win', 'draw', 'loss', 'excluded',
];

export function classifyForTab(verification) {
  if (!verification?.status) return null;
  const s = verification.status;
  const tabs = ['all'];
  if (s === VERIFICATION_STATUS.AUTO_WIN_CHECKED || (s === VERIFICATION_STATUS.VERIFIED_WIN && verification.autoSource?.type !== 'auto_rejected')) {
    if (verification.autoSource && !verification.manualVerification) tabs.push('auto_win');
  }
  if (s === VERIFICATION_STATUS.NEED_REVIEW) tabs.push('need_review');
  if (verification.manualVerification && (s === VERIFICATION_STATUS.VERIFIED_WIN || s === VERIFICATION_STATUS.VERIFIED_DRAW || s === VERIFICATION_STATUS.VERIFIED_LOSS)) tabs.push('manual_done');
  if (s === VERIFICATION_STATUS.VERIFIED_WIN) tabs.push('win');
  if (s === VERIFICATION_STATUS.VERIFIED_DRAW) tabs.push('draw');
  if (s === VERIFICATION_STATUS.VERIFIED_LOSS) tabs.push('loss');
  if (s === VERIFICATION_STATUS.EXCLUDED) tabs.push('excluded');
  return tabs;
}

export const VERIFICATION_STATUS_LABEL = {
  [VERIFICATION_STATUS.UNCHECKED]:        '미검증',
  [VERIFICATION_STATUS.SELF_CHECKED]:     '담당자 체크',
  [VERIFICATION_STATUS.AUTO_WIN_CHECKED]: '자동 승리 확인',
  [VERIFICATION_STATUS.NEED_REVIEW]:      '검증필요',
  [VERIFICATION_STATUS.MANUAL_CHECKED]:   '수동 검증 중',
  [VERIFICATION_STATUS.VERIFIED_WIN]:     '승리 확정',
  [VERIFICATION_STATUS.VERIFIED_DRAW]:    '무승부 확정',
  [VERIFICATION_STATUS.VERIFIED_LOSS]:    '패배 확정',
  [VERIFICATION_STATUS.EXCLUDED]:         '제외',
};
