import React, { useState } from 'react';
import MethodChips from './MethodChips.jsx';

// 일정 수정 모달 (#7a) — 기존 수정 모달과 같은 필드를 "언제 → 어디서 → 누가 → 메모" 순서로.
// 저장·삭제·첨부 업로드는 기존 handleSaveEdit / handleDelete / handleFileUpload 를 그대로 쓴다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
// 회의는 별도 회의 모달에서 다루고 저장 경로도 달라 여기 칩에서 뺀다
const KINDS = [['pt', 'PT'], ['briefing', '현설'], ['seminar', '세미나'], ['asq', '아.스.퀘'], ['personal', '개인'], ['vacation', '휴가']];
const WHEN = [['confirmed', '날짜 확정'], ['monthOnly', '월만 정해짐'], ['pending', '미정']];
const TIMES = Array.from({ length: 28 }, (_, i) => `${String(Math.floor(i / 2) + 8).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

const input = { height: 42, width: '100%', boxSizing: 'border-box', padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: C.ink };
const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 6 };
const splitNames = v => String(v || '').split(/[\/,]/).map(x => x.trim()).filter(Boolean);

function Section({ n, title, optional, children }) {
  return (
    <section style={{ padding: '16px 0', borderTop: `1px solid ${C.line2}` }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>
        <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: optional ? C.strong : C.brand, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{n}</span>
        {title}{optional && <span style={{ fontSize: 12, fontWeight: 400, color: C.text4 }}>(선택)</span>}
      </h3>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </section>
  );
}

export default function ScheduleEditModal({
  schedule, onChange, onSave, onDelete, onClose, onUpload, onBriefingImage,
  assigneeList, briefingAssigneeList, checkAgreement, judgeResult,
}) {
  const s = schedule;
  const set = patch => onChange({ ...s, ...patch });
  const [customName, setCustomName] = useState('');

  const isPtLike = s.type === 'pt' || s.type === 'asq';
  const hasSite = isPtLike || s.type === 'briefing';
  const isTitled = s.type === 'personal' || s.type === 'vacation' || s.type === 'seminar';
  // 담당 필드: PT·아스퀘 = ptAssignee, 현설 = assignee (문자열 '/' 구분, 순서 = 역할) / 나머지 = assignees 배열
  const whoField = isPtLike ? 'ptAssignee' : s.type === 'briefing' ? 'assignee' : 'assignees';
  const who = whoField === 'assignees' ? (s.assignees || []) : splitNames(s[whoField]);
  const setWho = list => set({ [whoField]: whoField === 'assignees' ? list : list.join('/') });
  const toggleWho = name => setWho(who.includes(name) ? who.filter(x => x !== name) : [...who, name]);
  const roster = isPtLike || isTitled ? (assigneeList || []) : (briefingAssigneeList || []);
  const showWhen = s.type === 'pt';
  const dateFixed = !showWhen || s.dateType === 'confirmed';

  const methods = String(s.announcementMethods || '').split(',').map(x => x.trim()).filter(Boolean);
  const verdict = methods.length && judgeResult ? judgeResult(methods) : null;
  const agreement = s.requester && checkAgreement ? checkAgreement(s.requester) : null;

  const noAssignee = (hasSite) && who.length === 0;
  const chip = on => ({ height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.text2 });

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="sem-title" onClick={e => e.stopPropagation()}
        style={{ width: 600, maxWidth: 'calc(100% - 32px)', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', maxHeight: 'min(820px, calc(100vh - 60px))', marginBottom: 20, color: C.ink }}>
        {/* 헤더 */}
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h2 id="sem-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>일정 수정</h2>
            <div style={{ flex: 1 }} />
            {s.type === 'briefing' && onBriefingImage && <button type="button" onClick={onBriefingImage} style={{ height: 32, padding: '0 12px', marginRight: 8, borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>이미지</button>}
            <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
          </div>
          <div role="group" aria-label="일정 종류" style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {KINDS.map(([k, l]) => <button key={k} type="button" aria-pressed={s.type === k} onClick={() => set({ type: k })} style={chip(s.type === k)}>{l}</button>)}
          </div>
        </div>

        {/* 본문 */}
        <div style={{ padding: '4px 22px 8px', overflowY: 'auto', flex: 1 }}>
          {noAssignee && (
            <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#b91c1c' }}>
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: '#b91c1c', color: '#fff', fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' }}>!</span>
              <span>담당자가 없어요. 이대로 저장하면 미배정으로 남고 아침 브리핑에 경고로 나갑니다.</span>
            </div>
          )}

          <Section n="1" title="언제">
            {showWhen && (
              <div role="group" aria-label="날짜 상태" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
                {WHEN.map(([k, l], i) => {
                  const on = (s.dateType || 'confirmed') === k;
                  return <button key={k} type="button" aria-pressed={on} onClick={() => set({ dateType: k })} style={{ height: 40, border: 0, borderLeft: i ? `1px solid ${C.line}` : 0, background: on ? C.active : '#fff', color: on ? C.brand : C.text3, fontWeight: on ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>;
                })}
              </div>
            )}
            {dateFixed && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
                <label style={fieldLabel}>날짜<input type="date" value={s.date || ''} onChange={e => set({ date: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>
                <label style={fieldLabel}>시작
                  <input list="sem-times" value={s.time || ''} onChange={e => set({ time: e.target.value })} placeholder="00:00" style={{ ...input, marginTop: 6 }} />
                </label>
                <label style={fieldLabel}>종료 (선택)
                  <input list="sem-times" value={s.endTime || ''} onChange={e => set({ endTime: e.target.value })} placeholder="00:00" style={{ ...input, marginTop: 6 }} />
                </label>
                <datalist id="sem-times">{TIMES.map(t => <option key={t} value={t} />)}</datalist>
              </div>
            )}
            {showWhen && s.dateType === 'monthOnly' && (
              <label style={fieldLabel}>예정월<input type="month" value={s.expectedMonth || ''} onChange={e => set({ expectedMonth: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>
            )}
            {showWhen && s.dateType === 'pending' && (
              <label style={fieldLabel}>일정 메모<input value={s.dateNote || ''} onChange={e => set({ dateNote: e.target.value })} placeholder="예: 조율중, 협의필요" style={{ ...input, marginTop: 6 }} /></label>
            )}
          </Section>

          <Section n="2" title="어디서">
            {isTitled && <label style={fieldLabel}>일정명<input value={s.title || ''} onChange={e => set({ title: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>}
            {hasSite && (
              <>
                <label style={fieldLabel}>현장명<input value={s.siteName || ''} onChange={e => set({ siteName: e.target.value })} style={{ ...input, marginTop: 6, fontWeight: 600 }} /></label>
                <label style={fieldLabel}>주소<input value={s.address || ''} onChange={e => set({ address: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: isPtLike ? '1fr 1fr' : '1fr', gap: 8 }}>
                  <label style={fieldLabel}>공종<input value={s.workType || ''} onChange={e => set({ workType: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>
                  {isPtLike && <label style={fieldLabel}>참여인원<input value={s.participants || ''} onChange={e => set({ participants: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>}
                </div>
              </>
            )}
            {(s.type === 'personal' || s.type === 'seminar') && <label style={fieldLabel}>장소<input value={s.location || ''} onChange={e => set({ location: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>}
            {s.type === 'pt' && (
              <div>
                <span style={fieldLabel}>공고문 공법</span>
                <MethodChips value={s.announcementMethods || ''} onChange={v => set({ announcementMethods: v })} />
                <div style={{ fontSize: 11.5, color: C.text4, marginTop: 6 }}>
                  우리 공법만 있으면 승, 섞이면 무로 자동 판정
                  {verdict && <b style={{ marginLeft: 6, color: verdict === '승' ? '#15803d' : verdict === '무' ? '#b45309' : '#b91c1c' }}>→ 자동판정 {verdict}</b>}
                </div>
              </div>
            )}
            {s.type === 'briefing' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={fieldLabel}>입찰마감<input type="date" value={s.bidDeadline || ''} onChange={e => set({ bidDeadline: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>
                <label style={fieldLabel}>요청서류<input value={s.requiredDocs || ''} onChange={e => set({ requiredDocs: e.target.value })} placeholder="견적서, 시방서 등" style={{ ...input, marginTop: 6 }} /></label>
              </div>
            )}
          </Section>

          <Section n="3" title="누가">
            <div>
              <div role="group" aria-label="담당자" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[...roster, ...who.filter(n => !roster.includes(n))].map(name => {
                  const idx = who.indexOf(name);
                  const on = idx >= 0;
                  return (
                    <button key={name} type="button" aria-pressed={on} onClick={() => toggleWho(name)} style={{ ...chip(on), height: 34, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {name}{on && hasSite && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: idx === 0 ? '#fff' : 'rgba(255,255,255,.25)', color: idx === 0 ? C.brand : '#fff' }}>{idx === 0 ? '주담' : '지원'}</span>}
                    </button>
                  );
                })}
                <form onSubmit={e => { e.preventDefault(); const v = customName.trim(); if (v && !who.includes(v)) setWho([...who, v]); setCustomName(''); }} style={{ display: 'inline-flex' }}>
                  <input aria-label="기타 담당자 입력" value={customName} onChange={e => setCustomName(e.target.value)} placeholder="+ 기타" style={{ height: 34, width: 96, padding: '0 12px', borderRadius: 999, border: `1px dashed ${C.strong}`, fontSize: 12.5, fontFamily: 'inherit' }} />
                </form>
              </div>
              <div style={{ fontSize: 12.5, marginTop: 8, color: who.length ? C.brand : '#b91c1c', fontWeight: who.length ? 600 : 500 }}>
                {who.length === 0 ? '아직 아무도 선택되지 않았어요' : hasSite ? who.map((n, i) => `${n} (${i === 0 ? '주담' : '지원'})`).join(' + ') : who.join(', ')}
              </div>
              {hasSite && who.length > 1 && <div style={{ fontSize: 11.5, color: C.text4, marginTop: 2 }}>먼저 고른 사람이 주담당이에요</div>}
            </div>
            {hasSite && (
              <div style={{ display: 'grid', gridTemplateColumns: isPtLike ? '1fr 1fr' : '1fr', gap: 8 }}>
                <label style={fieldLabel}>요청사 · 연락처
                  <input value={s.requester || ''} onChange={e => set({ requester: e.target.value })} style={{ ...input, marginTop: 6, borderColor: agreement && !agreement.isAgreement ? '#fca5a5' : C.line }} />
                  {agreement && (
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginTop: 4, color: agreement.isAgreement ? '#15803d' : '#b91c1c' }}>
                      {agreement.isAgreement ? `협약업체${agreement.grade ? ` ${agreement.grade}등급` : ''}` : 'POUR공법 협약업체가 아니에요 · 확인해 주세요'}
                    </span>
                  )}
                </label>
                {isPtLike && <label style={fieldLabel}>경쟁사<input value={s.competitor || ''} onChange={e => set({ competitor: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>}
              </div>
            )}
          </Section>

          <Section n="4" title="메모 · 첨부" optional>
            <textarea aria-label="비고" value={s.note || ''} onChange={e => set({ note: e.target.value })} placeholder="연락처, 특이사항 등" style={{ ...input, height: 64, padding: 10, resize: 'vertical' }} />
            {s.attachmentUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13 }}>
                <span aria-hidden="true">📎</span>
                <a href={s.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.brand, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.attachmentName || '첨부파일'}</a>
                <button type="button" onClick={() => set({ attachmentUrl: '', attachmentName: '' })} style={{ marginLeft: 'auto', padding: 0, border: 0, background: 'none', color: '#b91c1c', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>빼기</button>
              </div>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 56, border: `1.5px dashed ${C.strong}`, borderRadius: 10, fontSize: 13, color: C.text3, cursor: 'pointer' }}>
                📎 공고문·사진 첨부 <span style={{ color: C.text4, fontSize: 12 }}>PDF/JPG/HWP · 10MB</span>
                <input type="file" accept=".pdf,.doc,.docx,.hwp,.jpg,.jpeg,.png" onChange={onUpload} style={{ display: 'none' }} />
              </label>
            )}
          </Section>
        </div>

        {/* 푸터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.line2}` }}>
          <button type="button" onClick={onDelete} style={{ padding: '0 4px', border: 0, background: 'none', color: '#b91c1c', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
          <span style={{ fontSize: 12, color: C.text4 }}>저장하면 일정·실적에 바로 반영돼요</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ height: 40, padding: '0 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>취소</button>
          <button type="button" onClick={onSave} style={{ height: 40, padding: '0 20px', borderRadius: 8, border: 0, background: C.brand, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>저장</button>
        </div>
      </div>
    </div>
  );
}
