import sys

filepath = r"C:\Users\Administrator\Desktop\클로드\001_일정관리\260311\src\App.jsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

old_start = "                    {/* ===== \ud30c\uc774\ud504\ub77c\uc778 \ud0ed ===== */}\n                    {activeTab === 'pipeline' && (() => {"
old_end_marker = "                    })()}\n\n                    <div style={{ height: '20px' }} />"

start_idx = content.find(old_start)
end_idx = content.find(old_end_marker, start_idx)

if start_idx == -1:
    print("ERROR: start not found")
    sys.exit(1)
if end_idx == -1:
    print("ERROR: end not found")
    sys.exit(1)

end_idx = end_idx + len(old_end_marker)
print(f"Block: {start_idx} to {end_idx}, len={end_idx - start_idx}")

new_block = """                    {/* ===== \ud30c\uc774\ud504\ub77c\uc778 \ud0ed ===== */}
                    {activeTab === 'pipeline' && (() => {
                      const myPipeline = pipelineData.filter(item => item.assigneeName === viewingUser);
                      const myActive = myPipeline.filter(i => i.stageType === 'active');
                      const myWon = myPipeline.filter(i => i.stageType === 'won');
                      const myLost = myPipeline.filter(i => i.stageType === 'lost');
                      const myTotalValue = myPipeline.reduce((s, i) => s + (Number(i.dealValue) || 0), 0);
                      const myActiveValue = myActive.reduce((s, i) => s + (Number(i.dealValue) || 0), 0);
                      const myWonValue = myWon.reduce((s, i) => s + (Number(i.dealValue) || 0), 0);
                      const myLostValue = myLost.reduce((s, i) => s + (Number(i.dealValue) || 0), 0);
                      const winRate = (myWon.length + myLost.length) > 0 ? Math.round(myWon.length / (myWon.length + myLost.length) * 100) : 0;

                      const fmtVal = (v) => {
                        if (v >= 100000000) return (v / 100000000).toFixed(1) + '\uc5b5';
                        if (v >= 10000) return Math.round(v / 10000) + '\ub9cc';
                        return v.toLocaleString();
                      };

                      const kanbanGroupDefs = [
                        { key: 'early', label: '\ucd08\uae30', stages: ['\ub300\uae30\uace0\uac1d', '\uc720\ub300\uad00\uacc4 \uac15\ud654', '\ucee8\uc124\ud305 \uc790\ub8cc \ubc1c\uc1a1\uc644\ub8cc', '\uce68\ubb35 \uad00\ub9ac \ub2e8\uacc4'], color: '#6b7280', bg: '#f3f4f6' },
                        { key: 'consulting', label: '\ucee8\uc124\ud305', stages: ['\ucee8\uc124\ud305 \uc124\uacc4\ub2e8\uacc4', '2\ucc28 \ubbf8\ud305', '\uacac\uc801\uc11c \ubc1c\uc1a1'], color: '#3b82f6', bg: '#dbeafe' },
                        { key: 'compete', label: '\uacbd\uc7c1/PT', stages: ['\uacbd\uc7c1 \ub2e8\uacc4', '\uc785\ucc30\ub2e8\uacc4', '\uacf5\uc0ac \uc784\ubc15 \ub2e8\uacc4', '\uacf5\uc0ac \uc784\ubc15 \ub2e8\uacc4 (\ub9c8\uc9c0\ub9c9 \ud68c\uc758)'], color: '#f59e0b', bg: '#fef3c7' },
                        { key: 'contract', label: '\uacc4\uc57d/\uc2dc\uacf5', stages: ['\uacc4\uc57d\ub2e8\uacc4', '\uc2dc\uacf5\ub2e8\uacc4', '\uacf5\uc0ac \uc9c4\ud589', '\uc900\uacf5\ub2e8\uacc4', '\uc778\uacc4', '\ud655\uc7a5\ub2e8\uacc4'], color: '#8b5cf6', bg: '#ede9fe' },
                        { key: 'won', label: '\uc218\uc8fc', stages: ['\uc218\uc8fc \uc131\uacf5', '\uacf5\uc0ac\uc644\ub8cc'], color: '#10b981', bg: '#d1fae5' },
                        { key: 'lost', label: '\uc2e4\ud328', stages: ['\uc218\uc8fc \uc2e4\ud328'], color: '#ef4444', bg: '#fee2e2' },
                      ];
                      const getStageGroup = (stage) => {
                        for (const g of kanbanGroupDefs) {
                          if (g.stages.some(s => (stage || '').includes(s) || s.includes(stage || ''))) return g;
                        }
                        return kanbanGroupDefs[0];
                      };

                      const brandGroups = {};
                      myPipeline.forEach(item => {
                        const b = item.brandList || '\uae30\ud0c0';
                        if (!brandGroups[b]) brandGroups[b] = { count: 0, value: 0, active: 0, won: 0, lost: 0 };
                        brandGroups[b].count++;
                        brandGroups[b].value += (Number(item.dealValue) || 0);
                        if (item.stageType === 'active') brandGroups[b].active++;
                        if (item.stageType === 'won') brandGroups[b].won++;
                        if (item.stageType === 'lost') brandGroups[b].lost++;
                      });
                      const brandEntries = Object.entries(brandGroups).sort((a, b) => b[1].value - a[1].value);
                      const brandColors = { '\uc11d\ubbfc\uc774\uc564\uc528': '#0ea5e9', 'POUR\uc194\ub8e8\uc158': '#ec4899', '\uc544\ud30c\ud2b8\uc2a4\ucffc\uc5b4': '#22c55e' };
                      const maxBrandVal = Math.max(...brandEntries.map(e => e[1].value), 1);

                      const groupStats = kanbanGroupDefs.map(g => {
                        const items = myPipeline.filter(i => getStageGroup(i.stage) === g);
                        return { ...g, count: items.length, value: items.reduce((s, i) => s + (Number(i.dealValue) || 0), 0) };
                      }).filter(g => g.count > 0);
                      const totalGroupCount = groupStats.reduce((s, g) => s + g.count, 0) || 1;

                      const stageGroups = {};
                      myActive.forEach(item => {
                        const stage = item.stage || '\uae30\ud0c0';
                        if (!stageGroups[stage]) stageGroups[stage] = { items: [], value: 0 };
                        stageGroups[stage].items.push(item);
                        stageGroups[stage].value += (Number(item.dealValue) || 0);
                      });
                      const stageEntries = Object.entries(stageGroups).sort((a, b) => b[1].value - a[1].value);

                      return (
                        <>
                          {/* \uc11c\ube0c \ud0ed */}
                          <div style={{ ...cardStyle, padding: '0', overflow: 'hidden', marginBottom: '0' }}>
                            <div style={{ display: 'flex', borderBottom: '2px solid #f3f4f6' }}>
                              {[{ key: 'summary', label: '\uc694\uc57d' }, { key: 'list', label: '\ub0b4\uc5ed' }, { key: 'analysis', label: '\ubd84\uc11d' }].map(tab => (
                                <button key={tab.key} onClick={() => setMyPagePipelineTab(tab.key)} style={{ flex: 1, padding: '14px 0', border: 'none', background: 'transparent', fontSize: '14px', fontWeight: '600', cursor: 'pointer', color: myPagePipelineTab === tab.key ? '#111827' : '#9ca3af', borderBottom: myPagePipelineTab === tab.key ? '2.5px solid #111827' : '2.5px solid transparent', marginBottom: '-2px', transition: 'all 0.2s' }}>{tab.label}</button>
                              ))}
                            </div>
                          </div>

                          {myPagePipelineTab === 'summary' && (
                            <>
                              <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
                                <div style={{ padding: '24px 28px 20px', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div>
                                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: '500', marginBottom: '4px' }}>\ucd1d \uae08\uc561</div>
                                      <div style={{ fontSize: '30px', fontWeight: '800', color: 'white', letterSpacing: '-1.5px', lineHeight: 1 }}>{fmtVal(myTotalValue)}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: '500', marginBottom: '4px' }}>\uc218\uc8fc\uc728</div>
                                      <div style={{ fontSize: '26px', fontWeight: '800', color: winRate >= 50 ? '#4ade80' : '#fbbf24', letterSpacing: '-1px', lineHeight: 1 }}>{winRate}<span style={{ fontSize: '14px' }}>%</span></div>
                                    </div>
                                  </div>
                                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${winRate}%`, background: winRate >= 50 ? '#4ade80' : '#fbbf24', borderRadius: '2px', transition: 'width 0.6s ease' }} />
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '6px' }}>\ucd1d {myPipeline.length}\uac74 \u00b7 \uc9c4\ud589 {fmtVal(myActiveValue)}</div>
                                </div>
                                <div style={{ display: 'flex' }}>
                                  {[
                                    { label: '\uc9c4\ud589\uc911', value: myActive.length, sub: fmtVal(myActiveValue), color: '#3b82f6', bg: '#eff6ff' },
                                    { label: '\uc218\uc8fc', value: myWon.length, sub: fmtVal(myWonValue), color: '#10b981', bg: '#ecfdf5' },
                                    { label: '\uc2e4\ud328', value: myLost.length, sub: fmtVal(myLostValue), color: '#ef4444', bg: '#fef2f2' },
                                  ].map((item, i) => (
                                    <div key={item.label} style={{ flex: 1, textAlign: 'center', padding: '18px 8px', background: item.bg, borderRight: i < 2 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                                      <div style={{ fontSize: '24px', fontWeight: '800', color: item.color, letterSpacing: '-0.5px', lineHeight: 1 }}>{item.value}</div>
                                      <div style={{ fontSize: '11px', color: '#999', marginTop: '6px', fontWeight: '600' }}>{item.label}</div>
                                      <div style={{ fontSize: '10px', color: '#bbb', marginTop: '2px' }}>{item.sub}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                                {sectionTitle('\ub2e8\uacc4\ubcc4 \ubd84\ud3ec', myPipeline.length + '\uac74')}
                                <div style={{ padding: '16px 24px 20px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'center', marginBottom: '16px' }}>
                                    <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                                      <svg viewBox="0 0 36 36" style={{ width: '120px', height: '120px', transform: 'rotate(-90deg)' }}>
                                        {(() => {
                                          let offset = 0;
                                          return groupStats.map((g) => {
                                            const pct = (g.count / totalGroupCount) * 100;
                                            const el = <circle key={g.key} cx="18" cy="18" r="15.9" fill="none" stroke={g.color} strokeWidth="3.5" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-offset} />;
                                            offset += pct;
                                            return el;
                                          });
                                        })()}
                                      </svg>
                                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', lineHeight: 1 }}>{myPipeline.length}</div>
                                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>\uc804\uccb4</div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {groupStats.map(g => (
                                        <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: g.color, flexShrink: 0 }} />
                                          <span style={{ fontSize: '12px', color: '#555', fontWeight: '500', minWidth: '48px' }}>{g.label}</span>
                                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#111' }}>{Math.round(g.count / totalGroupCount * 100)}%</span>
                                          <span style={{ fontSize: '11px', color: '#aaa' }}>{g.count}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                                {sectionTitle('\uc9c4\ud589\uc911 TOP', myActive.length + '\uac74')}
                                {myActive.length === 0 ? (
                                  <div style={{ padding: '36px 20px', textAlign: 'center', color: '#bbb', fontSize: '14px', borderTop: '1px solid #f2f2f2' }}>\uc5c6\uc74c</div>
                                ) : [...myActive].sort((a, b) => (Number(b.dealValue) || 0) - (Number(a.dealValue) || 0)).slice(0, 5).map((item, idx) => {
                                  const sc = getStageGroup(item.stage);
                                  return (
                                    <div key={item.id || idx} onClick={() => setSelectedPipelineItem(item)} style={{ padding: '13px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: idx === 0 ? '1px solid #f2f2f2' : '1px solid #f8f8f8', cursor: 'pointer', transition: 'background 0.15s' }}
                                      onMouseOver={e => e.currentTarget.style.background = '#fafafa'}
                                      onMouseOut={e => e.currentTarget.style.background = 'white'}>
                                      <div style={{ width: 3, height: '34px', borderRadius: '2px', background: sc.color, flexShrink: 0 }} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a1a', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.orgName}</div>
                                        <div style={{ fontSize: '11px', color: '#bbb', marginTop: '3px' }}><span style={{ color: sc.color, fontWeight: '600' }}>{item.stage}</span> \u00b7 {item.brandList || ''}</div>
                                      </div>
                                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a1a', flexShrink: 0 }}>{item.dealValue ? fmtVal(item.dealValue) : '-'}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}

                          {myPagePipelineTab === 'list' && (
                            <>
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', paddingTop: '4px' }}>
                                {[{ key: 'all', label: '\uc804\uccb4 ' + myPipeline.length, color: '#6b7280' }, { key: 'active', label: '\uc9c4\ud589 ' + myActive.length, color: '#3b82f6' }, { key: 'won', label: '\uc218\uc8fc ' + myWon.length, color: '#10b981' }, { key: 'lost', label: '\uc2e4\ud328 ' + myLost.length, color: '#ef4444' }].map(f => (
                                  <button key={f.key} onClick={() => setPipelineStageTypeFilter(prev => prev === f.key ? 'all' : f.key)} style={{ padding: '6px 14px', borderRadius: '20px', border: pipelineStageTypeFilter === f.key ? 'none' : '1px solid #e5e7eb', fontSize: '12px', fontWeight: '600', cursor: 'pointer', background: pipelineStageTypeFilter === f.key ? f.color + '15' : 'white', color: pipelineStageTypeFilter === f.key ? f.color : '#9ca3af' }}>{f.label}</button>
                                ))}
                              </div>
                              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                                {(() => {
                                  const listData = pipelineStageTypeFilter === 'all' ? myPipeline : pipelineStageTypeFilter === 'active' ? myActive : pipelineStageTypeFilter === 'won' ? myWon : myLost;
                                  const sortedList = [...listData].sort((a, b) => (Number(b.dealValue) || 0) - (Number(a.dealValue) || 0));
                                  return sortedList.length === 0 ? (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#bbb', fontSize: '14px' }}>\ub370\uc774\ud130\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</div>
                                  ) : sortedList.map((item, idx) => {
                                    const stColor = item.stageType === 'won' ? '#10b981' : item.stageType === 'lost' ? '#ef4444' : '#3b82f6';
                                    return (
                                      <div key={item.id || idx} onClick={() => setSelectedPipelineItem(item)} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: idx > 0 ? '1px solid #f5f5f5' : 'none', cursor: 'pointer' }}
                                        onMouseOver={e => e.currentTarget.style.background = '#fafafa'}
                                        onMouseOut={e => e.currentTarget.style.background = 'white'}>
                                        <div style={{ width: '4px', height: '36px', borderRadius: '2px', background: stColor, flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a1a', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.orgName}</div>
                                          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '3px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span style={{ padding: '1px 6px', borderRadius: '4px', background: stColor + '12', color: stColor, fontWeight: '600', fontSize: '10px' }}>{item.stage}</span>
                                            <span>{item.brandList || ''}</span>
                                          </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a1a' }}>{item.dealValue ? fmtVal(item.dealValue) : '-'}</div>
                                          <div style={{ fontSize: '10px', color: '#ccc', marginTop: '2px' }}>{item.lastActivityDate ? new Date(item.lastActivityDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : ''}</div>
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </>
                          )}

                          {myPagePipelineTab === 'analysis' && (
                            <>
                              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                                {sectionTitle('\ube0c\ub79c\ub4dc\ubcc4 \uae08\uc561', '')}
                                <div style={{ padding: '12px 24px 20px' }}>
                                  {brandEntries.map(([brand, data], idx) => {
                                    const bc = brandColors[brand] || '#6b7280';
                                    const barWidth = Math.max((data.value / maxBrandVal) * 100, 3);
                                    return (
                                      <div key={brand} style={{ marginBottom: idx < brandEntries.length - 1 ? '16px' : 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{brand}</span>
                                          <span style={{ fontSize: '14px', fontWeight: '800', color: '#111' }}>{fmtVal(data.value)}</span>
                                        </div>
                                        <div style={{ height: '28px', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                                          <div style={{ height: '100%', width: `${barWidth}%`, background: `linear-gradient(90deg, ${bc}, ${bc}cc)`, borderRadius: '8px', transition: 'width 0.6s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '10px' }}>
                                            {barWidth > 20 && <span style={{ fontSize: '11px', fontWeight: '600', color: 'white' }}>{data.count}\uac74</span>}
                                          </div>
                                          {barWidth <= 20 && <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', fontWeight: '600', color: '#999' }}>{data.count}\uac74</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                          <span style={{ fontSize: '10px', color: '#3b82f6' }}>\uc9c4\ud589 {data.active}</span>
                                          <span style={{ fontSize: '10px', color: '#10b981' }}>\uc218\uc8fc {data.won}</span>
                                          <span style={{ fontSize: '10px', color: '#ef4444' }}>\uc2e4\ud328 {data.lost}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                                {sectionTitle('\uc9c4\ud589 \ub2e8\uacc4\ubcc4 \uae08\uc561', fmtVal(myActiveValue))}
                                <div style={{ padding: '12px 24px 20px' }}>
                                  {stageEntries.length === 0 ? (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#bbb', fontSize: '13px' }}>\uc5c6\uc74c</div>
                                  ) : stageEntries.map(([stage, data], idx) => {
                                    const sc = getStageGroup(stage);
                                    const barPct = myActiveValue > 0 ? Math.max((data.value / myActiveValue) * 100, 3) : 3;
                                    return (
                                      <div key={stage} style={{ marginBottom: idx < stageEntries.length - 1 ? '14px' : 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '2px', background: sc.color }} />
                                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>{stage}</span>
                                          </div>
                                          <div style={{ display: 'flex', gap: '6px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#111' }}>{fmtVal(data.value)}</span>
                                            <span style={{ fontSize: '11px', color: '#aaa' }}>{data.items.length}\uac74</span>
                                          </div>
                                        </div>
                                        <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                                          <div style={{ height: '100%', width: `${barPct}%`, background: sc.color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div style={{ ...cardStyle, padding: '20px 24px' }}>
                                {sectionTitle('\uc218\uc8fc vs \uc2e4\ud328', '')}
                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                  <div style={{ flex: 1, background: '#ecfdf5', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '22px', fontWeight: '800', color: '#10b981' }}>{myWon.length}\uac74</div>
                                    <div style={{ fontSize: '11px', color: '#6ee7b7', marginTop: '4px', fontWeight: '600' }}>\uc218\uc8fc \uc131\uacf5</div>
                                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#059669', marginTop: '8px' }}>{fmtVal(myWonValue)}</div>
                                  </div>
                                  <div style={{ flex: 1, background: '#fef2f2', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '22px', fontWeight: '800', color: '#ef4444' }}>{myLost.length}\uac74</div>
                                    <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '4px', fontWeight: '600' }}>\uc218\uc8fc \uc2e4\ud328</div>
                                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#dc2626', marginTop: '8px' }}>{fmtVal(myLostValue)}</div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()}

                    <div style={{ height: '20px' }} />"""

content = content[:start_idx] + new_block + content[end_idx:]

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("SUCCESS")
