import React, { useEffect, useRef, useState } from 'react';
import { extractKaptBidNo } from '../utils/kaptBidNo.js';

// K-APT 검증 모달 (디자인 #16a) — 헤더 · 방법 세그먼트 · 입력 · 푸터. 판정 실행은 부모(App)가 한다.
const C = { brand: '#0F4C75', brandMid: '#3282B8', brandLight: '#BBE1FA', brandBg: '#eef5fb', line: '#e2e8f0', line2: '#f1f5f9', text: '#1e293b', text2: '#475569', muted: '#64748b', faint: '#94a3b8' };
const MAX_SHOT = 5 * 1024 * 1024;
const RESULT_COLOR = { 승: '#15803d', 무: '#b45309', 패: '#b91c1c', 지원: C.brandMid };
const STATUS_PILL = {
  needs_review: ['공고 미매칭', '#fef3c7', '#b45309'],
  cancelled: ['취소공고', '#fef2f2', '#b91c1c'],
  verified: ['K-APT 검증', '#dcfce7', '#15803d'],
  'pending-admin-review': ['관리자 검토 중', '#dbeafe', C.brand],
};

export function KaptVerifyHeader({ siteName, manager, date, workType, result, kaptStatus, busy, onClose }) {
  const pill = STATUS_PILL[kaptStatus] || ['검증 전', C.line2, C.muted];
  const meta = [manager, date, workType].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px 14px', borderBottom: `1px solid ${C.line2}` }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 999, background: pill[1], color: pill[2], fontSize: 11.5, fontWeight: 700 }}>{pill[0]}</span>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, color: C.text }}>{siteName}</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
          {meta}{result && <> · 입력 결과 <b style={{ color: RESULT_COLOR[result] || C.text }}>{result}</b></>}
        </div>
      </div>
      {!busy && (
        <button type="button" onClick={onClose} aria-label="닫기" style={{ width: 32, height: 32, border: 0, borderRadius: 9, background: C.line2, color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' }}>✕</button>
      )}
    </div>
  );
}

export function KaptVerifyBusy({ title = '공고문을 읽는 중…', sub = '단지명 · 공종 · 공법 · 개찰일을 비교합니다' }) {
  return (
    <div style={{ padding: '40px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
      <span style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${C.line}`, borderTopColor: C.brand, animation: 'spin .8s linear infinite' }} />
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
      <div style={{ fontSize: 12.5, color: C.muted }}>{sub}</div>
    </div>
  );
}

const segStyle = (on) => ({
  flex: 1, height: 40, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 700 : 500,
  border: `1px solid ${on ? C.brandLight : C.line}`, background: on ? C.brandBg : '#fff', color: on ? C.brand : C.text2,
});
const chip = { padding: '2px 8px', borderRadius: 999, background: '#fff', border: `1px solid ${C.line}` };

function fmtSize(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

export default function KaptVerifyForm({ mode, onMode, shot, onShot, bidInput, onBidInput, kaptSearchUrl, onRunShot, onRunBid, onClose }) {
  const dropRef = useRef(null);
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!shot) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(shot);
    const img = new Image();
    img.onload = () => setPreview({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setPreview({ url, w: 0, h: 0 });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  useEffect(() => { if (mode === 'shot' && !shot) dropRef.current?.focus(); }, [mode, shot]);

  const take = (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) { alert('이미지 파일만 올릴 수 있어요.'); return; }
    if (file.size > MAX_SHOT) { alert('이미지 5MB 이하로 부탁드립니다.'); return; }
    onShot(file);
  };
  const onPaste = (e) => {
    for (const it of e.clipboardData?.items || []) {
      if (it.type?.startsWith('image/')) { e.preventDefault(); take(it.getAsFile()); return; }
    }
  };

  const bidNo = extractKaptBidNo(bidInput);
  const ready = mode === 'shot' ? !!shot : !!bidNo;
  const run = () => { if (!ready) return; mode === 'shot' ? onRunShot(shot) : onRunBid(bidNo); };

  return (
    <>
      <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 6 }} role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'shot'} onClick={() => onMode('shot')} style={segStyle(mode === 'shot')}>스크린샷으로 (AI)</button>
          <button type="button" role="tab" aria-selected={mode === 'no'} onClick={() => onMode('no')} style={segStyle(mode === 'no')}>공고번호 · URL로</button>
        </div>

        {mode === 'shot' && (
          <>
            {!shot ? (
              <div ref={dropRef} tabIndex={0} onPaste={onPaste} onClick={(e) => e.currentTarget.focus()}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files?.[0]); }}
                style={{ height: 180, border: `2px dashed ${C.brandLight}`, borderRadius: 12, background: '#f8fbfe', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textAlign: 'center', padding: 16, outlineColor: C.brandMid }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: C.brandBg, color: C.brand, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800 }}>⌘V</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.brand }}>여기를 누르고 캡처를 붙여넣기</div>
                <div style={{ fontSize: 12.5, color: C.muted }}>
                  Win+Shift+S 로 영역 캡처 → 바로 Ctrl+V · 또는{' '}
                  <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} style={{ padding: 0, border: 0, background: 'none', color: C.brand, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>파일 선택</button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, padding: 12, border: `1px solid ${C.line}`, borderRadius: 12 }}>
                <div style={{ width: 140, height: 96, borderRadius: 8, background: C.line2, flex: 'none', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                  {preview ? <img src={preview.url} alt="캡처 미리보기" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: C.faint }}>캡처 미리보기</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.name || '붙여넣은 캡처.png'}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{preview?.w ? `${preview.w}×${preview.h} · ` : ''}{fmtSize(shot.size)}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>단지명과 공법이 캡처에 보이는지 확인한 뒤 판정하세요.</div>
                </div>
                <button type="button" onClick={() => onShot(null)} style={{ alignSelf: 'flex-start', height: 30, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 7, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.text2 }}>다시</button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 12px', borderRadius: 9, background: '#f8fafc', fontSize: 12.5, color: C.text2 }}>
              <span style={{ fontWeight: 700, color: C.text }}>캡처에 꼭 보여야 하는 것</span>
              <span style={chip}>단지명</span>
              <span style={chip}>공법 (POUR/CNC/DO/DETEX/시멘트분말)</span>
            </div>
          </>
        )}

        {mode === 'no' && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: C.muted }}>
              <span>K-APT 공고번호 또는 상세 페이지 URL</span>
              <input autoFocus value={bidInput} onChange={(e) => onBidInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                placeholder="20260401144113799 · kg2b_128097 · bidDetail URL 붙여넣기"
                style={{ height: 46, padding: '0 14px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box', width: '100%' }} />
            </label>
            {bidNo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#15803d', fontWeight: 600 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center' }}>✓</span>
                공고번호 추출됨 · <span style={{ fontFamily: 'ui-monospace,Menlo,monospace' }}>{bidNo}</span>
              </div>
            )}
            {!bidNo && bidInput.trim() && (
              <div style={{ fontSize: 12.5, color: '#b45309' }}>공고번호를 못 찾았어요 · 14~20자리 숫자, kg2b_숫자, 또는 상세 페이지 URL</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, background: '#f8fafc', fontSize: 12.5, color: C.text2 }}>
              <span>K-APT 입찰공고 → 해당 공고 열기 → 주소창 URL 복사</span>
              <a href={kaptSearchUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: C.brand, fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none' }}>K-APT 열기 ↗</a>
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px 18px', borderTop: `1px solid ${C.line2}` }}>
        <span style={{ fontSize: 12, color: C.faint }}>판정 결과는 바로 반영돼요</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} style={{ height: 44, padding: '0 16px', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: C.text2 }}>취소</button>
        <button type="button" onClick={run} disabled={!ready}
          style={{ flex: '0 1 220px', height: 44, padding: '0 18px', border: 0, borderRadius: 10, background: ready ? C.brand : '#cbd5e1', color: '#fff', fontSize: 14, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          {mode === 'shot' ? 'AI로 판정' : '공고 조회 → 판정'}
        </button>
      </div>
    </>
  );
}
