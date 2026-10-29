// 메인(#6a) 파생값 — 기존 메인 대시보드(App.jsx showDashboard)의 계산 정의를 그대로 옮긴 것.
// 다른 점: PT 승률은 핸드오프대로 승/(승+패) (무 제외).

export const STAGE_GROUPS = {
  early: ['대기고객', '유대관계 강화', '컨설팅 자료 발송완료', '침묵 관리 단계'],
  consulting: ['컨설팅 설계단계', '2차 미팅', '견적서 발송'],
  compete: ['경쟁 단계', '입찰단계', '공사 임박 단계'],
  contract: ['계약단계', '시공단계', '공사 진행', '준공단계', '인계'],
  won: ['수주 성공', '공사완료'],
  lost: ['수주 실패'],
};

export function stageGroup(stage) {
  for (const [key, stages] of Object.entries(STAGE_GROUPS)) {
    if (stages.some(s => (stage || '').includes(s) || s.includes(stage || ''))) return key;
  }
  return 'early';
}

const isContract = i => { const g = stageGroup(i.stage); return g === 'contract' || g === 'won'; };
const isCompeteUp = i => { const g = stageGroup(i.stage); return g === 'compete' || g === 'contract' || g === 'won'; };
const sumValue = items => items.reduce((s, i) => s + (Number(i.dealValue) || 0), 0);
const pct = (n, d) => (d > 0 ? Math.round(n / d * 100) : 0);
const hasResult = (s, r) => s.results && Object.values(s.results).some(v => (r ? v === r : v === '승' || v === '패' || v === '무'));

export function filterPipeline(pipeline, { year, company } = {}) {
  return (pipeline || []).filter(i => (!year || year === 'all' || String(i['공사계획년도'] || '').trim() === year)
    && (!company || company === '전체' || i.processList === company));
}

export function filterPtByYear(pts, year) {
  if (!year || year === 'all') return pts || [];
  return (pts || []).filter(s => (s.date || '').startsWith(year));
}

export function salesStats(pipe) {
  const contract = pipe.filter(isContract);
  const won = pipe.filter(i => i.stageType === 'won').length;
  const lost = pipe.filter(i => i.stageType === 'lost').length;
  return {
    total: pipe.length,
    revenue: sumValue(contract),
    progressRate: pct(contract.length, pipe.length),
    winRate: pct(won, won + lost),
    lossRate: pct(lost, won + lost),
    contractCount: contract.length,
  };
}

export function ptStats(pts) {
  const w = pts.filter(s => hasResult(s, '승')).length;
  const d = pts.filter(s => hasResult(s, '무')).length;
  const l = pts.filter(s => hasResult(s, '패')).length;
  const withResult = pts.filter(s => hasResult(s)).length;
  return { total: pts.length, w, d, l, p: Math.max(0, pts.length - withResult), withResult, rate: pct(w, w + l) };
}

export function flow(pipe, pts) {
  const sales = salesStats(pipe);
  const pt = ptStats(pts);
  const ptReached = pipe.filter(isCompeteUp).length;
  const contracted = pipe.filter(isContract);
  const highProb = pipe.filter(i => stageGroup(i.stage) === 'compete');
  const contractedRevenue = sumValue(contracted);
  const highProbRevenue = sumValue(highProb);
  return {
    sales,
    pt,
    ptRate: pct(ptReached, pipe.length),                 // 기존 "PT진행" 비율 (파이프라인 경쟁 단계 이상 / 전체)
    contract: { count: contracted.length, revenue: contractedRevenue },
    contractRate: pct(contracted.length, pt.withResult),  // 기존 "PT→계약 전환율" (계약 / PT결과)
    expected: {
      total: contractedRevenue + Math.round(highProbRevenue * 0.5),
      contractedRevenue, highProbRevenue,
      contractedCount: contracted.length, highProbCount: highProb.length,
    },
  };
}

function byAssignee(list, names, field) {
  return list.filter(s => { const a = String(field(s) || ''); return names.some(n => a.includes(n)); });
}

export function teamRows(pipe, pts, teams) {
  const rows = teams.map(t => {
    const tp = pipe.filter(i => t.members.includes(i.assigneeName));
    const tPt = byAssignee(pts, t.members, s => s.assignee || s.ptAssignee);
    return { name: t.name, members: t.members, sales: salesStats(tp), pt: ptStats(tPt) };
  });
  const allMembers = teams.flatMap(t => t.members);
  const sp = pipe.filter(i => allMembers.includes(i.assigneeName));
  const sPt = byAssignee(pts, allMembers, s => s.assignee || s.ptAssignee);
  return { rows, total: { name: '합계', members: [], sales: salesStats(sp), pt: ptStats(sPt) } };
}

export function eok(won) {
  return `${((Number(won) || 0) / 100000000).toFixed(1)}억`;
}
