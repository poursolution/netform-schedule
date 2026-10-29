import React, { useState } from 'react';
import MethodChips from './MethodChips.jsx';
import { dateTitle } from './DatePopover.jsx';

// 일정 수정 모달 (#7a) — 기존 수정 모달과 같은 필드를 "언제 → 어디서 → 누가 → 메모" 순서로.
// 저장·삭제·첨부 업로드는 기존 handleSaveEdit / handleDelete / handleFileUpload 를 그대로 쓴다.

const C = {
  brand: '#0F4C75', accent: '#BBE1FA', active: '#eef5fb', ink: '#1e293b', line: '#e2e8f0', line2: '#f1f5f9', muted: '#f8fafc', strong: '#cbd5e1',
  text2: '#475569', text3: '#64748b', text4: '#94a3b8',
};
// 회의는 별도 회의 모달에서 다루고 저장 경로도 달라 여기 칩에서 뺀다
const KINDS = [['pt', 'PT'], ['briefing', '현설'], ['seminar', '세미나'], ['asq', '아.스.퀘'], ['personal', '개인'], ['vacation', '휴가']];
const WHEN = [['confirmed', '날짜 확정'], ['monthOnly', '월만 정해짐'], ['pending', '미정']];
// 시작·종료는 셀렉트 하나(#14b) — 정시 07~20시, 저장돼 있던 다른 값(09:30 등)은 그대로 옵션에 남긴다
const HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);
const timeOptions = v => (v && !HOURS.includes(v) ? [...HOURS, v].sort() : HOURS);
const KIND_LABEL = Object.fromEntries(KINDS);

const input = { height: 42, width: '100%', boxSizing: 'border-box', padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: C.ink };
const mobileInput = { ...input, height: 48, borderRadius: 10, fontSize: 15 };
const fieldLabel ={ display: 'block', fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 6 };
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
  assigneeList, briefingAssigneeList, checkAgreement, judgeResult, workTypeOptions,
  mode = 'edit',   // 'edit' | 'add' — 추가면 제목 "일정 추가", 삭제 없음
  mobile = false,  // #7b 모바일 전체화면 시트
  onLegacy,        // 전환 기간 — 이전 입력 화면
  topInset = 0,    // 모바일: 상단 고정 배너(PWA 설치 안내) 높이
}) {
  const s = schedule;
  const title = mode === 'add' ? '일정 추가' : '일정 수정';
  const field = mobile ? mobileInput : input;
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
  // #14b 추가 모드 필수: 현장명(현장 있는 종류) · 담당자(PT·현설) — 비면 등록 비활성
  const isAdd = mode === 'add';
  // PT는 날짜가 확정일 때만 담당자 필수 — 날짜가 '미정'이면 담당자도 나중에
  const needWho = (s.type === 'pt' && (s.dateType || 'confirmed') === 'confirmed') || s.type === 'briefing';
  const missing = isAdd ? [hasSite && !String(s.siteName || '').trim() && '현장명', needWho && who.length === 0 && '담당자'].filter(Boolean) : [];
  const canSave = missing.length === 0;
  const req = <span style={{ color: '#b91c1c' }}> *</span>;
  const chip = on => ({ height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500, border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.text2 });

  const font = '"Pretendard Variable", Pretendard, -apple-system, "Segoe UI", sans-serif';
  const textBtn = { height: 44, padding: '0 6px', border: 0, background: 'none', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' };
  const kindChips = (
    <div role="group" aria-label="일정 종류" style={{ display: 'flex', gap: 6, marginTop: mobile ? 8 : 12, flexWrap: mobile ? 'nowrap' : 'wrap', overflowX: mobile ? 'auto' : 'visible', scrollbarWidth: 'none', paddingBottom: mobile ? 2 : 0 }}>
      {KINDS.map(([k, l]) => <button key={k} type="button" aria-pressed={s.type === k} onClick={() => set({ type: k })} style={{ ...chip(s.type === k), flex: 'none' }}>{l}</button>)}
    </div>
  );
  const briefingImageBtn = s.type === 'briefing' && onBriefingImage && mode === 'edit'
    ? <button type="button" onClick={onBriefingImage} style={{ height: 32, padding: '0 12px', marginRight: 8, borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>이미지</button>
    : null;

  return (
    <div role="presentation" onClick={mobile ? undefined : onClose} style={mobile
      ? { position: 'fixed', top: topInset, left: 0, right: 0, bottom: 0, zIndex: 1000, background: '#fff', fontFamily: font }
      : { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,76,117,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, overflowY: 'auto', fontFamily: font }}>
      <div role="dialog" aria-modal="true" aria-labelledby="sem-title" onClick={e => e.stopPropagation()}
        style={mobile
          ? { position: 'absolute', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column', color: C.ink }
          : { width: 600, maxWidth: 'calc(100% - 32px)', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column', maxHeight: 'min(820px, calc(100vh - 60px))', marginBottom: 20, color: C.ink }}>
        {/* 헤더 — 모바일은 [취소] 제목 [저장] */}
        {mobile ? (
          <div style={{ flex: 'none', padding: 'calc(env(safe-area-inset-top) + 6px) 12px 10px', borderBottom: `1px solid ${C.line2}` }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button type="button" onClick={onClose} style={{ ...textBtn, color: C.text2 }}>취소</button>
              <h2 id="sem-title" style={{ flex: 1, margin: 0, textAlign: 'center', fontSize: 17, fontWeight: 800 }}>{title}</h2>
              <button type="button" disabled={!canSave} onClick={onSave} style={{ ...textBtn, color: canSave ? C.brand : C.strong, fontWeight: 800 }}>저장</button>
            </div>
            <div style={{ padding: '0 4px' }}>{kindChips}</div>
          </div>
        ) : (
          <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${C.line2}` }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h2 id="sem-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>
              {isAdd && s.date && dateFixed && <span style={{ marginLeft: 10, fontSize: 13, color: C.text3 }}>{dateTitle(s.date)}</span>}
              <div style={{ flex: 1 }} />
              {briefingImageBtn}
              <button type="button" aria-label="닫기" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: 'transparent', fontSize: 18, color: C.text3, cursor: 'pointer' }}>✕</button>
            </div>
            {kindChips}
          </div>
        )}

        {/* 본문 */}
        <div style={{ padding: mobile ? '4px 16px 16px' : '4px 22px 8px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {noAssignee && !(isAdd && needWho) && (
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
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : '1.2fr 1fr 1fr', gap: 8 }}>
                <label style={{ ...fieldLabel, gridColumn: mobile ? '1 / -1' : undefined }}>날짜<input type="date" value={s.date || ''} onChange={e => set({ date: e.target.value })} style={{ ...field, marginTop: 6 }} /></label>
                <label style={fieldLabel}>시작
                  <select value={s.time || ''} onChange={e => set({ time: e.target.value })} style={{ ...field, marginTop: 6, padding: '0 10px' }}>
                    <option value="">시간 선택</option>
                    {timeOptions(s.time).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label style={fieldLabel}>종료 (선택)
                  <select value={s.endTime || ''} onChange={e => set({ endTime: e.target.value })} style={{ ...field, marginTop: 6, padding: '0 10px' }}>
                    <option value="">—</option>
                    {timeOptions(s.endTime).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
            )}
            {showWhen && s.dateType === 'monthOnly' && (
              <label style={fieldLabel}>예정월<input type="month" value={s.expectedMonth || ''} onChange={e => set({ expectedMonth: e.target.value })} style={{ ...field, marginTop: 6 }} /></label>
            )}
            {showWhen && s.dateType === 'pending' && (
              <label style={fieldLabel}>일정 메모<input value={s.dateNote || ''} onChange={e => set({ dateNote: e.target.value })} placeholder="예: 조율중, 협의필요" style={{ ...field, marginTop: 6 }} /></label>
            )}
          </Section>

          <Section n="2" title="어디서">
            {isTitled && <label style={fieldLabel}>일정명<input value={s.title || ''} onChange={e => set({ title: e.target.value })} style={{ ...field, marginTop: 6 }} /></label>}
            {hasSite && (
              <>
                <label style={fieldLabel}><span>현장명{isAdd && req}</span><input value={s.siteName || ''} onChange={e => set({ siteName: e.target.value })} placeholder="아파트명" style={{ ...field, marginTop: 6, fontWeight: 600 }} /></label>
                <label style={fieldLabel}>주소<input value={s.address || ''} onChange={e => set({ address: e.target.value })} style={{ ...field, marginTop: 6 }} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: isPtLike ? '1fr 1fr' : '1fr', gap: 8 }}>
                  <label style={fieldLabel}>공종<input list={workTypeOptions?.length ? 'sem-worktypes' : undefined} value={s.workType || ''} onChange={e => set({ workType: e.target.value })} placeholder="선택" style={{ ...field, marginTop: 6 }} /></label>
                  {workTypeOptions?.length > 0 && <datalist id="sem-worktypes">{workTypeOptions.map(w => <option key={w} value={w} />)}</datalist>}
                  {isPtLike && <label style={fieldLabel}>참여인원<input value={s.participants || ''} onChange={e => set({ participants: e.target.value })} style={{ ...field, marginTop: 6 }} /></label>}
                </div>
              </>
            )}
            {(s.type === 'personal' || s.type === 'seminar') && <label style={fieldLabel}>장소<input value={s.location || ''} onChange={e => set({ location: e.target.value })} style={{ ...field, marginTop: 6 }} /></label>}
            {s.type === 'pt' && (
              <div>
                <span style={fieldLabel}>공고문 공법{isAdd && <span style={{ fontWeight: 400, color: C.text4 }}> · 아직 모르면 비워두세요 (결과 입력 때 다시 물어요)</span>}</span>
                <MethodChips value={s.announcementMethods || ''} onChange={v => set({ announcementMethods: v })} />
                <div style={{ fontSize: 11.5, color: C.text4, marginTop: 6 }}>
                  우리 공법만 있으면 승, 섞이면 무로 자동 판정
                  {verdict && <b style={{ marginLeft: 6, color: verdict === '승' ? '#15803d' : verdict === '무' ? '#b45309' : '#b91c1c' }}>→ 자동판정 {verdict}</b>}
                </div>
              </div>
            )}
            {s.type === 'briefing' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={fieldLabel}>입찰마감<input type="date" value={s.bidDeadline || ''} onChange={e => set({ bidDeadline: e.target.value })} style={{ ...field, marginTop: 6 }} /></label>
                <label style={fieldLabel}>요청서류<input value={s.requiredDocs || ''} onChange={e => set({ requiredDocs: e.target.value })} placeholder="견적서, 시방서 등" style={{ ...field, marginTop: 6 }} /></label>
              </div>
            )}
          </Section>

          <Section n="3" title={isAdd && needWho ? <span>누가{req}</span> : '누가'}>
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
              {isAdd && needWho && who.length === 0 && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '9px 12px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5 }}>
                  <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: '#b91c1c', color: '#fff', fontWeight: 800, fontSize: 11, display: 'grid', placeItems: 'center', flex: 'none' }}>!</span>
                  <span><b>{KIND_LABEL[s.type]}는 담당자 없이 등록할 수 없어요.</b>{s.type === 'pt' ? " 아직 미정이면 1단계에서 '미정' 일정으로 저장하세요." : ''}</span>
                </div>
              )}
              {!(isAdd && needWho && who.length === 0) && <div style={{ fontSize: 12.5, marginTop: 8, color: who.length ? C.brand : '#b91c1c', fontWeight: who.length ? 600 : 500 }}>
                {who.length === 0 ? '아직 아무도 선택되지 않았어요' : hasSite ? who.map((n, i) => `${n} (${i === 0 ? '주담' : '지원'})`).join(' + ') : who.join(', ')}
              </div>}
              {hasSite && who.length > 1 && <div style={{ fontSize: 11.5, color: C.text4, marginTop: 2 }}>먼저 고른 사람이 주담당이에요</div>}
            </div>
            {hasSite && (
              <div style={{ display: 'grid', gridTemplateColumns: isPtLike ? '1fr 1fr' : '1fr', gap: 8 }}>
                <label style={fieldLabel}>요청사 · 연락처
                  <input value={s.requester || ''} onChange={e => set({ requester: e.target.value })} style={{ ...field, marginTop: 6, borderColor: agreement && !agreement.isAgreement ? '#fca5a5' : C.line }} />
                  {agreement && (
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginTop: 4, color: agreement.isAgreement ? '#15803d' : '#b91c1c' }}>
                      {agreement.isAgreement ? `협약업체${agreement.grade ? ` ${agreement.grade}등급` : ''}` : 'POUR공법 협약업체가 아니에요 · 확인해 주세요'}
                    </span>
                  )}
                </label>
                {isPtLike && <label style={fieldLabel}>경쟁사<input value={s.competitor || ''} onChange={e => set({ competitor: e.target.value })} style={{ ...field, marginTop: 6 }} /></label>}
              </div>
            )}
          </Section>

          <Section n="4" title="메모 · 첨부" optional>
            <textarea aria-label="비고" value={s.note || ''} onChange={e => set({ note: e.target.value })} placeholder="연락처, 특이사항 등" style={{ ...field, height: 64, padding: 10, resize: 'vertical' }} />
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

        {/* 푸터 — 모바일은 하단 고정 [저장] 50px */}
        {mobile ? (
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px calc(env(safe-area-inset-bottom) + 10px)', borderTop: `1px solid ${C.line2}`, background: '#fff' }}>
            {mode === 'edit' && onDelete && <button type="button" onClick={onDelete} style={{ height: 50, padding: '0 6px', border: 0, background: 'none', color: '#b91c1c', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>}
            {onLegacy && <button type="button" onClick={onLegacy} style={{ height: 50, padding: 0, border: 0, background: 'none', color: C.text4, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>이전 입력 화면</button>}
            <button type="button" disabled={!canSave} onClick={onSave} style={{ flex: 1, height: 50, borderRadius: 12, border: 0, background: canSave ? C.brand : C.strong, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>저장</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.line2}` }}>
            {mode === 'edit' && onDelete && <button type="button" onClick={onDelete} style={{ padding: '0 4px', border: 0, background: 'none', color: '#b91c1c', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>}
            {missing.length > 0
              ? <span style={{ fontSize: 12.5, color: '#b91c1c', fontWeight: 600 }}>필수: {missing.join(' · ')}</span>
              : <span style={{ fontSize: 12, color: C.text4 }}>저장하면 일정·실적에 바로 반영돼요</span>}
            {onLegacy && <button type="button" onClick={onLegacy} style={{ padding: 0, border: 0, background: 'none', color: C.text4, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>이전 입력 화면</button>}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={{ height: 40, padding: '0 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>취소</button>
            <button type="button" disabled={!canSave} title={canSave ? undefined : `필수: ${missing.join(' · ')}`} onClick={onSave} style={{ height: 40, padding: '0 20px', borderRadius: 8, border: 0, background: canSave ? C.brand : C.strong, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>{isAdd ? '등록' : '저장'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
