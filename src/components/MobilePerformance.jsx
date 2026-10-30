import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildRow, FILTERS, matchesWho, matchesSearch, sortByPriority, kpis, quarterPts, quarterMeta, formatWon, mmdd, todayKey, ptsBeforeQuarter, isCarryover,
  settlementStep, SETTLEMENT_STEPS, kaptCandidateText, nextReviewId,
} from '../utils/workbench.js';
import { calculateSettlementAmount, deriveAssigneeResult, getQuarterKey } from '../utils/settlement.js';
import MobileTabBar from './MobileTabBar.jsx';

// 관리자 실적 모바일 (#5c) — [고정 헤더: 분기 · 검색 · 분기정산 · 담당/상태 필터] + [KPI · 카드 목록] + [고정 하단 탭].
// 카드 탭 → 상세 바텀시트. 저장은 실적 작업대(#2a)와 같은 콜백.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c',
};
const RES = { 승: ['#dcfce7', '#15803d', '#86efac'], 무: ['#fef3c7', '#b45309', '#fcd34d'], 패: ['#fef2f2', '#b91c1c', '#fca5a5'], 지원: ['#dbeafe', '#0F4C75', '#93c5fd'] };
const VERIFY = { verified: ['K-APT 검증', '#dcfce7', '#15803d'], needs_review: ['검토필요', '#fef3c7', '#b45309'], cancelled: ['취소공고', '#fef2f2', '#b91c1c'] };
const STL = {
  unsettled: ['미정산', '#f1f5f9', '#475569'], needs_review: ['검토필요', '#fef3c7', '#b45309'], requested: ['정산요청', '#dbeafe', '#0F4C75'],
  confirmed: ['정산확정', '#BBE1FA', '#0F4C75'], completed: ['정산완료', '#dcfce7', '#15803d'], excluded: ['제외', '#f8fafc', '#94a3b8'],
};
const RESULT_KEYS = ['승', '무', '패', '지원'];
const CHIPS = [['all', '전체'], ['review', '검토필요'], ['pending', '미입력'], ['requested', '정산요청'], ['win', '승'], ['loss', '패']];
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' });
const iconBtn = { height: 36, minWidth: 36, padding: '0 10px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' };
const sheetWrap = { position: 'absolute', inset: 0, background: 'rgba(27,38,44,.45)', display: 'flex', alignItems: 'flex-end', zIndex: 2 };
const sheet = { width: '100%', maxHeight: '90%', overflow: 'auto', background: '#fff', borderRadius: '18px 18px 0 0', padding: '10px 18px 30px', boxShadow: '0 -12px 40px rgba(15,23,42,.18)', boxSizing: 'border-box' };
const grab = <div style={{ width: 36, height: 4, borderRadius: 2, background: C.strong, margin: '0 auto 14px' }} />;

function quarterOptions(now = new Date()) {
  const y = now.getFullYear();
  const out = [];
  for (let yy = y; yy >= y - 1; yy--) for (let q = 4; q >= 1; q--) out.push(`${yy}-Q${q}`);
  return out;
}

export default function MobilePerformance({
  initialFilter,          // 메인에서 넘어올 때 첫 필터(예: 'review')
  ptSchedules,
  assigneeNames,
  tabs,                   // MobileTabBar 탭 정의
  onOpenQuarterSettlement,
  onSetResult,            // (pt, assignee, result) => void
  onToggleSettlementFlag, // (pt, assignee, flag, checked) => void
  onOpenKaptCandidates,   // (pt) => void
  onKaptManualApprove,    // (pt, assignee) => void
  onKaptCancel,           // (pt) => void
  onLegacy,               // 이전 화면
  topInset = 0,           // 상단 고정 배너(PWA 설치 안내) 높이
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const today = todayKey(now);
  const [quarterKey, setQuarterKey] = useState(getQuarterKey());
  const [filter, setFilter] = useState(initialFilter && FILTERS[initialFilter] ? initialFilter : 'all');
  const [who, setWho] = useState('전체');
  const [whoSheet, setWhoSheet] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const meta = useMemo(() => quarterMeta(quarterKey, now), [quarterKey, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const minuteKey = `${today} ${now.getHours()}:${now.getMinutes()}`;
  const allRows = useMemo(() => quarterPts(ptSchedules || [], quarterKey).map(pt => buildRow(pt, today, now)), [ptSchedules, quarterKey, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // PC 실적과 같은 범위 — 목록·칩 건수엔 이전 분기 미확인(결과 미입력·검토필요)도 포함, KPI는 이번 분기만
  const carryRows = useMemo(() => ptsBeforeQuarter(ptSchedules || [], quarterKey)
    .map(pt => ({ ...buildRow(pt, today, now), carry: true })).filter(isCarryover), [ptSchedules, quarterKey, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const listRows = useMemo(() => [...allRows, ...carryRows], [allRows, carryRows]);
  const pick = r => matchesSearch(r, search) && matchesWho(r, who);
  const byWho = useMemo(() => allRows.filter(pick), [allRows, search, who]); // eslint-disable-line react-hooks/exhaustive-deps
  const listByWho = useMemo(() => listRows.filter(pick), [listRows, search, who]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => sortByPriority(listByWho.filter(FILTERS[filter] || FILTERS.all)), [listByWho, filter]);
  const k = kpis(byWho);
  const count = key => listByWho.filter(FILTERS[key]).length;
  const selected = selectedId ? listRows.find(r => r.id === selectedId) || null : null;

  // 다음 검토필요 행으로 시트 내용 교체 — 없으면 닫힘
  const nextReview = () => setSelectedId(nextReviewId(sortByPriority(listByWho), selectedId));

  return createPortal(
    <div style={{ position: 'fixed', top: topInset, left: 0, right: 0, bottom: 0, zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.muted, color: C.ink, fontVariantNumeric: 'tabular-nums', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      {/* 고정 헤더 */}
      <header style={{ flex: 'none', background: '#fff', borderBottom: `1px solid ${C.line}`, padding: 'calc(env(safe-area-inset-top) + 14px) 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>실적</h1>
          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>분기</span>
            <select value={quarterKey} onChange={e => { setQuarterKey(e.target.value); setSelectedId(null); }} style={{ appearance: 'none', WebkitAppearance: 'none', border: 0, background: 'none', padding: '4px 16px 4px 4px', fontSize: 14, fontWeight: 700, color: C.text2, fontFamily: 'inherit', cursor: 'pointer' }}>
              {quarterOptions(now).map(q => <option key={q} value={q}>{q.replace('-', ' ')}</option>)}
            </select>
            <span aria-hidden="true" style={{ position: 'absolute', right: 2, fontSize: 10, color: C.text3, pointerEvents: 'none' }}>▾</span>
          </label>
          {onLegacy && <button type="button" onClick={onLegacy} style={{ padding: 0, border: 0, background: 'none', color: C.text4, fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>이전 화면</button>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setSearchOpen(o => !o)} aria-label="검색" aria-pressed={searchOpen} style={{ ...iconBtn, padding: 0, width: 36 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={C.text2} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </button>
          {onOpenQuarterSettlement && <button type="button" onClick={onOpenQuarterSettlement} style={iconBtn}>분기정산</button>}
        </div>
        {searchOpen && (
          <input autoFocus type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="현장명 · 담당 · 요청사 검색" aria-label="검색어"
            style={{ width: '100%', boxSizing: 'border-box', height: 40, marginTop: 10, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, fontFamily: 'inherit' }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
          <button type="button" onClick={() => setWhoSheet(true)} style={{ height: 34, padding: '0 12px', borderRadius: 999, border: `1px solid ${C.brand}`, background: '#fff', color: C.brand, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flex: 'none' }}>담당 {who} ▾</button>
          <span aria-hidden="true" style={{ width: 1, height: 20, background: C.line, flex: 'none' }} />
          {CHIPS.map(([key, label]) => {
            const on = filter === key;
            const warn = key === 'review' && !on;
            return (
              <button key={key} type="button" aria-pressed={on} onClick={() => setFilter(key)} style={{ height: 34, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? C.brand : warn ? '#fde68a' : C.line}`, background: on ? C.brand : warn ? '#fef3c7' : '#fff', color: on ? '#fff' : warn ? '#b45309' : C.text2, fontSize: 13, fontWeight: on ? 700 : 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flex: 'none' }}>
                {label} {key === 'all' ? listByWho.length : count(key)}
              </button>
            );
          })}
        </div>
      </header>

      {/* 스크롤 — KPI · 카드 */}
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {[['PT', k.total, C.ink], ['승', k.w, '#15803d'], ['패', k.l, C.red], ['승률', `${k.rate}%`, C.brand]].map(([l, v, color]) => (
            <div key={l} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 11.5, color: C.text3 }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 2, letterSpacing: '-.02em' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12.5, color: C.text3, margin: '14px 2px 8px' }}>
          <span>{rows.length}건{carryRows.length ? ' · 이전 분기 미확인 포함' : ''} · 처리 우선 정렬</span>
          {meta && <span style={{ marginLeft: 'auto', color: C.red, fontWeight: 700 }}>Q{meta.quarter} 마감 {meta.ddayText}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.length === 0 && <div style={{ padding: 28, textAlign: 'center', fontSize: 13.5, color: C.text4, background: '#fff', borderRadius: 14, border: `1px solid ${C.line}` }}>조건에 맞는 PT가 없어요</div>}
          {rows.map(r => {
            const res = r.result ? RES[r.result] : null;
            const v = r.verify ? VERIFY[r.verify] : null;
            const st = r.stl ? STL[r.stl] : null;
            return (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink, padding: '12px 14px', borderRadius: 14, background: r.isReview ? '#fffbeb' : '#fff', border: `1px solid ${r.isReview ? '#fde68a' : C.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.text3 }}>
                  <span>{mmdd(r.date)} · {r.main || '미배정'}{r.sups.length ? ` 외 ${r.sups.length}` : ''}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    {res ? <span style={pill(res[0], res[1])}>{r.result}</span>
                      : r.isPending ? <span style={pill('#fef3c7', '#b45309')}>미입력</span>
                      : <span style={pill('#f1f5f9', C.text4)}>예정</span>}
                  </span>
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.pt.siteName || '(현장명 없음)'}</div>
                {(v || st || r.amount !== null) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    {v && <span style={pill(v[1], v[2])}>{v[0]}</span>}
                    {st && st[0] !== v?.[0] && <span style={pill(st[1], st[2])}>{st[0]}</span>}
                    {r.amount !== null && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>{formatWon(r.amount)}</span>}
                  </div>
                )}
                {r.isReview && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #fde68a', fontSize: 12, color: '#b45309' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kaptCandidateText(r.pt)}</span>
                    <span style={{ fontWeight: 700, flex: 'none' }}>처리 ›</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </main>

      <MobileTabBar tabs={tabs} />

      {/* 담당자 선택 시트 */}
      {whoSheet && (
        <div onClick={() => setWhoSheet(false)} style={sheetWrap}>
          <div role="dialog" aria-label="담당자 선택" onClick={e => e.stopPropagation()} style={sheet}>
            {grab}
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>담당자</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['전체', ...(assigneeNames || [])].map(n => {
                const on = who === n;
                return <button key={n} type="button" onClick={() => { setWho(n); setWhoSheet(false); }} style={{ height: 44, borderRadius: 10, border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.active : '#fff', color: on ? C.brand : C.ink, fontSize: 14, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{n}</button>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* 상세 시트 */}
      {selected && (
        <div onClick={() => setSelectedId(null)} style={sheetWrap}>
          <div role="dialog" aria-label="현장 상세" onClick={e => e.stopPropagation()} style={sheet}>
            {grab}
            <DetailSheet row={selected} onClose={() => setSelectedId(null)} onNextReview={nextReview}
              onSetResult={onSetResult} onToggleSettlementFlag={onToggleSettlementFlag}
              onOpenKaptCandidates={onOpenKaptCandidates} onKaptManualApprove={onKaptManualApprove} onKaptCancel={onKaptCancel} />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function DetailSheet({ row, onClose, onNextReview, onSetResult, onToggleSettlementFlag, onOpenKaptCandidates, onKaptManualApprove, onKaptCancel }) {
  const pt = row.pt;
  const v = row.verify ? VERIFY[row.verify] : null;
  const st = row.stl ? STL[row.stl] : null;
  const stl = pt.settlement?.[row.main] || {};
  const stepIdx = settlementStep(row);
  const kapt = !row.has ? ['결과 입력 후 자동 검증', '승/무/패 입력 시 K-APT 자동 조회', C.muted, C.text3, C.line]
    : row.verify === 'verified' ? ['K-APT 검증 완료', '공고 매칭 · 정산 대상 자동 전환', '#dcfce7', '#15803d', '#bbf7d0']
    : row.verify === 'cancelled' ? ['취소공고 확인됨', '발주처 취소 · 정산 제외', '#fef2f2', '#b91c1c', '#fecaca']
    : row.verify === 'needs_review' ? ['K-APT 공고 미매칭', kaptCandidateText(pt), '#fef3c7', '#b45309', '#fde68a']
    : ['K-APT 검증 전', '아직 조회 기록이 없습니다', C.muted, C.text3, C.line];
  const kaptBtns = row.has && row.verify === 'needs_review'
    ? [onOpenKaptCandidates && ['후보 확인', () => onOpenKaptCandidates(pt), 'primary'], onKaptManualApprove && ['수동 승인', () => onKaptManualApprove(pt, row.main), 'neutral'], onKaptCancel && ['취소공고', () => onKaptCancel(pt), 'danger']].filter(Boolean)
    : [];
  const btnTone = t => t === 'primary' ? { border: 0, background: C.brand, color: '#fff', fontWeight: 700 }
    : t === 'danger' ? { border: '1px solid #fecaca', background: '#fff', color: C.red, fontWeight: 600 }
    : { border: `1px solid ${C.strong}`, background: '#fff', color: C.ink, fontWeight: 600 };
  const flags = row.has && onToggleSettlementFlag ? [['requested', '정산요청'], ['selfSales', '본인영업'], ['settlementExcluded', '정산예외']] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {v && <span style={pill(v[1], v[2])}>{v[0]}</span>}
          {st && st[0] !== v?.[0] && <span style={pill(st[1], st[2])}>{st[0]}</span>}
          <button type="button" onClick={onClose} aria-label="닫기" style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 10, border: 0, background: C.line2, color: C.text2, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', marginTop: 8, lineHeight: 1.3 }}>{pt.siteName}</div>
        <div style={{ fontSize: 12.5, color: C.text3, marginTop: 3 }}>{[`${row.date} ${row.time}`.trim(), row.main || '미배정', pt.workType].filter(Boolean).join(' · ')}</div>
      </div>

      {/* 정산 단계 5점 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', position: 'relative' }}>
        <span aria-hidden="true" style={{ position: 'absolute', top: 8, left: '10%', right: '10%', height: 2, background: C.line }} />
        {SETTLEMENT_STEPS.map((label, i) => {
          const done = i < stepIdx, cur = i === stepIdx, warn = cur && i === 1 && row.isReview;
          return (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative' }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10.5, boxSizing: 'border-box', background: done ? '#16a34a' : warn ? '#fef3c7' : cur ? '#dbeafe' : '#fff', color: done ? '#fff' : warn ? '#b45309' : C.brand, border: done ? 0 : warn ? '1.5px solid #d97706' : cur ? `1.5px solid ${C.brand}` : `1.5px solid ${C.strong}` }}>{done ? '✓' : warn ? '!' : ''}</span>
              <span style={{ fontSize: 10, fontWeight: cur ? 700 : 500, color: done || cur ? C.ink : C.text4, whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* 결과 */}
      <div>
        <div role="group" aria-label={`결과 입력 · ${row.main}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {RESULT_KEYS.map(key => {
            const on = row.result === key, c = RES[key];
            return <button key={key} type="button" aria-pressed={on} disabled={!row.main || !onSetResult} onClick={() => onSetResult(pt, row.main, key)} style={{ height: 44, borderRadius: 10, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, background: on ? c[0] : '#fff', color: on ? c[1] : C.text3, border: `1px solid ${on ? c[2] : C.line}` }}>{key}</button>;
          })}
        </div>
        <div style={{ display: 'flex', fontSize: 12.5, color: C.text3, marginTop: 8 }}>
          <span>정산 예상 <b style={{ color: C.ink }}>{formatWon(row.amount)}</b></span>
          <span style={{ marginLeft: 'auto' }}>귀속 {row.date ? `Q${Math.ceil(+row.date.slice(5, 7) / 3)}` : '—'}</span>
        </div>
        {row.sups.map(name => {
          const res = deriveAssigneeResult(pt, name);
          const amt = calculateSettlementAmount(pt, name).amount;
          return (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '9px 11px', borderRadius: 10, background: C.muted, border: `1px dashed ${C.strong}`, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600 }}>{name}</span>
              <span style={{ color: C.text3 }}>{!res ? '결과 대기' : res === '제외' ? '제외 (주담 무)' : `${res} · ${formatWon(amt)}`}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: C.text4 }}>지원</span>
            </div>
          );
        })}
      </div>

      {/* K-APT */}
      <div style={{ padding: '10px 12px', borderRadius: 10, background: kapt[2], border: `1px solid ${kapt[4]}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: kapt[3] }}>{kapt[0]}</div>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{kapt[1]}</div>
        {kaptBtns.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kaptBtns.length}, 1fr)`, gap: 6, marginTop: 10 }}>
            {kaptBtns.map(([label, fn, tone]) => <button key={label} type="button" onClick={fn} style={{ height: 44, borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', ...btnTone(tone) }}>{label}</button>)}
          </div>
        )}
      </div>

      {flags.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13.5, color: C.text2 }}>
          {flags.map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!stl[key]} onChange={e => onToggleSettlementFlag(pt, row.main, key, e.target.checked)} style={{ width: 18, height: 18, margin: 0 }} />{label}
            </label>
          ))}
        </div>
      )}

      <button type="button" onClick={onNextReview} style={{ height: 48, borderRadius: 12, border: `1px solid ${C.brand}`, background: '#fff', color: C.brand, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>다음 검토 건 →</button>
    </div>
  );
}
