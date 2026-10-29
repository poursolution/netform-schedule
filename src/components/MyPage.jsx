import React, { useMemo, useState } from 'react';
import AppSidebar from './AppSidebar.jsx';
import { quarterMeta, formatWon } from '../utils/workbench.js';
import { myPts, yearRecord, teamRate, monthlyCounts, quarterHistory } from '../utils/staffHome.js';

// 마이페이지 (#9a) — 내 정보 · 내 실적 · 정산 이력 · 설정만.
// 오늘 할 일·예상 정산·분기 확인은 담당자 홈(#3a)에 있다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text: '#1e293b', text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12 };
const cardHead = { display: 'flex', alignItems: 'baseline', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${C.line2}` };
const h2 = { margin: 0, fontSize: 15, fontWeight: 800 };
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: bg, color: fg });
const btn = (kind, h = 34) => ({
  height: h, padding: '0 14px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  ...(kind === 'primary' ? { border: 0, background: C.brand, color: '#fff', fontWeight: 700 } : { border: `1px solid ${C.line}`, background: '#fff', color: C.ink }),
});
const input = { height: 36, width: '100%', boxSizing: 'border-box', padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };
const won = n => (n || 0).toLocaleString('ko-KR');

function Toggle({ on, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 40, height: 24, borderRadius: 999, border: 0, padding: 3, background: on ? C.brand : C.strong, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1, flex: 'none', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
    </button>
  );
}

export default function MyPage({
  me, account, isAdmin, ptSchedules, todayStr, teamNames, teams,
  sidebar, jandiOn, prefs,
  onSaveProfile,        // ({ phone, email }) => Promise<boolean>
  onTogglePref,         // (key, on) => void
  password,             // { current, next, confirm, error, setCurrent, setNext, setConfirm, submit: () => Promise<boolean>, reset }
  onLogout, onOpenSettlement, onManageAccounts,
}) {
  const today = new Date(todayStr + 'T00:00:00');
  const year = today.getFullYear();
  const [editOpen, setEditOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pwOpen, setPwOpen] = useState(false);

  const rec = useMemo(() => yearRecord(ptSchedules, me, year), [ptSchedules, me, year]);
  const teamAvg = useMemo(() => teamRate(ptSchedules, teamNames, year), [ptSchedules, teamNames, year]);
  const months = useMemo(() => monthlyCounts(ptSchedules, me, today), [ptSchedules, me, todayStr]);
  const history = useMemo(() => quarterHistory(ptSchedules, me), [ptSchedules, me]);
  const totalPts = useMemo(() => myPts(ptSchedules, me).length, [ptSchedules, me]);
  const teamSummary = useMemo(() => (teams || []).map(t => {
    let w = 0, d = 0, l = 0, p = 0;
    t.members.forEach(n => { const r = yearRecord(ptSchedules, n, year); w += r.w; d += r.d; l += r.l; p += r.p; });
    return { ...t, w, d, l, p, rate: w + l ? Math.round(w / (w + l) * 100) : 0 };
  }), [teams, ptSchedules, year]);
  const curQ = `${year}-Q${Math.ceil((today.getMonth() + 1) / 3)}`;
  const maxMonth = Math.max(1, ...months.map(m => m.count));

  const openEdit = () => { setPhone(account?.phone || ''); setEmail(account?.email || ''); setEditOpen(true); };
  const saveEdit = async () => { if (await onSaveProfile({ phone: phone.trim(), email: email.trim() })) setEditOpen(false); };
  const submitPw = async () => { if (await password.submit()) setPwOpen(false); };
  const closePw = () => { password.reset(); setPwOpen(false); };

  const ringDeg = rec.rate * 3.6;
  const roleLabel = isAdmin ? '관리자' : '영업사원';
  const sidebarProps = { ...sidebar, profileActive: true };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.muted, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
      <AppSidebar {...sidebarProps} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 64, padding: '0 28px', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>마이페이지</h1>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onLogout} style={{ ...btn('secondary'), color: '#b91c1c', fontWeight: 600 }}>로그아웃</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, padding: '18px 24px 24px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {/* 1. 프로필 */}
            <section aria-label="내 정보" style={{ ...card, padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: '50%', background: C.accent, color: C.brand, fontSize: 24, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>{(me || '?').slice(0, 1)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{me}</span>
                    <span style={pill('#f1f5f9', C.text2)}>{roleLabel}</span>
                    {account?.company && <span style={pill('#dbeafe', C.brand)}>{account.company}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.text2, marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>{account?.phone || '연락처 미등록'}</span>
                    <span>{account?.email || '이메일 미등록'}</span>
                    <span>잔디 {jandiOn ? <><span style={{ color: '#16a34a' }}>●</span> 연결됨</> : <span style={{ color: C.text4 }}>미연결</span>}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.text4, marginTop: 4 }}>
                    {account?.joinedAt ? `입사 ${String(account.joinedAt).slice(0, 7).replace('-', '.')} · ` : ''}PT 누적 {won(totalPts)}건
                  </div>
                </div>
                {!editOpen && <button type="button" onClick={openEdit} style={btn('secondary')}>정보 수정</button>}
              </div>
              {editOpen && (
                <div style={{ marginTop: 16, padding: 14, border: `1px solid ${C.accent}`, borderRadius: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ fontSize: 12, color: C.text3 }}>연락처<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" style={{ ...input, marginTop: 4 }} /></label>
                    <label style={{ fontSize: 12, color: C.text3 }}>이메일<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" style={{ ...input, marginTop: 4 }} /></label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 11.5, color: C.text4 }}>이름·소속은 관리자만 변경할 수 있어요</span>
                    <div style={{ flex: 1 }} />
                    <button type="button" onClick={() => setEditOpen(false)} style={btn('secondary', 32)}>취소</button>
                    <button type="button" onClick={saveEdit} style={btn('primary', 32)}>저장</button>
                  </div>
                </div>
              )}
            </section>

            {isAdmin ? (
              /* 관리자: 팀 요약 + 계정 관리 */
              <section aria-label="팀 요약" style={{ ...card, overflow: 'hidden' }}>
                <div style={cardHead}>
                  <h2 style={h2}>{year}년 팀 요약</h2>
                  <span style={{ fontSize: 12, color: C.text4 }}>PT 기준 · 승률은 무 제외</span>
                  {onManageAccounts && <button type="button" onClick={onManageAccounts} style={{ marginLeft: 'auto', padding: 0, border: 0, background: 'none', color: C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>계정 관리 →</button>}
                </div>
                {teamSummary.map(t => (
                  <div key={t.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(5, 64px)', alignItems: 'center', padding: '11px 18px', borderBottom: `1px solid ${C.line2}`, fontSize: 13 }}>
                    <span><b>{t.name}</b><span style={{ display: 'block', fontSize: 11.5, color: C.text4 }}>{t.members.join(' · ')}</span></span>
                    <span style={{ textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{t.w} 승</span>
                    <span style={{ textAlign: 'right', color: '#b45309' }}>{t.d} 무</span>
                    <span style={{ textAlign: 'right', color: '#b91c1c' }}>{t.l} 패</span>
                    <span style={{ textAlign: 'right', color: C.text3 }}>{t.p} 진행</span>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: C.brand }}>{t.rate}%</span>
                  </div>
                ))}
              </section>
            ) : (
              <>
                {/* 2. 올해 성적 · 월별 PT */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
                  <section aria-label="올해 내 성적" style={{ ...card, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', fontSize: 13, fontWeight: 700 }}>올해 내 성적<span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400, color: C.text3 }}>팀 평균 {teamAvg}%</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14 }}>
                      <div role="img" aria-label={`승률 ${rec.rate}%`} style={{ width: 92, height: 92, borderRadius: '50%', background: `conic-gradient(#16a34a 0deg ${ringDeg}deg, ${C.line} ${ringDeg}deg 360deg)`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', alignContent: 'center' }}>
                          <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{rec.rate}%</span>
                          <span style={{ fontSize: 10, color: C.text3 }}>승률</span>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 18px', flex: 1 }}>
                        {[['승', rec.w, '#15803d'], ['무', rec.d, '#b45309'], ['패', rec.l, '#b91c1c'], ['진행 중', rec.p, C.text3]].map(([l, n, fg]) => (
                          <div key={l}><div style={{ fontSize: 18, fontWeight: 800, color: fg }}>{n}</div><div style={{ fontSize: 11.5, color: C.text3 }}>{l}</div></div>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: C.text4, marginTop: 12 }}>승률 = 승 / (승+패) · 무 제외 · 결정된 PT {rec.w + rec.d + rec.l}건</div>
                  </section>
                  <section aria-label="월별 PT" style={{ ...card, padding: '18px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>월별 PT</div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, gap: 6, alignItems: 'end', height: 120, marginTop: 14 }}>
                      {months.map(m => (
                        <div key={m.key} title={`${m.label} ${m.count}건`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                          <span style={{ fontSize: 10.5, color: C.text3 }}>{m.count || ''}</span>
                          <div style={{ width: '100%', maxWidth: 22, height: `${Math.max(m.count ? 4 : 0, m.count / maxMonth * 88)}px`, borderRadius: 3, background: m.current ? C.brand : C.accent }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, gap: 6, marginTop: 4 }}>
                      {months.map(m => <span key={m.key} style={{ fontSize: 10.5, textAlign: 'center', color: m.current ? C.brand : C.text4, fontWeight: m.current ? 700 : 400 }}>{m.label}</span>)}
                    </div>
                  </section>
                </div>

                {/* 3. 분기별 정산 이력 */}
                <section aria-label="분기별 정산 이력" style={{ ...card, overflow: 'hidden' }}>
                  <div style={cardHead}>
                    <h2 style={h2}>분기별 정산 이력</h2>
                    <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.text3 }}>누적 수령 <b style={{ color: C.ink }}>{won(history.totalPaid)}원</b></span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr) 60px 120px 100px 110px', gap: 8, padding: '7px 18px', fontSize: 11, fontWeight: 600, color: C.text4, borderBottom: `1px solid ${C.line2}` }}>
                    <span>분기</span><span>집계 기간</span><span style={{ textAlign: 'right' }}>건수</span><span style={{ textAlign: 'right' }}>정산액</span><span>상태</span><span>지급</span>
                  </div>
                  {history.rows.map(q => {
                    const meta = quarterMeta(q.key, today);
                    const paidAt = q.paidAt ? new Date(q.paidAt) : null;
                    return (
                      <div key={q.key} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr) 60px 120px 100px 110px', gap: 8, alignItems: 'center', padding: '11px 18px', borderBottom: `1px solid ${C.line2}`, fontSize: 13, background: q.key === curQ ? C.active : '#fff' }}>
                        <b>{meta.year} Q{meta.quarter}</b>
                        <span style={{ color: C.text3 }}>{meta.months} PT</span>
                        <span style={{ textAlign: 'right' }}>{q.count}</span>
                        <b style={{ textAlign: 'right' }}>{formatWon(q.amount)}</b>
                        <span><span style={q.status === 'paid' ? pill('#dcfce7', '#15803d') : pill('#dbeafe', C.brand)}>{q.status === 'paid' ? '지급 완료' : '진행 중'}</span></span>
                        <span style={{ fontSize: 12, color: q.status !== 'paid' && meta.payrollMonth < todayStr.slice(0, 7) ? '#b45309' : C.text3 }}>
                          {q.status === 'paid'
                            ? (paidAt ? `${paidAt.getMonth() + 1}/${paidAt.getDate()} 지급` : '지급 완료')
                            : meta.payrollMonth < todayStr.slice(0, 7)
                              ? `미지급 ${won(q.amount - q.paid)}원`
                              : `${+String(meta.payrollMonth).slice(5)}월 급여 예정`}
                        </span>
                      </div>
                    );
                  })}
                  {history.rows.length === 0 && <div style={{ padding: 22, textAlign: 'center', fontSize: 13, color: C.text4 }}>아직 정산 이력이 없어요</div>}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', fontSize: 12, color: C.text4 }}>
                    승 50만 · 무/지원 25만 · 분기 다음달 급여 반영
                    {onOpenSettlement && <button type="button" onClick={onOpenSettlement} style={{ marginLeft: 'auto', padding: 0, border: 0, background: 'none', color: C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>내 정산 →</button>}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* 우측 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <section aria-label="알림" style={{ ...card, padding: '16px 18px' }}>
              <h2 style={{ ...h2, fontSize: 14 }}>알림</h2>
              {[
                ['brief', '아침 PT 브리핑', '매일 09:00 · 내 일정만'],
                ['remind', '결과 입력 리마인드', '준비 중 — 아직 발송 기능이 없어요', true],
                ['pay', '정산 알림', '분기 정산 확정 시 1회'],
              ].map(([key, label, desc, disabled]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: disabled ? C.text4 : C.ink }}>{label}</div>
                    <div style={{ fontSize: 11.5, color: C.text4 }}>{desc}</div>
                  </div>
                  <Toggle label={label} on={!disabled && prefs?.[key] !== false} disabled={disabled || !jandiOn} onChange={on => onTogglePref(key, on)} />
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: C.text4, marginTop: 12 }}>{jandiOn ? '모두 잔디 개인 DM으로 와요' : '잔디 개인 알림이 연결되지 않았어요 · 관리자에게 요청해 주세요'}</div>
            </section>

            <section aria-label="보안" style={{ ...card, padding: '16px 18px' }}>
              <h2 style={{ ...h2, fontSize: 14 }}>보안</h2>
              {!pwOpen ? (
                <button type="button" onClick={() => setPwOpen(true)} style={{ ...btn('secondary', 40), width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>비밀번호 변경<span aria-hidden="true">›</span></button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  <input type="password" aria-label="현재 비밀번호" placeholder="현재 비밀번호" autoComplete="current-password" value={password.current} onChange={e => password.setCurrent(e.target.value)} style={input} />
                  <input type="password" aria-label="새 비밀번호" placeholder="새 비밀번호 (4자 이상)" autoComplete="new-password" value={password.next} onChange={e => password.setNext(e.target.value)} style={input} />
                  <input type="password" aria-label="새 비밀번호 확인" placeholder="새 비밀번호 확인" autoComplete="new-password" value={password.confirm} onChange={e => password.setConfirm(e.target.value)} style={input} />
                  {password.error && <div role="alert" style={{ fontSize: 12, color: '#b91c1c' }}>{password.error}</div>}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={closePw} style={btn('secondary', 32)}>취소</button>
                    <button type="button" onClick={submitPw} style={btn('primary', 32)}>변경</button>
                  </div>
                </div>
              )}
            </section>

            <section aria-label="정산 규칙" style={{ ...card, padding: '16px 18px' }}>
              <h2 style={{ ...h2, fontSize: 14 }}>정산 규칙</h2>
              {[['승', '500,000원', '#15803d'], ['무', '250,000원', '#b45309'], ['지원 (여럿이 간 현장은 승도)', '250,000원', C.brand], ['패 · 본인영업 · 취소공고', '0원', C.text4]].map(([l, v, fg]) => (
                <div key={l} style={{ display: 'flex', fontSize: 12.5, marginTop: 8 }}>
                  <span style={{ color: C.text2 }}>{l}</span>
                  <b style={{ marginLeft: 'auto', color: fg }}>{v}</b>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: C.text4, marginTop: 10, lineHeight: 1.5 }}>PT 진행일 기준 분기 귀속 · 분기 다음달 30일 마감 · 다음달 급여 반영</div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
