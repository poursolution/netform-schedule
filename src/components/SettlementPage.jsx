import React, { useMemo, useState } from 'react';
import AppSidebar from './AppSidebar.jsx';
import { quarterMeta, formatWon, mmdd } from '../utils/workbench.js';

// 분기정산 (#8a) — 사이드바 "정산" 전용 페이지.
// 수치·동작은 기존 분기정산 모달과 같은 buildQuarterSettlementCtx() 를 그대로 쓴다 (OPERATIONS §8 룰 변경 없음).

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12 };
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: bg, color: fg });
const btn = (kind, h = 34) => ({
  height: h, padding: '0 12px', borderRadius: h <= 30 ? 7 : 8, fontSize: h <= 30 ? 12.5 : 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  ...(kind === 'primary' ? { border: 0, background: C.brand, color: '#fff', fontWeight: 700 }
    : kind === 'outline' ? { border: `1px solid ${C.brand}`, background: '#fff', color: C.brand, fontWeight: 600 }
    : kind === 'danger' ? { border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 600 }
    : { border: `1px solid ${C.line}`, background: '#fff', color: C.ink }),
});
const disabledBtn = { background: C.strong, borderColor: C.strong, color: '#fff', cursor: 'not-allowed' };
const link = { padding: 0, border: 0, background: 'none', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' };
const ROW_GRID = '28px 110px 56px 96px 120px 84px 100px 92px minmax(0, 1fr)';
const ITEM_GRID = '48px minmax(0, 1fr) 56px 100px 110px 230px';
const RESULT_TONE = { 승: ['#dcfce7', '#15803d'], 무: ['#fef3c7', '#b45309'], 패: ['#fef2f2', '#b91c1c'], 지원: ['#dbeafe', C.brand], 감리: ['#f1f5f9', C.text2] };
const STATUS = { draft: ['초안', '#f1f5f9', C.text2], confirmed: ['확정', '#dbeafe', C.brand], completed: ['완료', '#dcfce7', '#15803d'] };

function quarterOptions(now, n = 8) {
  let y = now.getFullYear(), q = Math.ceil((now.getMonth() + 1) / 3);
  const out = [];
  for (let i = 0; i < n; i++) { out.push(`${y}-Q${q}`); q -= 1; if (q < 1) { q = 4; y -= 1; } }
  return out;
}
const fmtAt = iso => (iso ? `${+String(iso).slice(5, 7)}/${+String(iso).slice(8, 10)} ${String(iso).slice(11, 16)}` : '');

export default function SettlementPage({
  ctx, month, onMonthChange, statusFilter, onStatusFilterChange, loading, ptSchedules, todayStr, sidebar,
  onRemind,             // (names) => Promise<number 발송 수>
  onOpenReport,         // 김유림 PDF+Excel 발송 창
  onGoReview, onGoAssignee, onGoSupervision,
  onKaptCandidates, onManualApprove, onKaptCancel,
  onBackfill, onOpenActivityLog, onOpenLegacy,
}) {
  const {
    loadData, totals, rows, resolveReviewRequest, totalOpenReviews, confirmedCount, finalConfirmedCount, reliability,
    canRequestFinal, isQuarterClosed, quarterClosedAt, downloadQuarterClosingExcel, toggleQuarterClose,
    requestFinalConfirmation, updateRowStatus, triggerGenerate,
  } = ctx;
  const today = new Date(todayStr + 'T00:00:00');
  const meta = quarterMeta(month, today);
  const [open, setOpen] = useState(null);
  const [chk, setChk] = useState({});
  const [sent, setSent] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [menuFor, setMenuFor] = useState(null);

  const ptById = useMemo(() => Object.fromEntries((ptSchedules || []).map(p => [p.id, p])), [ptSchedules]);
  const n = rows.length;
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const reviewTotal = sum('reviewCount');
  const targetCount = sum('totalCount');
  const amount = sum('estimatedAmount');
  const unconfirmed = rows.filter(r => !r._conf?.confirmed).map(r => r.assignee);
  const allFinal = n > 0 && finalConfirmedCount === n;
  const reported = n > 0 && rows.every(r => r.reportedToPayroll);
  const pct = reliability.reliabilityPct;
  const pctTone = pct >= 90 ? '#15803d' : pct >= 70 ? '#b45309' : '#b91c1c';
  const canClose = allFinal && reported && !isQuarterClosed;
  const checkedNames = rows.filter(r => chk[r.assignee]).map(r => r.assignee);

  const steps = [
    { label: '분기정산 생성', meta: totals?.generatedAt ? `${fmtAt(totals.generatedAt)} · ${totals.generatedBy || ''}` : '아직 생성 전', done: !!totals?.generatedAt,
      action: <button type="button" disabled={loading} onClick={triggerGenerate} style={btn('secondary', 30)}>{totals?.generatedAt ? '정산 갱신' : '정산 생성'}</button> },
    { label: '담당자 1R 확인', meta: `${confirmedCount} / ${n} 이상없음`, done: n > 0 && confirmedCount === n,
      action: <button type="button" disabled={!unconfirmed.length || loading} onClick={async () => { const k = await onRemind(unconfirmed); if (k !== null) setSent(`미확인 ${unconfirmed.length}명에게 잔디 리마인드 ${k}건 발송됨 · 활동 로그 기록`); }} style={{ ...btn('outline', 30), ...(!unconfirmed.length ? disabledBtn : {}) }}>미확인 {unconfirmed.length}명 리마인드</button> },
    { label: '검증요청 처리', meta: `검토필요 ${reviewTotal}건${totalOpenReviews ? ` · 수정요청 ${totalOpenReviews}건` : ''}`, done: reviewTotal === 0 && totalOpenReviews === 0,
      action: <button type="button" disabled={!reviewTotal} onClick={onGoReview} style={{ ...btn('primary', 30), ...(!reviewTotal ? disabledBtn : {}) }}>검토필요 {reviewTotal}건 처리</button> },
    { label: '최종확정 (2R)', meta: `${finalConfirmedCount} / ${n}`, done: allFinal,
      action: <button type="button" disabled={!canRequestFinal || loading} title={canRequestFinal ? '' : '전원 1R 확인 + 수정요청 처리 후 가능'} onClick={requestFinalConfirmation} style={{ ...btn('secondary', 30), ...(!canRequestFinal ? disabledBtn : {}) }}>최종확정 요청 발송</button> },
    { label: '김유림 발송', meta: reported ? '발송 완료' : '전원 확정 후', done: reported,
      action: <button type="button" disabled={!allFinal} title={allFinal ? '' : '전원 최종확정 후 가능'} onClick={onOpenReport} style={{ ...btn('secondary', 30), ...(!allFinal ? disabledBtn : {}) }}>PDF + Excel 발송</button> },
  ];
  const current = steps.findIndex(s => !s.done);

  const isReviewPt = (pt, a) => pt && pt.kaptVerified?.status === 'needs_review' && !Object.keys(pt.evidenceFiles || {}).length && !pt.settlement?.[a]?.manualVerified;
  const verifyPill = pt => {
    const st = pt?.kaptVerified?.status;
    if (Object.keys(pt?.evidenceFiles || {}).length || st === 'verified') return <span style={pill('#dcfce7', '#15803d')}>K-APT 검증</span>;
    if (st === 'cancelled') return <span style={pill('#fef2f2', '#b91c1c')}>취소공고</span>;
    if (st === 'needs_review') return <span style={pill('#fef3c7', '#b45309')}>검토필요</span>;
    if (st === 'pending-admin-review') return <span style={pill('#dbeafe', C.brand)}>관리자 확인 대기</span>;
    return <span style={pill('#f1f5f9', C.text4)}>—</span>;
  };

  const bulk = async (kind) => {
    if (!checkedNames.length) return;
    if (kind === 'confirm') {
      for (const a of checkedNames) { const r = rows.find(x => x.assignee === a); if ((r?.status || 'draft') === 'draft') await updateRowStatus(a, 'confirmed'); }
    } else if (kind === 'resolve') {
      const targets = rows.filter(r => chk[r.assignee]).flatMap(r => r._reviewRequests.filter(q => q.status !== 'resolved').map(q => [r.assignee, q.id]));
      if (!targets.length) { alert('선택한 담당자에게 열린 수정요청이 없어요.'); return; }
      if (!window.confirm(`수정요청 ${targets.length}건을 처리완료로 바꾸고 담당자에게 잔디로 알립니다. 진행?`)) return;
      for (const [a, id] of targets) await resolveReviewRequest(a, id);
    } else if (kind === 'remind') {
      const k = await onRemind(checkedNames);
      if (k !== null) setSent(`${checkedNames.length}명에게 잔디 리마인드 ${k}건 발송됨 · 활동 로그 기록`);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.muted, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
      <AppSidebar {...sidebar} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 60, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>분기정산</h1>
          <select aria-label="분기" value={month} onChange={e => onMonthChange(e.target.value)} style={{ height: 32, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#fff' }}>
            {[...new Set([month, ...quarterOptions(today)])].map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          <span style={isQuarterClosed ? pill('#dcfce7', '#15803d') : pill('#dbeafe', C.brand)}>{isQuarterClosed ? `마감됨${quarterClosedAt ? ` · ${fmtAt(quarterClosedAt)}` : ''}` : '진행 중'}</span>
          <span style={{ fontSize: 12, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            마감 {meta?.closingText} (분기 다음달 30일) · <b style={{ color: (meta?.dday ?? 1) <= 3 ? '#b91c1c' : C.ink }}>{meta?.ddayText}</b> · 급여 반영 {meta?.payrollMonth} · 전달 김유림
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={loadData} disabled={loading} style={btn('secondary')}>{loading ? '불러오는 중…' : '새로고침'}</button>
          <div style={{ position: 'relative' }}>
            <button type="button" aria-expanded={exportOpen} onClick={() => setExportOpen(o => !o)} style={btn('secondary')}>내보내기 ▾</button>
            {exportOpen && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 38, zIndex: 30, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 4, minWidth: 200, boxShadow: '0 8px 24px rgba(15,23,42,.12)' }}>
                <button type="button" role="menuitem" disabled={!isQuarterClosed} title={isQuarterClosed ? '' : '분기 마감 후 가능'} onClick={() => { setExportOpen(false); downloadQuarterClosingExcel(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, borderRadius: 6, background: 'none', fontSize: 13, fontFamily: 'inherit', cursor: isQuarterClosed ? 'pointer' : 'not-allowed', color: isQuarterClosed ? C.ink : C.text4 }}>마감 엑셀 (PT·주말)</button>
                <button type="button" role="menuitem" onClick={() => { setExportOpen(false); onOpenReport(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, borderRadius: 6, background: 'none', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>김유림 보고서 (미리보기·다운로드)</button>
              </div>
            )}
          </div>
          <button type="button" disabled={!canClose || loading} title={isQuarterClosed ? '이미 마감됨 — 해제는 아래 표 푸터에서' : canClose ? '' : '전원 최종확정 + 발송 후 가능'} onClick={toggleQuarterClose} style={{ ...btn('primary'), ...(!canClose ? disabledBtn : {}) }}>분기 마감</button>
        </div>

        <div style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 5단계 스테퍼 */}
          <section aria-label="정산 진행 단계" style={{ ...card, padding: '18px 18px 14px' }}>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
              {steps.map((s, i) => {
                const state = s.done ? 'done' : i === current ? 'cur' : 'todo';
                return (
                  <li key={s.label} aria-current={state === 'cur' ? 'step' : undefined} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6, padding: '0 6px' }}>
                    {i > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 12, right: '50%', width: '100%', height: 2, background: steps[i - 1].done ? '#16a34a' : C.line, zIndex: 0 }} />}
                    <span aria-hidden="true" style={{ position: 'relative', zIndex: 1, width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, ...(state === 'done' ? { background: '#16a34a', color: '#fff' } : state === 'cur' ? { background: C.brand, color: '#fff' } : { background: '#fff', color: C.text4, border: `1.5px solid ${C.strong}`, boxSizing: 'border-box' }) }}>{state === 'done' ? '✓' : i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: state === 'cur' ? 800 : 600 }}>{s.label}</span>
                    <span style={{ fontSize: 12, color: C.text3 }}>{s.meta}</span>
                    <span style={{ marginTop: 4 }}>{s.action}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* 요약 4카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 12 }}>
            <div style={{ background: C.brand, color: '#fff', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, opacity: .8 }}>예상 합계 · 대상 {targetCount}건 · 담당자 {n}명</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', marginTop: 4 }}>{amount.toLocaleString('ko-KR')}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2, opacity: .8 }}>원</span></div>
              <div style={{ fontSize: 12, opacity: .75, marginTop: 4 }}>승 {sum('winCount')} · 무 {sum('drawCount')} · 지원 {sum('supportCount')} · 집계 기준 PT 진행일</div>
            </div>
            <button type="button" onClick={onGoReview} style={{ ...card, border: `1px solid ${reviewTotal ? '#fde68a' : C.line}`, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: reviewTotal ? '#b45309' : C.text3 }}>검토필요</div>
              <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 4 }}><span style={{ fontSize: 24, fontWeight: 800 }}>{reviewTotal}건</span><span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand }}>처리 →</span></div>
            </button>
            <button type="button" onClick={onGoSupervision} style={{ ...card, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text3 }}>감리 금액 입력 대기</div>
              <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 4 }}><span style={{ fontSize: 24, fontWeight: 800 }}>{totals?.totalSupervisionPending || 0}건</span><span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.brand }}>입력 →</span></div>
            </button>
            <div style={{ ...card, border: `1px solid ${pct < 90 ? '#fecaca' : C.line}`, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text3 }}>검증 완료율</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}><span style={{ fontSize: 24, fontWeight: 800, color: pctTone }}>{pct}%</span><span style={{ fontSize: 12, color: C.text4 }}>권장 90%+</span></div>
              <div style={{ height: 5, borderRadius: 3, background: C.line2, marginTop: 8 }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pctTone }} /></div>
            </div>
          </div>

          {/* 발송 차단 안내 */}
          {pct < 90 && reliability.totalActive > 0 && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, fontSize: 13, color: '#7f1d1d' }}>
              <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', background: '#b91c1c', color: '#fff', fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>!</span>
              <span style={{ flex: 1 }}><b>지금은 발송할 수 없어요.</b> 미검증 {reliability.issues.unverified}건 중 {reviewTotal}건이 검토필요 — 검증 완료가 {pct}%라 급여 자료로 쓰기엔 위험합니다. 검토필요를 먼저 처리하면 단계 3이 풀립니다.</span>
              <button type="button" onClick={onGoReview} style={{ ...btn('primary', 32), background: '#b91c1c' }}>검토필요 {reviewTotal}건 보기</button>
            </div>
          )}

          {/* 담당자별 표 */}
          <section aria-label="담당자별" style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${C.line2}` }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>담당자별</h2>
              <span style={{ fontSize: 12, color: C.text4 }}>행 클릭 → PT별 내역 · 체크 → 일괄 처리</span>
              <div style={{ flex: 1 }} />
              <select aria-label="상태 필터" value={statusFilter} onChange={e => onStatusFilterChange(e.target.value)} style={{ height: 30, padding: '0 8px', border: `1px solid ${C.line}`, borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' }}>
                <option value="all">전체 상태</option><option value="draft">초안</option><option value="confirmed">확정</option><option value="completed">완료</option>
              </select>
            </div>
            {checkedNames.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: C.active, borderBottom: `1px solid ${C.accent}`, fontSize: 12.5 }}>
                <b style={{ color: C.brand }}>{checkedNames.length}명 선택</b>
                <button type="button" onClick={() => bulk('resolve')} style={btn('outline', 28)}>검증요청 처리완료</button>
                <button type="button" onClick={() => bulk('remind')} style={btn('outline', 28)}>리마인드 발송</button>
                <button type="button" disabled={isQuarterClosed} onClick={() => bulk('confirm')} style={{ ...btn('secondary', 28), ...(isQuarterClosed ? disabledBtn : {}) }}>일괄 확정</button>
                <button type="button" onClick={() => setChk({})} style={{ ...link, marginLeft: 'auto', color: C.text3 }}>선택 해제</button>
              </div>
            )}
            {sent && <div style={{ padding: '8px 18px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: 12.5, color: '#15803d' }}>✓ {sent}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: ROW_GRID, gap: 8, padding: '7px 18px', fontSize: 11, fontWeight: 600, color: C.text4, borderBottom: `1px solid ${C.line2}`, alignItems: 'center' }}>
              <input type="checkbox" aria-label="전체 선택" checked={n > 0 && checkedNames.length === n} onChange={e => setChk(e.target.checked ? Object.fromEntries(rows.map(r => [r.assignee, true])) : {})} />
              <span>담당자</span><span style={{ textAlign: 'right' }}>건수</span><span>승 / 무 / 지원</span><span style={{ textAlign: 'right' }}>예상금액</span><span>검토</span><span>1R 확인</span><span>최종확정</span><span />
            </div>
            {rows.map(r => {
              const a = r.assignee;
              const isOpen = open === a;
              const st = STATUS[r.status || 'draft'] || STATUS.draft;
              const conf = r._conf || {};
              return (
                <React.Fragment key={a}>
                  <div role="button" tabIndex={0} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : a); } }}
                    style={{ display: 'grid', gridTemplateColumns: ROW_GRID, gap: 8, alignItems: 'center', padding: '10px 18px', borderBottom: `1px solid ${C.line2}`, fontSize: 13, cursor: 'pointer', background: isOpen ? C.active : chk[a] ? C.muted : '#fff' }}>
                    <input type="checkbox" aria-label={`${a} 선택`} checked={!!chk[a]} onClick={e => e.stopPropagation()} onChange={e => setChk(c => ({ ...c, [a]: e.target.checked }))} />
                    <span style={{ fontWeight: 700 }}>{a} <span style={{ ...pill(st[1], st[2]), marginLeft: 4, fontSize: 10.5, padding: '1px 6px' }}>{st[0]}</span></span>
                    <span style={{ textAlign: 'right' }}>{r.totalCount}</span>
                    <span style={{ color: C.text3 }}><b style={{ color: '#15803d' }}>{r.winCount || 0}</b> / <b style={{ color: '#b45309' }}>{r.drawCount || 0}</b> / <b style={{ color: C.brand }}>{r.supportCount || 0}</b></span>
                    <b style={{ textAlign: 'right' }}>{formatWon(r.estimatedAmount || 0)}</b>
                    <span>{r.reviewCount ? <span style={pill('#fef3c7', '#b45309')}>{r.reviewCount}건</span> : <span style={pill('#dcfce7', '#15803d')}>완료</span>}</span>
                    <span>{conf.confirmed ? <span style={pill('#dcfce7', '#15803d')}>이상없음 ✓</span> : <span style={pill('#f1f5f9', C.text3)}>대기</span>}{r._openReviewCount ? <span style={{ ...pill('#fef3c7', '#b45309'), marginLeft: 4 }}>요청 {r._openReviewCount}</span> : null}</span>
                    <span>{conf.finalConfirmed ? <span style={pill('#dcfce7', '#15803d')}>확정</span> : conf.finalRequestedAt ? <span style={pill('#dbeafe', C.brand)}>요청됨</span> : <span style={pill('#f1f5f9', C.text3)}>요청 전</span>}</span>
                    <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', position: 'relative' }} onClick={e => e.stopPropagation()}>
                      {r.reviewCount > 0 && <button type="button" onClick={() => onGoAssignee(a, 'review')} style={btn('outline', 28)}>검토하기</button>}
                      <button type="button" aria-label={`${a} 더보기`} aria-expanded={menuFor === a} onClick={() => setMenuFor(m => (m === a ? null : a))} style={{ ...btn('secondary', 28), padding: '0 8px' }}>⋯</button>
                      {menuFor === a && (
                        <span role="menu" style={{ position: 'absolute', right: 0, top: 32, zIndex: 30, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 4, minWidth: 170, boxShadow: '0 8px 24px rgba(15,23,42,.12)', display: 'flex', flexDirection: 'column' }}>
                          {(r.status || 'draft') === 'draft' && <button type="button" role="menuitem" onClick={() => { setMenuFor(null); updateRowStatus(a, 'confirmed'); }} style={{ ...link, padding: '8px 10px', textAlign: 'left', fontSize: 13 }}>확정 처리</button>}
                          {r.status === 'confirmed' && <button type="button" role="menuitem" onClick={() => { setMenuFor(null); updateRowStatus(a, 'completed'); }} style={{ ...link, padding: '8px 10px', textAlign: 'left', fontSize: 13 }}>완료 처리</button>}
                          {r.status === 'completed' && <button type="button" role="menuitem" onClick={() => { setMenuFor(null); if (window.confirm('완료 상태를 다시 확정으로 되돌립니다. 진행?')) updateRowStatus(a, 'confirmed'); }} style={{ ...link, padding: '8px 10px', textAlign: 'left', fontSize: 13 }}>확정으로 되돌리기</button>}
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onGoAssignee(a, 'all'); }} style={{ ...link, padding: '8px 10px', textAlign: 'left', fontSize: 13 }}>실적 전체 보기</button>
                        </span>
                      )}
                    </span>
                  </div>
                  {isOpen && (
                    <div style={{ background: C.active, padding: '8px 18px 12px 46px', borderBottom: `1px solid ${C.line2}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: ITEM_GRID, gap: 8, padding: '6px 0', fontSize: 11, fontWeight: 600, color: C.text4 }}>
                        <span>일자</span><span>현장</span><span>결과</span><span>검증</span><span style={{ textAlign: 'right' }}>금액</span><span />
                      </div>
                      {[...(r.items || [])].sort((x, y) => String(x.ptDate || '').localeCompare(String(y.ptDate || ''))).map(it => {
                        const pt = ptById[it.ptId];
                        const tone = RESULT_TONE[it.result] || ['#f1f5f9', C.text4];
                        return (
                          <div key={it.ptId} style={{ display: 'grid', gridTemplateColumns: ITEM_GRID, gap: 8, alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${C.accent}`, fontSize: 12.5 }}>
                            <span style={{ color: C.text3 }}>{mmdd(it.ptDate)}</span>
                            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.siteName}</span>
                            <span><span style={pill(tone[0], tone[1])}>{it.result || '—'}</span></span>
                            <span>{verifyPill(pt)}</span>
                            <span style={{ textAlign: 'right', fontWeight: 700, color: it.amount ? C.ink : C.text4 }}>{formatWon(it.amount || 0)}</span>
                            <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                              {isReviewPt(pt, a) && (
                                <>
                                  <button type="button" onClick={() => onKaptCandidates(pt)} style={btn('primary', 28)}>후보 확인</button>
                                  <button type="button" onClick={() => onManualApprove(pt, a)} style={{ ...btn('secondary', 28), borderColor: C.strong }}>수동 승인</button>
                                  <button type="button" onClick={() => onKaptCancel(pt)} style={btn('danger', 28)}>취소공고</button>
                                </>
                              )}
                            </span>
                          </div>
                        );
                      })}
                      {(r._reviewRequests || []).filter(q => q.status !== 'resolved').map(q => (
                        <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12.5 }}>
                          <span style={{ color: '#b45309', fontWeight: 700 }}>수정요청</span>
                          <span style={{ flex: 1, minWidth: 0 }}>{q.text}</span>
                          <span style={{ color: C.text4, fontSize: 11.5 }}>{fmtAt(q.requestedAt)}</span>
                          <button type="button" onClick={() => resolveReviewRequest(a, q.id)} style={btn('outline', 28)}>처리완료</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, color: C.text3 }}>
                        <span>1R 확인: {conf.confirmed ? `이상없음 (${fmtAt(conf.confirmedAt)})` : '대기'}</span>
                        <span>검증요청 메모: {(r._reviewRequests || []).length ? `${r._reviewRequests.length}건 (열림 ${r._openReviewCount || 0})` : '없음'}</span>
                        <button type="button" onClick={() => onGoAssignee(a, 'all')} style={{ ...link, marginLeft: 'auto', color: C.brand, fontWeight: 700 }}>이 담당자 실적 전체 보기 →</button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {n === 0 && <div style={{ padding: 28, textAlign: 'center', fontSize: 13, color: C.text4 }}>{loading ? '불러오는 중…' : '이 분기 정산 대상이 없어요'}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', fontSize: 12, color: C.text4, flexWrap: 'wrap' }}>
              <span>합계 {targetCount}건 · {amount.toLocaleString('ko-KR')}원</span>
              <div style={{ flex: 1 }} />
              {onOpenActivityLog && <button type="button" onClick={onOpenActivityLog} style={{ ...link, color: C.text3 }}>활동 로그</button>}
              {onBackfill && <button type="button" disabled={loading || isQuarterClosed} onClick={onBackfill} style={{ ...link, color: isQuarterClosed ? C.strong : C.text3 }}>과거 데이터 보정</button>}
              {isQuarterClosed && <button type="button" onClick={toggleQuarterClose} style={{ ...link, color: '#6d28d9', fontWeight: 600 }}>마감 해제 (이력 남음)</button>}
              {onOpenLegacy && <button type="button" onClick={onOpenLegacy} style={{ ...link, color: C.text3 }}>이전 화면</button>}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
