import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import MethodChips from './MethodChips.jsx';
import { judgeResultByMethods } from '../utils/technologies.js';
import { calculateSettlementAmount, getQuarterKeyByConfirmDate } from '../utils/settlement.js';
import { parseAssignees } from '../utils/workbench.js';

// 결과 기록 모달 (#10a) · 모바일 시트 (#10b) — 기존 승리/무승부/패배 사유 입력 3개 모달을 하나로.
// 저장은 기존 saveResultWithReason 그대로 (필드 동일: 공고번호·공고문 공법·원인분석·경쟁사·예외 신청).

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const RESULTS = ['승', '무', '패', '지원'];
const TONE = { 승: ['#dcfce7', '#15803d', '#86efac'], 무: ['#fef3c7', '#b45309', '#fcd34d'], 패: ['#fef2f2', '#b91c1c', '#fca5a5'], 지원: ['#dbeafe', C.brand, '#93c5fd'] };
const LABEL = { 승: '승리', 무: '무승부', 패: '패배', 지원: '지원' };
const TAGS = {
  승: ['가격 경쟁력', '관계 영업', '공법 신뢰도', '레퍼런스', '빠른 대응'],
  lose: ['가격', '기존 업체 선호', '공법 이해 부족', '관계 부족', '입찰 조건', '일정'],
};
const PLACEHOLDER = { 승: '어떻게 이겼는지 한 줄 (예: 관리소장님이 지난 현장 하자 대응을 기억)', 무: '왜 무승부였는지 한 줄 (예: 공고에 타공법이 같이 들어감)', 패: '왜 졌는지 한 줄 (예: 기존 업체와 3년 거래)' };
const COMPETITORS = ['4A시스템', '금영ENC', '삼성방수', '한솔이엔지'];
const EXCEPTIONS = [
  ['tie_to_win', '영업적 승리 신청', '입찰은 무승부·패배지만 영업적 조건으로 승리 인정'],
  ['no_bid_to_win', '공고문 없는 현장', 'K-APT에 공고가 없는 현장 (교회·일반건물 등)'],
];

function splitReason(reason) {
  const text = String(reason || '');
  const [first, ...rest] = text.split('\n');
  const all = [...TAGS.승, ...TAGS.lose];
  const tokens = first.split(' · ').map(s => s.trim()).filter(Boolean);
  if (tokens.length && tokens.every(t => all.includes(t))) return { tags: tokens, text: rest.join('\n') };
  return { tags: [], text };
}

function Section({ n, title, hint, optional, children, mobile }) {
  return (
    <section style={{ padding: '16px 0', borderTop: `1px solid ${C.line2}` }}>
      <h3 style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 10px', fontSize: mobile ? 15 : 14, fontWeight: 800 }}>
        <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: optional ? C.strong : C.brand, color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-grid', placeItems: 'center', alignSelf: 'center' }}>{n}</span>
        {title}{hint && <span style={{ fontSize: 12, fontWeight: 400, color: C.text4 }}>{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

export default function ResultRecordModal({ data, setData, pt, onSave, onClose, onPickSupport, onKaptSearch, onOpenLegacy, mobile }) {
  const res = data.result;
  const a = data.assignee;
  const lose = res === '무' || res === '패';
  const init = useMemo(() => splitReason(data.reason), [data.scheduleId, data.assignee]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tags, setTags] = useState(init.tags);
  const [text, setText] = useState(init.text);
  const [excOpen, setExcOpen] = useState(!!data.requestException);
  const [compEtc, setCompEtc] = useState(!!data.customCompetitor);
  useEffect(() => {
    if (!mobile) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobile]);
  if (!pt) return null;

  const set = patch => setData(prev => ({ ...prev, ...patch }));
  const methodStr = data.announcementMethods ?? pt.announcementMethods ?? '';
  const methods = String(methodStr).split(',').map(s => s.trim()).filter(Boolean);
  const verdict = methods.length ? judgeResultByMethods(methods) : null;
  const kv = pt.kaptVerified || {};
  const bidNo = data.bidNo || pt.bidNo || '';
  // K-APT 박스 상태 — 이미 돌아간 자동 검증 결과(pt.kaptVerified)로 정한다
  const kaptState = kv.status === 'verified' ? 'found' : kv.status === 'needs_review' ? 'none' : 'manual';

  const preview = { ...pt, results: { ...(pt.results || {}), [a]: res } };
  const est = res ? calculateSettlementAmount(preview, a) : { amount: 0 };
  const quarter = getQuarterKeyByConfirmDate(pt.date);
  const tokens = parseAssignees(pt.ptAssignee);
  const d = pt.date ? new Date(pt.date + 'T00:00:00') : null;
  const comps = [...COMPETITORS, ...(data.availableCompetitors || []).filter(c => !COMPETITORS.includes(c))];
  const selComps = data.selectedCompetitors || [];

  const pickResult = r => {
    if (r === '지원') { onPickSupport(); return; }
    set({ result: r, ...(r === '승' ? { requestException: false, exceptionType: null } : {}) });
    if (r === '승') setExcOpen(false);
  };
  const toggleTag = t => setTags(list => (list.includes(t) ? list.filter(x => x !== t) : [...list, t]));
  const save = () => {
    const tagList = tags.filter(t => (res === '승' ? TAGS.승 : TAGS.lose).includes(t));
    const reason = [tagList.join(' · '), text.trim()].filter(Boolean).join('\n');
    onSave({
      reason,
      announcementMethods: data.announcementMethods ?? '',
      ...(lose ? {} : { requestException: false, exceptionType: null, selectedCompetitors: [], customCompetitor: '' }),
    });
  };

  const inputStyle = { width: '100%', boxSizing: 'border-box', height: mobile ? 44 : 40, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: mobile ? 15 : 13.5, fontFamily: 'inherit' };
  const chip = (on, tone) => ({ height: mobile ? 36 : 30, padding: '0 12px', borderRadius: 999, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, border: `1px solid ${on ? tone : C.line}`, background: on ? `${tone}14` : '#fff', color: on ? tone : C.text2 });
  const smallBtn = primary => ({ height: mobile ? 40 : 30, padding: '0 12px', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600, ...(primary ? { border: 0, background: C.brand, color: '#fff' } : { border: `1px solid ${C.line}`, background: '#fff', color: C.ink }) });

  const body = (
    <>
      {/* 1 공고 */}
      <Section n="1" title="공고" hint="K-APT 자동 검증에 쓰여요" mobile={mobile}>
        {kaptState === 'found' && (
          <div style={{ padding: '12px 14px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>✓ K-APT 공고 자동 매칭</div>
            <div style={{ fontSize: 12.5, color: C.text2, marginTop: 4 }}>{[bidNo && `공고 ${bidNo}`, kv.matchedSite || kv.extractedSite || pt.siteName, pt.workType].filter(Boolean).join(' · ')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'auto auto', justifyContent: mobile ? 'stretch' : 'start', gap: 6, marginTop: 8 }}>
              <a href={`https://www.k-apt.go.kr/bid/bidList.do?type=3&aptName=${encodeURIComponent(pt.siteName || '')}`} target="_blank" rel="noreferrer" style={{ ...smallBtn(false), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>공고 열기</a>
              <button type="button" onClick={() => onKaptSearch(pt)} style={smallBtn(false)}>다른 공고</button>
            </div>
          </div>
        )}
        {kaptState === 'none' && (
          <div style={{ padding: '12px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309', flex: 1 }}>K-APT에서 공고를 찾지 못했어요</span>
              <button type="button" onClick={() => onKaptSearch(pt)} style={smallBtn(false)}>다시 검색</button>
            </div>
            <input aria-label="공고번호" value={data.bidNo || ''} onChange={e => set({ bidNo: e.target.value })} placeholder="공고번호 직접 입력 (예: P202412345)" style={{ ...inputStyle, marginTop: 8, fontFamily: 'monospace' }} />
          </div>
        )}
        {kaptState === 'manual' && (
          <div style={{ padding: '12px 14px', background: C.muted, border: `1px solid ${C.line}`, borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: C.text3, flex: 1 }}>공고번호를 알면 적어주세요 · 저장하면 K-APT에서 자동으로 찾아봐요</span>
              <button type="button" onClick={() => onKaptSearch(pt)} style={smallBtn(false)}>공고 찾기</button>
            </div>
            <input aria-label="공고번호" value={data.bidNo || ''} onChange={e => set({ bidNo: e.target.value })} placeholder={pt.bidNo ? `현재 ${pt.bidNo}` : '공고번호 (선택)'} style={{ ...inputStyle, marginTop: 8, fontFamily: 'monospace' }} />
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 6 }}>공고문에 적힌 공법</div>
          <MethodChips value={methodStr} onChange={v => set({ announcementMethods: v })} size={mobile ? 40 : 32} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, padding: '10px 12px', background: C.muted, borderRadius: 10, fontSize: 12.5, color: C.text3 }}>
          자동 판정
          {verdict ? <span style={{ padding: '2px 8px', borderRadius: 999, background: TONE[verdict][0], color: TONE[verdict][1], fontWeight: 700 }}>{verdict}</span> : <span style={{ color: C.text4 }}>공법을 고르면 보여요</span>}
          <span style={{ color: C.text4 }}>우리 공법만 → 승 · 우리 + 타공법 → 무 · 타공법만 → 패</span>
          {verdict && verdict !== res && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <span style={{ color: '#b45309', fontWeight: 600 }}>선택한 결과와 달라요</span>
              <button type="button" onClick={() => pickResult(verdict)} style={smallBtn(true)}>판정대로 바꾸기</button>
            </span>
          )}
        </div>
      </Section>

      {/* 2 사유 */}
      <Section n="2" title="사유" hint="태그 몇 개 + 한 줄이면 충분" mobile={mobile}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(res === '승' ? TAGS.승 : TAGS.lose).map(t => <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)} style={chip(tags.includes(t), C.brand)}>{t}</button>)}
        </div>
        <textarea aria-label="사유" value={text} onChange={e => setText(e.target.value)} placeholder={PLACEHOLDER[res] || ''} style={{ ...inputStyle, height: 64, padding: 10, marginTop: 8, resize: 'vertical' }} />
        {lose && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 6 }}>경쟁사</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {comps.map(c => {
                const on = selComps.includes(c);
                return <button key={c} type="button" aria-pressed={on} onClick={() => set({ selectedCompetitors: on ? selComps.filter(x => x !== c) : [...selComps, c] })} style={chip(on, C.brand)}>{c}</button>;
              })}
              <button type="button" aria-pressed={compEtc} onClick={() => { if (compEtc) set({ customCompetitor: '' }); setCompEtc(o => !o); }} style={chip(compEtc, C.brand)}>기타</button>
            </div>
            {compEtc && (
              <label style={{ display: 'block', marginTop: 8, fontSize: 12, fontWeight: 600, color: C.text2 }}>
                기타 업체
                <input value={data.customCompetitor || ''} onChange={e => set({ customCompetitor: e.target.value })} placeholder="업체명 직접 입력" style={{ ...inputStyle, display: 'block', marginTop: 4, borderColor: C.accent }} />
              </label>
            )}
          </div>
        )}
      </Section>

      {/* 3 승리 예외 신청 — 무/패만, 기본 접힘 */}
      {lose && (
        <section style={{ padding: '14px 0 4px', borderTop: `1px solid ${C.line2}` }}>
          <button type="button" aria-expanded={excOpen} onClick={() => setExcOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0, border: 0, background: 'none', fontFamily: 'inherit', cursor: 'pointer', color: C.ink, textAlign: 'left' }}>
            <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: C.strong, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>3</span>
            <span style={{ fontSize: mobile ? 15 : 14, fontWeight: 800 }}>승리 예외 신청</span>
            <span style={{ fontSize: 12, color: C.text4 }}>(선택)</span>
            {data.requestException && <span style={{ padding: '2px 8px', borderRadius: 999, background: '#dbeafe', color: C.brand, fontSize: 11.5, fontWeight: 700 }}>{data.exceptionType === 'no_bid_to_win' ? '공고문 없는 현장 신청됨' : '영업적 승리 신청됨'}</span>}
            <span style={{ marginLeft: 'auto', color: C.text4 }}>{excOpen ? '▴' : '▾'}</span>
          </button>
          {excOpen && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                {EXCEPTIONS.map(([key, title, desc]) => {
                  const on = data.requestException && data.exceptionType === key;
                  return (
                    <button key={key} type="button" role="radio" aria-checked={on} onClick={() => set(on ? { requestException: false, exceptionType: null } : { requestException: true, exceptionType: key })}
                      style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${on ? C.brand : C.line}`, background: on ? '#eef5fb' : '#fff', cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{on ? '● ' : '○ '}{title}</div>
                      <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>{desc}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 8 }}>결과는 일단 {res}로 저장되고, 관리자가 승인하면 자동으로 승 · 50만원이 돼요</div>
            </div>
          )}
        </section>
      )}
    </>
  );

  const header = (
    <div style={{ padding: mobile ? '6px 18px 12px' : '18px 22px 14px', borderBottom: `1px solid ${C.line2}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.text3 }}>{[d && `${d.getMonth() + 1}/${d.getDate()} (${KDAY[d.getDay()]})${pt.time ? ` ${pt.time}` : ''}`, tokens[0] && `주담 ${tokens[0]}${a && a !== tokens[0] ? ` · 입력 ${a}` : ''}`, pt.requester].filter(Boolean).join(' · ')}</div>
          <h2 id="rr-title" style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.siteName}</h2>
          <div style={{ fontSize: 12.5, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[pt.workType, pt.address].filter(Boolean).join(' · ')}</div>
        </div>
        <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer', flex: 'none' }}>✕</button>
      </div>
      <div role="group" aria-label="결과" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
        {RESULTS.map(r => {
          const on = res === r;
          const [bg, fg, bd] = TONE[r];
          return <button key={r} type="button" aria-pressed={on} onClick={() => pickResult(r)} style={{ height: 48, borderRadius: 10, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 800 : 500, background: on ? bg : '#fff', color: on ? fg : C.text3, border: on ? `1.5px solid ${bd}` : `1px solid ${C.line}` }}>{r}</button>;
        })}
      </div>
      {data.isResultChange && <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>결과 변경: {data.previousResult} → {res}</div>}
    </div>
  );

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: mobile ? '12px 18px calc(12px + env(safe-area-inset-bottom))' : '14px 22px', borderTop: `1px solid ${C.line2}`, background: '#fff' }}>
      <span style={{ fontSize: 12.5, color: C.text3, flex: mobile ? 'none' : 1 }}>
        정산 예상 <b style={{ color: TONE[res]?.[1] || C.ink, fontWeight: 800 }}>{(est.amount || 0).toLocaleString('ko-KR')}원</b>{quarter ? ` · ${quarter.replace('-', ' ')}` : ''}
      </span>
      {!mobile && onOpenLegacy && <button type="button" onClick={onOpenLegacy} style={{ padding: 0, border: 0, background: 'none', color: C.text4, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>이전 입력 화면</button>}
      {!mobile && <button type="button" onClick={onClose} style={{ height: 40, padding: '0 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>취소</button>}
      <button type="button" onClick={save} style={{ height: mobile ? 50 : 40, padding: '0 20px', flex: mobile ? 1 : 'none', borderRadius: mobile ? 12 : 8, border: 0, background: C.brand, color: '#fff', fontSize: mobile ? 15 : 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{LABEL[res]} 기록 저장</button>
    </div>
  );

  if (mobile) {
    return createPortal(
      <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(15,76,117,.4)', display: 'flex', alignItems: 'flex-end', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
        <div role="dialog" aria-modal="true" aria-labelledby="rr-title" onClick={e => e.stopPropagation()} style={{ width: '100%', height: 'calc(100dvh - 72px)', background: '#fff', borderRadius: '18px 18px 0 0', boxShadow: '0 -12px 40px rgba(15,23,42,.18)', display: 'flex', flexDirection: 'column', color: C.ink }}>
          <div aria-hidden="true" style={{ width: 36, height: 4, borderRadius: 2, background: C.strong, margin: '10px auto 4px', flex: 'none' }} />
          <div style={{ flex: 'none' }}>{header}</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 12px' }}>{body}</div>
          <div style={{ flex: 'none' }}>{footer}</div>
        </div>
      </div>,
      document.body,
    );
  }
  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="rr-title" onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: 'calc(100% - 32px)', maxHeight: 'min(860px, calc(100vh - 60px))', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', marginBottom: 20, color: C.ink }}>
        {header}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 22px 8px' }}>{body}</div>
        {footer}
      </div>
    </div>
  );
}
