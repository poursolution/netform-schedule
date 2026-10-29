import React, { useState } from 'react';

// 스크린샷 검증 큐 (#12b, 관리자) — 좌 대기 목록 / 우 스크린샷 + K-APT 자동 매칭 결과 나란히.
// 승인·거부는 onApprove / onReject(기존 저장 경로) 즉시 실행, 처리하면 다음 건으로.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c', green: '#15803d',
};
const RES = { 승: ['#dcfce7', '#15803d'], 무: ['#fef3c7', '#b45309'], 패: ['#fef2f2', '#b91c1c'], 지원: ['#dbeafe', '#0F4C75'] };
const CHECKS = ['스크린샷의 단지명이 현장명과 같아요', '공고 기간·개찰일이 PT 날짜와 맞아요', '공고문에 우리 공법(POUR·CNC·DO·DETEX)이 있어요'];
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flex: 'none' });
const mainOf = pt => String(pt.ptAssignee || '').split(/[\/,+&]/).map(s => s.trim()).filter(Boolean)[0] || '';
const resultOf = pt => { const m = mainOf(pt); return (m && pt.results?.[m]) || pt.result || null; };
const when = at => String(at || '').slice(5, 16).replace('T', ' ').replace('-', '/');

export default function ScreenshotReviewQueue({ items, onApprove, onReject, onClose }) {
  const [list] = useState(items); // 연 시점 목록 — 처리한 건도 ✓/✕ 로 남긴다
  const [cur, setCur] = useState(items[0]?.id || null);
  const [dec, setDec] = useState({});
  const [memo, setMemo] = useState({});
  const [checks, setChecks] = useState({});
  const [busy, setBusy] = useState(false);
  const pt = list.find(p => p.id === cur) || null;
  const left = list.filter(p => !dec[p.id]).length;

  const decide = async (p, v) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = v === 'ok' ? await onApprove(p) : await onReject(p, (memo[p.id] || '').trim());
      if (ok === false) return;
      const next = { ...dec, [p.id]: v };
      setDec(next);
      const i = list.findIndex(x => x.id === p.id);
      const after = [...list.slice(i + 1), ...list.slice(0, i)].find(x => !next[x.id]);
      setCur(after ? after.id : null);
    } finally { setBusy(false); }
  };

  return (
    <div role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ss-title" style={{ width: 900, maxWidth: 'calc(100% - 32px)', height: 'min(720px, calc(100vh - 60px))', marginBottom: 20, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', color: C.ink, overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '18px 22px 14px', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 id="ss-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>스크린샷 검증</h2>
              {left > 0 && <span style={pill('#fef3c7', '#b45309')}>대기 {left}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>K-APT 자동 매칭이 안 돼 담당자가 공고 스크린샷을 올린 건 · 확인하고 승인하면 정산 대상이 돼요</div>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, marginTop: -4, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)' }}>
          {/* 좌: 대기 목록 */}
          <aside style={{ borderRight: `1px solid ${C.line2}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: C.text4, textAlign: 'center' }}>대기 중인 건이 없어요</div>}
              {list.map(p => {
                const on = p.id === cur, d = dec[p.id], r = resultOf(p);
                const [rbg, rfg] = RES[r] || ['#f1f5f9', C.text4];
                return (
                  <button key={p.id} type="button" onClick={() => !d && setCur(p.id)} disabled={!!d} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.active : '#fff', opacity: d ? .55 : 1, cursor: d ? 'default' : 'pointer', fontFamily: 'inherit', color: C.ink }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {d && <span aria-label={d === 'ok' ? '승인됨' : '거부됨'} style={{ color: d === 'ok' ? C.green : C.red, fontWeight: 800, fontSize: 13 }}>{d === 'ok' ? '✓' : '✕'}</span>}
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.siteName}</span>
                      <span style={pill(rbg, rfg)}>{r || '미입력'}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.text3, marginTop: 3 }}>{mainOf(p)} · PT {String(p.date || '').slice(5).replace('-', '/')}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.line2}`, fontSize: 11.5, color: C.text4, lineHeight: 1.5 }}>오래된 순 · 승인하면 검증 완료 → 정산 대상 · 거부하면 담당자에게 재업로드 요청</div>
          </aside>

          {/* 우: 상세 */}
          <section style={{ minHeight: 0, overflowY: 'auto', padding: '16px 20px' }}>
            {!pt ? (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                <div style={{ padding: '22px 26px', border: `1.5px dashed ${list.length ? '#86efac' : C.strong}`, borderRadius: 12, textAlign: 'center', fontSize: 13.5, color: list.length ? C.green : C.text3, lineHeight: 1.6, background: list.length ? '#f0fdf4' : '#fff' }}>
                  {list.length ? <><b>대기 중인 스크린샷을 모두 처리했어요</b><br />승인 {Object.values(dec).filter(v => v === 'ok').length}건 · 거부 {Object.values(dec).filter(v => v === 'no').length}건</> : <>검증할 스크린샷이 없어요<br /><span style={{ fontSize: 12, color: C.text4 }}>담당자가 K-APT 확인 창에서 스크린샷으로 관리자 검토를 요청하면 여기로 들어와요</span></>}
                </div>
              </div>
            ) : (() => {
              const kv = pt.kaptVerified || {};
              const r = resultOf(pt);
              const [rbg, rfg] = RES[r] || ['#f1f5f9', C.text4];
              const files = Object.values(pt.evidenceFiles || {}).filter(f => !f?.suppressed).length;
              const note = memo[pt.id] || '';
              const ck = checks[pt.id] || {};
              const ai = kv.aiExtractedSite;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{pt.siteName}</span>
                    <span style={pill(rbg, rfg)}>{r || '미입력'}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>{[mainOf(pt), `PT ${pt.date || '-'}`, kv.requestedAt && `업로드 ${when(kv.requestedAt)}${kv.requestedBy ? ` (${kv.requestedBy})` : ''}`, `첨부 ${files}건`].filter(Boolean).join(' · ')}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 14, marginTop: 14 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text3, marginBottom: 6 }}>담당자 스크린샷</div>
                      {kv.screenshotUrl ? (
                        <a href={kv.screenshotUrl} target="_blank" rel="noopener noreferrer" title="새 창에서 크게 보기" style={{ display: 'block', borderRadius: 10, border: `1px solid ${C.line}`, overflow: 'hidden', background: C.muted }}>
                          <img src={kv.screenshotUrl} alt={`${pt.siteName} K-APT 스크린샷`} style={{ display: 'block', width: '100%', maxHeight: 340, objectFit: 'contain' }} />
                        </a>
                      ) : <div style={{ padding: 24, borderRadius: 10, border: `1.5px dashed ${C.strong}`, fontSize: 12.5, color: C.text4, textAlign: 'center' }}>스크린샷 주소가 없어요</div>}
                      {kv.screenshotUrl && <div style={{ fontSize: 11.5, color: C.text4, marginTop: 4 }}>누르면 새 창에서 크게 보여요</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text3, marginBottom: 6 }}>K-APT 자동 매칭 결과</div>
                      <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef3c7', border: '1px solid #fde68a', fontSize: 12.5, lineHeight: 1.7, color: C.ink }}>
                        <div>읽은 단지명 <b>{ai || '읽지 못함'}</b>{kv.aiSimilarity !== undefined && kv.aiSimilarity !== null && <span style={{ color: C.text3 }}> · 유사도 {kv.aiSimilarity}</span>}</div>
                        <div>찾은 우리 공법 <b>{(kv.aiOurMethodFound || []).join(', ') || '없음'}</b></div>
                        {pt.bidNo && <div>공고번호 <b>{pt.bidNo}</b></div>}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text3, margin: '12px 0 6px' }}>확인할 것</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {CHECKS.map((t, i) => (
                          <label key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: C.text2, cursor: 'pointer', lineHeight: 1.4 }}>
                            <input type="checkbox" checked={!!ck[i]} onChange={e => setChecks(c => ({ ...c, [pt.id]: { ...ck, [i]: e.target.checked } }))} style={{ marginTop: 2 }} />{t}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <textarea aria-label="검토 메모" value={note} onChange={e => setMemo(m => ({ ...m, [pt.id]: e.target.value }))} placeholder="거부할 땐 필수 · 담당자에게 잔디로 전달돼요"
                    style={{ display: 'block', width: '100%', height: 56, boxSizing: 'border-box', marginTop: 14, padding: 10, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" disabled={!note.trim() || busy} onClick={() => decide(pt, 'no')} style={{ flex: 1, height: 42, borderRadius: 9, background: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', border: `1px solid ${note.trim() ? '#fecaca' : C.line}`, color: note.trim() ? C.red : C.strong, cursor: note.trim() ? 'pointer' : 'not-allowed' }}>거부 · 재업로드 요청</button>
                    <button type="button" disabled={busy} onClick={() => decide(pt, 'ok')} style={{ flex: 2, height: 42, borderRadius: 9, border: 0, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>승인 → 검증 완료</button>
                  </div>
                  {!note.trim() && <div style={{ fontSize: 11.5, color: C.text4, marginTop: 6 }}>거부 버튼은 검토 메모를 쓰면 활성화돼요</div>}
                </>
              );
            })()}
          </section>
        </div>
      </div>
    </div>
  );
}
