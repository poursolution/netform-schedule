import React, { useState } from 'react';

// 설정 (#12c, 860px 모달) — 좌측 탭 5개. 실제 동작(가져오기·동기화·내보내기·계정·알림)은 App 의 기존 핸들러.
// 데이터 초기화·로컬 복원 같은 위험 기능은 "이전 설정 화면"에만 둔다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8', red: '#b91c1c', green: '#15803d',
};
const TABS = [
  ['import', '데이터 가져오기', '구글시트 CSV로 PT 일정 반영'],
  ['hiworks', '하이웍스 연동', '결재 완료 휴가 자동 동기화'],
  ['export', '내보내기', '일정 CSV 다운로드'],
  ['accounts', '계정 관리', '사용자 · 비밀번호'],
  ['automation', '알림·자동화', '아침 브리핑 · 잔디 · K-APT'],
];
const MODES = [
  ['merge', '병합', '권장', '새 항목 추가 + 같은 현장·일정은 시트 값으로 업데이트 (결과는 유지)'],
  ['addNew', '새 항목만', '', '이미 있는 현장·일정은 건드리지 않고 새 항목만 추가'],
  ['replace', '전체 교체', '', '기존 PT 일정을 모두 지우고 시트 데이터로 바꿔요 · 되돌릴 수 없어요'],
];
const pill = (bg, fg) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' });
const input = { display: 'block', width: '100%', height: 40, boxSizing: 'border-box', padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', color: C.ink, background: '#fff' };
const primary = (bg = C.brand) => ({ height: 38, padding: '0 16px', borderRadius: 8, border: 0, background: bg, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });
const secondary = { height: 38, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const n = v => (v || 0).toLocaleString('ko-KR');

function Head({ title, desc }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h3>
      <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

export default function SettingsModal({
  tab, onTab, isAdmin, canManageAccounts, ptCount, lastImportText,
  importer, hiworks, exporter, accounts, automation, onLegacy, onClose,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const tabs = TABS.filter(([k]) => k !== 'accounts' || canManageAccounts).filter(([k]) => k !== 'automation' || isAdmin);
  const cur = tabs.some(([k]) => k === tab) ? tab : 'import';

  return (
    <div role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="st-title" style={{ width: 860, maxWidth: 'calc(100% - 32px)', height: 'min(640px, calc(100vh - 60px))', marginBottom: 20, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', color: C.ink, overflow: 'hidden', fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '18px 22px 14px', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ flex: 1 }}>
            <h2 id="st-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>설정</h2>
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>데이터 가져오기·연동·계정·알림을 한 곳에서</div>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, marginTop: -4, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)' }}>
          {/* 좌측 탭 */}
          <nav aria-label="설정 메뉴" style={{ background: C.muted, borderRight: `1px solid ${C.line2}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tabs.map(([k, t, d]) => {
              const on = cur === k;
              return (
                <button key={k} type="button" aria-current={on ? 'page' : undefined} onClick={() => onTab(k)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: 0, background: on ? C.active : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: on ? C.brand : C.ink }}>{t}</div>
                  <div style={{ fontSize: 11.5, color: on ? C.brand : C.text4, marginTop: 2, opacity: on ? .8 : 1 }}>{d}</div>
                </button>
              );
            })}
            <div style={{ marginTop: 'auto', padding: '10px 12px', fontSize: 11.5, color: C.text4, lineHeight: 1.6 }}>
              현재 PT 일정 {n(ptCount)}건{lastImportText ? <><br />{lastImportText}</> : null}
              {onLegacy && <><br /><button type="button" onClick={onLegacy} style={{ padding: 0, border: 0, background: 'none', color: C.text4, fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>이전 설정 화면 (데이터 초기화·복원)</button></>}
            </div>
          </nav>

          {/* 본문 */}
          <section style={{ minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
            {cur === 'import' && (() => {
              const p = importer.preview;
              const danger = importer.mode === 'replace';
              return (
                <>
                  <Head title="데이터 가져오기" desc="구글시트 → 파일 → 공유 → 웹에 게시 → 형식 CSV 로 게시한 주소를 붙여넣고, 모드를 고른 뒤 미리보기로 건수를 확인하고 가져와요." />
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.text2 }}>CSV 주소
                    <input value={importer.url} onChange={e => importer.onUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" style={{ ...input, marginTop: 6 }} />
                  </label>
                  {p && <div style={{ fontSize: 12, color: C.green, marginTop: 6 }}>✓ 연결 확인됨 · {n(p.rows)}행 (현장명 있는 {n(p.valid)}행)</div>}

                  <div role="radiogroup" aria-label="가져오기 모드" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
                    {MODES.map(([k, t, badge, d]) => {
                      const on = importer.mode === k, red = k === 'replace';
                      return (
                        <button key={k} type="button" role="radio" aria-checked={on} onClick={() => importer.onMode(k)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? (red ? '#fca5a5' : C.brand) : C.line}`, background: on ? (red ? '#fef2f2' : C.active) : '#fff', color: C.ink }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: on && red ? C.red : on ? C.brand : C.ink }}>{t}</span>
                            {badge && <span style={pill('#dbeafe', C.brand)}>{badge}</span>}
                          </div>
                          <div style={{ fontSize: 11.5, color: on && red ? C.red : C.text3, marginTop: 4, lineHeight: 1.45 }}>{d}</div>
                        </button>
                      );
                    })}
                  </div>

                  {p && p.mode === importer.mode && (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, padding: '10px 14px', borderRadius: 10, background: C.muted, fontSize: 13 }}>
                      <span>새 <b>{n(p.added)}</b></span>
                      <span>업데이트 <b>{n(p.updated)}</b></span>
                      <span>변경 없음 <b>{n(p.unchanged)}</b></span>
                      <span style={{ color: C.red }}>미배정 <b>{n(p.unassigned)}</b></span>
                      {p.removed > 0 && <span style={{ color: C.red }}>삭제 <b>{n(p.removed)}</b></span>}
                    </div>
                  )}
                  {p && p.mode !== importer.mode && <div style={{ fontSize: 12, color: C.text4, marginTop: 10 }}>모드를 바꿨어요 · 다시 미리보기 해 주세요</div>}
                  {importer.status && (
                    <div role="status" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, fontSize: 13, background: importer.status.type === 'success' ? '#dcfce7' : importer.status.type === 'error' ? '#fef2f2' : '#fef3c7', color: importer.status.type === 'success' ? C.green : importer.status.type === 'error' ? C.red : '#b45309' }}>{importer.status.message}</div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                    <span style={{ flex: 1, fontSize: 12, color: danger ? C.red : C.text4 }}>{danger ? '전체 교체는 기존 PT 일정을 지워요 · 실행 전에 한 번 더 확인해요' : '미리보기는 저장하지 않아요'}</span>
                    <button type="button" disabled={importer.busy || !importer.url} onClick={importer.onPreview} style={{ ...secondary, opacity: importer.busy || !importer.url ? .5 : 1 }}>미리보기만</button>
                    <button type="button" disabled={importer.busy || !importer.url} onClick={importer.onImport} style={{ ...primary(danger ? C.red : C.brand), opacity: importer.busy || !importer.url ? .5 : 1 }}>{importer.busy ? '처리 중…' : danger ? '전체 교체 실행' : '가져오기'}</button>
                  </div>
                </>
              );
            })()}

            {cur === 'hiworks' && (
              <>
                <Head title="하이웍스 연동" desc="넷폼알앤디 하이웍스의 결재 완료 휴가를 일정의 휴가로 가져와요. 대상: 이승우 · 황윤선 · 이필선 · 한준엽 · 한인규 · 조현식 · 김성민 · 정정훈 (2026-02-19 이후)" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" disabled={hiworks.busy} onClick={hiworks.onSync} style={{ ...primary(), opacity: hiworks.busy ? .5 : 1 }}>{hiworks.busy ? '동기화 중…' : '지금 동기화'}</button>
                  <span style={{ fontSize: 12.5, color: C.text3 }}>{hiworks.lastSync ? `마지막 동기화 ${hiworks.lastSync}` : '아직 동기화 기록이 없어요'}</span>
                </div>
                {hiworks.vacations.length > 0 && (
                  <div style={{ marginTop: 16, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, borderBottom: `1px solid ${C.line2}` }}>동기화된 휴가 {n(hiworks.vacations.length)}건</div>
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {hiworks.vacations.slice(0, 30).map((v, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '96px 80px 1fr auto', gap: 10, padding: '8px 14px', borderTop: i ? `1px solid ${C.line2}` : 0, fontSize: 12.5 }}>
                          <span>{v.date}</span><span style={{ fontWeight: 600 }}>{v.userName}</span><span style={{ color: C.text3 }}>{v.type}</span>
                          <span style={{ color: C.text3 }}>{v.dayType === 'hours' && v.hours > 0 ? `${v.hours}시간` : '종일'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {cur === 'export' && (
              <>
                <Head title="내보내기" desc="CSV 를 받아 구글시트 → 파일 → 가져오기 → '현재 시트에 추가' 또는 '시트 대체'로 올려요." />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[['PT 일정', exporter.counts.pt], ['현설 일정', exporter.counts.briefing], ['개인 일정', exporter.counts.personal]].map(([l, v]) => (
                    <div key={l} style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.line}` }}>
                      <div style={{ fontSize: 12, color: C.text3 }}>{l}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{n(v)}<span style={{ fontSize: 12, fontWeight: 600, color: C.text3, marginLeft: 2 }}>건</span></div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                  <button type="button" onClick={() => exporter.onExport('pt')} style={secondary}>PT 일정 CSV</button>
                  <button type="button" onClick={() => exporter.onExport('all')} style={primary()}>전체 일정 CSV</button>
                </div>
              </>
            )}

            {cur === 'accounts' && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}><Head title="계정 관리" desc={`로그인 계정 ${n(Object.keys(accounts.list).length)}개 · 비밀번호 변경·삭제는 바로 저장돼요`} /></div>
                  <button type="button" onClick={() => setAddOpen(o => !o)} style={primary()}>+ 계정 추가</button>
                </div>
                {addOpen && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, padding: 12, marginBottom: 14, borderRadius: 10, border: `1px solid ${C.accent}`, background: C.active }}>
                    <input aria-label="아이디" value={accounts.newId} onChange={e => accounts.onNewId(e.target.value)} placeholder="아이디" style={input} />
                    <input aria-label="비밀번호" value={accounts.newPw} onChange={e => accounts.onNewPw(e.target.value)} placeholder="비밀번호" style={input} />
                    <input aria-label="이름" value={accounts.newName} onChange={e => accounts.onNewName(e.target.value)} placeholder="이름" style={input} />
                    <button type="button" onClick={accounts.onAdd} style={primary()}>추가</button>
                  </div>
                )}
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px 110px 80px 140px', gap: 10, padding: '8px 14px', background: C.muted, fontSize: 11.5, fontWeight: 600, color: C.text4 }}>
                    <span>이름</span><span>역할</span><span>볼 수 있는 범위</span><span>잔디</span><span style={{ textAlign: 'right' }}>편집</span>
                  </div>
                  {Object.entries(accounts.list).map(([id, a]) => {
                    const hook = accounts.webhooks?.[a.name];
                    const linked = !!hook?.url && hook.enabled !== false;
                    return (
                      <div key={id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px 110px 80px 140px', gap: 10, alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${C.line2}`, fontSize: 13 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: '50%', background: C.accent, color: C.brand, fontSize: 11.5, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>{(a.name || id).slice(0, 1)}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || id}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: C.text4 }}>{id}</span>
                          </span>
                        </span>
                        <span>{a.isAdmin ? <span style={pill('#dbeafe', C.brand)}>관리자</span> : <span style={pill('#f1f5f9', C.text2)}>영업사원</span>}</span>
                        <span style={{ fontSize: 12.5, color: C.text2 }}>{accounts.scopeOf(a)}</span>
                        <span style={{ fontSize: 12.5, color: linked ? C.green : C.text4 }}>{linked ? '● 연결' : '—'}</span>
                        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button type="button" onClick={() => accounts.onResetPw(id)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>비번 변경</button>
                          {id !== 'admin' && <button type="button" onClick={() => accounts.onDelete(id)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.red }}>삭제</button>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {cur === 'automation' && (
              <>
                <Head title="알림·자동화" desc="잔디로 나가는 자동 알림과 외부 연동 설정이에요." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: `1px solid ${C.line}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>아침 브리핑 자동 발송</div>
                      <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>매일 09:00 · 다음 {automation.briefDays}영업일 PT 일정 · 담당자 개인 잔디 + 관리자 채널</div>
                    </div>
                    <button type="button" role="switch" aria-checked={!!automation.briefAuto} disabled={!automation.onToggleBriefAuto} onClick={() => automation.onToggleBriefAuto(!automation.briefAuto)} style={{ width: 40, height: 24, borderRadius: 999, border: 0, padding: 3, background: automation.briefAuto ? C.brand : C.strong, cursor: 'pointer', flex: 'none' }}>
                      <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: automation.briefAuto ? 'translateX(16px)' : 'none', transition: 'transform .15s' }} />
                    </button>
                  </div>
                  {[['잔디 연동', '관리자 채널 웹훅 · 담당자 개인 웹훅', automation.onOpenJandi], ['K-APT 자동 검증', 'Cloudflare Worker 주소 · 검증 동작', automation.onOpenKapt]].map(([t, d, fn]) => fn && (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: `1px solid ${C.line}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t}</div>
                        <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{d}</div>
                      </div>
                      <button type="button" onClick={fn} style={secondary}>설정 열기</button>
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, color: C.text4, marginTop: 4 }}>분기 확인 리마인드는 확인 기간(분기 마지막 달 ~ 다음 달 30일)에만 매일 09·17시에 나가요.</div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
