import React, { useState } from 'react';
import { OUR_CHIPS, OTHER_CHIPS, parseMethods, joinMethods } from '../utils/methods.js';

// 공고문에 적힌 공법 칩 — "우리" POUR·CNC·DO·DETEX | "타공법" 4A시스템·금영ENC·기타.
// 기타를 고르면 칩 아래 별도 줄에 "기타 타공법" 입력(쉼표 구분)이 열린다. value/onChange 는 저장 문자열.

const C = { brand: '#0F4C75', red: '#b91c1c', line: '#e2e8f0', text2: '#475569', text4: '#94a3b8' };

export default function MethodChips({ value, onChange, size = 32 }) {
  const parsed = parseMethods(value);
  const [etcOpen, setEtcOpen] = useState(parsed.etc.length > 0);
  const [etcText, setEtcText] = useState(parsed.etc.join(', '));
  const showEtc = etcOpen || parsed.etc.length > 0;

  const emit = (chips, etcStr) => onChange(joinMethods(chips, String(etcStr).split(',').map(s => s.trim()).filter(Boolean)));
  const toggle = chip => {
    const chips = parsed.chips.includes(chip) ? parsed.chips.filter(c => c !== chip) : [...parsed.chips, chip];
    emit(chips, showEtc ? etcText : '');
  };
  const toggleEtc = () => {
    if (showEtc) { setEtcOpen(false); setEtcText(''); emit(parsed.chips, ''); }
    else setEtcOpen(true);
  };
  const chip = (on, red) => ({
    height: size, padding: '0 12px', borderRadius: 999, fontSize: size >= 40 ? 14 : 12.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500,
    border: `1px solid ${on ? (red ? C.red : C.brand) : C.line}`,
    background: on ? (red ? '#b91c1c18' : C.brand) : '#fff',
    color: on ? (red ? C.red : '#fff') : C.text2,
  });
  const groupLabel = { fontSize: 11.5, fontWeight: 600, color: C.text4, marginRight: 2 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={groupLabel}>우리</span>
        {OUR_CHIPS.map(m => <button key={m} type="button" aria-pressed={parsed.chips.includes(m)} onClick={() => toggle(m)} style={chip(parsed.chips.includes(m), false)}>{m}</button>)}
        <span aria-hidden="true" style={{ width: 1, height: 18, background: C.line, margin: '0 4px' }} />
        <span style={groupLabel}>타공법</span>
        {OTHER_CHIPS.map(m => <button key={m} type="button" aria-pressed={parsed.chips.includes(m)} onClick={() => toggle(m)} style={chip(parsed.chips.includes(m), true)}>{m}</button>)}
        <button type="button" aria-pressed={showEtc} onClick={toggleEtc} style={chip(showEtc, true)}>기타</button>
      </div>
      {showEtc && (
        <label style={{ display: 'block', marginTop: 8, fontSize: 12, fontWeight: 600, color: C.text2 }}>
          기타 타공법
          <input value={etcText} autoFocus={etcOpen && !parsed.etc.length}
            onChange={e => { setEtcText(e.target.value); emit(parsed.chips, e.target.value); }}
            placeholder="공법명 직접 입력 · 여러 개는 쉼표로"
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, height: size >= 40 ? 44 : 38, padding: '0 12px', border: '1px solid #fecaca', borderRadius: 9, fontSize: 13.5, fontFamily: 'inherit' }} />
        </label>
      )}
    </div>
  );
}
