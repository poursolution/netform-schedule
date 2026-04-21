// K-APT PDF 파싱 Playwright 서버 (Oracle Cloud Seoul 등 한국 VPS에서 실행)
//
// 역할:
//   Cloudflare Worker가 POST /verify 호출 → Playwright로 K-APT 접근
//   → 공고 상세 페이지 텍스트 + PDF 파싱 → 우리 공법/특허 매칭 → JSON 반환
//
// 실행 전:
//   1. npm install
//   2. npx playwright install chromium --with-deps
//   3. AUTH_TOKEN 환경변수 설정 (Worker에서 인증에 사용)

import express from 'express';
import { chromium } from 'playwright';
import pdf from 'pdf-parse';
import { execFile } from 'child_process';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import admin from 'firebase-admin';
import 'dotenv/config';

// === Firebase Admin SDK 초기화 (lazy) ===
let firebaseApp = null;
async function getFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;
  const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.join(os.homedir(), 'kapt-playwright-server', 'firebase-admin.json');
  const raw = await fsp.readFile(credPath, 'utf-8');
  const serviceAccount = JSON.parse(raw);
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'test-168a4.firebasestorage.app',
  });
  return firebaseApp;
}

// HWP/HWPX → 텍스트 변환 (LibreOffice CLI 경유)
function parseHwpBuffer(buffer) {
  return new Promise(async (resolve, reject) => {
    try {
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kapt-hwp-'));
      const id = crypto.randomBytes(6).toString('hex');
      const hwpFile = path.join(tmpDir, `doc_${id}.hwp`);
      await fsp.writeFile(hwpFile, buffer);
      execFile('libreoffice', ['--headless', '--convert-to', 'txt', '--outdir', tmpDir, hwpFile], { timeout: 60000 }, async (err, stdout, stderr) => {
        try {
          if (err) { await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); return reject(err); }
          const txtFile = hwpFile.replace(/\.hwp$/i, '.txt');
          const text = await fsp.readFile(txtFile, 'utf-8').catch(() => '');
          await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          resolve({ text });
        } catch (e) { reject(e); }
      });
    } catch (e) { reject(e); }
  });
}

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'change-me-in-production';

const OUR_TECHNOLOGIES = ['POUR', 'CNC', 'DO', 'DETEX', '시멘트분말'];
// 85개 특허: 번호 + 특허명 (공고문에서 번호 or 명칭 둘 다 매칭)
const OUR_PATENTS = [
  { num: '10-1520738', name: '슁글 사이의 간격을 메우는 방수재 및 그에 의한 슁글 방수방법' },
  { num: '10-1703553', name: '지하 바닥의 수분을 제거하기 위한 벤트 구조물' },
  { num: '10-1828211', name: '콘크리트 구조물의 크랙 보수를 위한 인젝터 그라우팅 공법의 보수제 및 이를 이용한 보수장치' },
  { num: '10-1831299', name: '콘크리트 외벽의 크랙보수를 위한 물차단판 및 이를 이용한 크랙 보수방법' },
  { num: '10-1883132', name: '방수시트를 활용한 측벽 방수 구조체' },
  { num: '10-1885983', name: '콘크리트 바닥의 수분을 제거하기 위한 벤트 구조물' },
  { num: '10-1905536', name: '금속지붕재로 이루어진 지붕의 마감구조' },
  { num: '10-1923102', name: '슁글 마감을 위한 보강시트를 포함하는 후레싱 구조' },
  { num: '10-1935719', name: '콘크리트 구조물의 크랙 보수를 위한 보수층 및 그 보수방법' },
  { num: '10-1994773', name: '콘크리트 구조물의 크랙에 의한 누수를 방지하기 위한 슁글을 포함하는 방수층' },
  { num: '10-2119347', name: '슁글 및 금속지붕재를 방수하기 위한 방수구조물' },
  { num: '10-2122691', name: '강풍에 의한 피해를 차단하는 보강재를 포함하는 후레싱 마감구조' },
  { num: '10-2122700', name: '강풍에 의한 피해를 차단하는 금속지붕 보강재' },
  { num: '10-2272203', name: '강풍에 의한 피해를 차단하는 보강재를 포함하는 방수구조물' },
  { num: '10-2274045', name: '강풍에 의한 피해를 차단하는 보강재를 포함하는 후레싱 마감구조' },
  { num: '10-2320426', name: '강풍에 의한 2차 피해를 차단하는 후레싱 마감구조' },
  { num: '10-2345836', name: '강풍에 의한 피해를 차단하는 금속지붕 보강재' },
  { num: '10-2398289', name: '퍼티재를 활용한 콘크리트 구조물의 크랙보수층' },
  { num: '10-2398296', name: '퍼티재를 활용한 콘크리트 구조물의 크랙보수층을 포함하는 유기계 방수증' },
  { num: '10-2398304', name: '퍼티재를 활용한 크랙보수층을 포함하는 콘크리트 구조물의 도장방법' },
  { num: '10-2425081', name: '표면강화층을 포함하는 콘크리트에 접합되는 유기계 방수층' },
  { num: '10-2425088', name: '표면강화층을 포함하는 금속지붕재에 접합된 유기계 방수증' },
  { num: '10-2474761', name: '표면강화층을 포함하는 콘크리트 측벽에 접합되는 유기계 방수층' },
  { num: '10-2516517', name: '아스콘 재포장에서의 보도블록의 재시공을 위한 경계석 접합층' },
  { num: '10-2532155', name: '롤러에 페인트를 공급하는 친환경 도장장치' },
  { num: '10-2535699', name: '콘크리트 표면 강화 및 습기 차단을 위한 도장공법' },
  { num: '10-2536398', name: '페인트 비산방지를 위한 이중롤러를 포함하는 친환경 도장장치' },
  { num: '10-2539919', name: '콘크리트 강화 및 내습을 위한 보강 및 보수공법' },
  { num: '10-2541308', name: '친환경 TPE 단열복합방수시트 및 이의 제조방법' },
  { num: '10-2544157', name: '콘크리트 표면 강화 및 습기 차단을 위한 공법' },
  { num: '10-2544161', name: '친환경 TPE 단열복합방수 시공법' },
  { num: '10-2562854', name: '아스콘 접합층을 포함하는 아스콘 재포장층' },
  { num: '10-2562855', name: '아스콘 재포장에서의 재시공을 위한 경계석 접합층을 포함하는 도로 경계석' },
  { num: '10-2574833', name: '무동력팬과 고흡수성 시트를 활용한 모듈형 에어벤트' },
  { num: '10-2574836', name: '무동력팬과 고흡수성 시트를 활용한 모듈형 에어벤트를 이용한 콘크리트층 습기 배출공법' },
  { num: '10-2586662', name: '함침직물을 활용한 우레탄 포함 방수층 및 그 함침직물 제조방법' },
  { num: '10-2603257', name: '결로방지 복합단열시트  및 이를 이용한 노출 시트방수공법' },
  { num: '10-2614027', name: '배수유도기능을 구비한 배관트랩 및 이를 이용한 배수유도 방수공법' },
  { num: '10-2643734', name: '배수구의 하자보수를 위한 보수용 배관 및 그 설치방법' },
  { num: '10-2664685', name: '태양전지를 이용한 습기제거용 탈기장치' },
  { num: '10-2664703', name: '태양전지 및 벤트 홀을 이용한 습기제거용 탈기장치' },
  { num: '10-2677910', name: '단열 및 방수효과가 우수한 결로방지 단열방수시트와 친환경 수용성 방수재를 이용한 건물 옥상 슬라브의 복합 방수공법' },
  { num: '10-2680047', name: '고흡수성 시트와 알루미늄 필름으로 이루어진 방수시트 및 절연방수 공법' },
  { num: '10-2694890', name: '복합 화합물을 포함하는 수성 페인트 도료를 이용한 고내구성을 가진 도장 공법' },
  { num: '10-2699417', name: '콘크리트 구조물의 균열보수재 및 이를 이용한 균열보수 및 보강공법' },
  { num: '10-2709702', name: '특수 수성도료 조성물을 이용하여 부착력 및 강도를 증진시킨 수성용 페인트를 활용한 외벽 도장공법' },
  { num: '10-2709705', name: '그리드섬유 보강시트를 활용한 후레싱 및 박공지붕 방수 보강공법' },
  { num: '10-2715409', name: '논슬립 및 내마모성을 증진시킨 고강도 에폭시를 이용한 도장 및 방수공법' },
  { num: '10-2743867', name: '콘크리트용 에폭시 도료 조성물 및 무기질계 혼합물을 이용한 콘크리트 표면 도장공법' },
  { num: '10-2780472', name: '에폭시 콘크리트 바닥 방수용 도장재 및 무기질 파우더를 이용한 콘크리트 표면 도장 공법' },
  { num: '10-2784426', name: '콘크리트 구조물의 벽체를 위한 재도장층' },
  { num: '10-2793770', name: '고기능성 재료 결합을 통한 콘크리트 구조물 보수용 조성물 및 보수 공법' },
  { num: '10-2803706', name: '고강도 탄성무기질 화합물을 이용한 콘크리트 보수보강 공법' },
  { num: '10-2805601', name: '유성 도료를 이용한 특수 소재 및 자재 특성을 갖는 도장 및 방수 방법' },
  { num: '10-2816037', name: '속경형 폴리화이버로 이루어진 복합 모르타르 조성물 및 이를 이용한 경계석의 측구 보수보강 공법' },
  { num: '10-2820585', name: '2액형 아크릴계 방수 주입 및 유도판 이음부를 방수보강하는 지하슬라브 방수공법' },
  { num: '10-2826539', name: '박공형 지붕용 다층 복합방수 시공 방법' },
  { num: '10-2844945', name: '균열 보강 및 내구성 향상을 위한 충격 저항형 논슬립 에폭시 도장 공법' },
  { num: '10-2846086', name: '균열 방지 및 장기 내구성 강화를 위한 특수 섬유시트 적용 폴리우레아 도장공법' },
  { num: '10-2856572', name: '콘크리트 구조물의 물고임 방지 및 균열 보강을 위한 평슬라브 복합 방수 공법' },
  { num: '10-2856575', name: '슬라브 건축물의 내구성 보강 및 수분 정체 억제를 위한 복합 방수 시공 공법' },
  { num: '10-2856577', name: '단열 및 방수 효과가 뛰어난 고기능성 시트와 수용성 방수재를 적용한 콘트리트 슬라브 방수 공법' },
  { num: '10-2856580', name: '우레탄 방수 바탕 형성을 위한 특수 무기질 조성물 적용형 우레탄 방수공법' },
  { num: '10-2856581', name: '건축구조물의 균열보강 및 방수지속력이 우수한 복합우레탄 방수공법' },
  { num: '10-2856582', name: '균열 보수 및 콘크리트 구조체 보호를 위한 고기능성 외벽 도장공법' },
  { num: '10-2859385', name: '섬유 적층 기술을 적용한 박공형 지붕용 내구성 강화 복합 방수층 형성 및 시공 방법' },
  { num: '10-2859386', name: '특수 무기질 조성물을 함유한 고내구성, 고탄성 및 수분차단성 유성도료 기반 복합 우레탄 방수공법' },
  { num: '10-2859388', name: '고강도 보강 및 논슬립 입자를 활용한 내마모성 증진형 에폭시 도장 공법' },
  { num: '10-2859390', name: '높낮이 조절 기능을 갖춘 경사면 작업용 자재 고정 및 지지 장치' },
  { num: '10-2861078', name: '고기능성 페인트와 다층 보호 복합재를 활용한 코팅제 및 철근 콘크리트 구조물 도장 공법' },
  { num: '10-2862312', name: '콘크리트 구조물의 표면 강도 및 내구성을 증진시키는 고기능성 외벽 도장 공법' },
  { num: '10-2865278', name: '구조물 수분 차단 및 장기 방수 성능 확보를 위한 고탄성 2액형 아크릴계 고기능성 방수 기술' },
  { num: '10-2865281', name: '초저점도 아크릴계 방수 시스템을 이용한 균열 방지 및 수분 차단 성능 극대화를 위한 고성능 방수 기술' },
  { num: '10-2869493', name: '2액형 아크릴계 방수 기술을 활용한 구조물의 수분 침투 방지 및 내구성 강화 성능을 극대화하는 고효율 방수 공법' },
  { num: '10-2870421', name: '고강도 무기질 조성물 및 특수 섬유시트를 활용한 고밀도 및 고강도 바탕을 형성하는 우레탄 방수공법' },
  { num: '10-2870425', name: '자외선과 습기 침투를 차단하고 균열에 대한 내구성을 확보한 고내구성 우레탄 도장 및 방수공법' },
  { num: '10-2888024', name: '콘크리트 측벽 및 벽면의 균열 보수와 표면 접합력 향상을 위한 복합 보수 공법' },
  { num: '10-2893921', name: '탄성 및 강도 향상을 위한 복합 보수공법의 콘크리트 손상면 및 도로 경계부 적용 방법' },
  { num: '10-2896797', name: '강도 및 탄성 증진형 복합 보수기술의 콘크리트 손상부 및 도로 구조물 적용 공법' },
  { num: '10-2900226', name: '충격 및 하중 분산 성능이 강화된 유화 아스팔트 기반 도로 포장공법' },
  { num: '10-2907890', name: '고탄성·고강도 복합 보수공법을 이용한 콘크리트 탈락면 및 경계 구조물 보강 방법' },
  { num: '10-2914079', name: '균열 및 콘크리트 탈락 부위의 복합 보강을 통한 건축 구조물 표면 강화 및 크랙 보수 공법' },
  { num: '10-2917107', name: '유화 아스팔트를 활용한 충격 저항형 도로 포장 보강 공법' },
  { num: '10-2917109', name: '마모, 손상 저항성을 극대화한 유화 아스팔트 도로 포장 보강 공법' },
  { num: '10-2937091', name: '미끄럼 저항성과 도막 내구성이 향상된 MMA계 도막 조성물 및 이의 시공방법' },
];
const OUR_PATENT_NUMBERS = new Set(OUR_PATENTS.map(p => p.num));

// 타사 공법/브랜드 (공고문에서 경쟁 언급 탐지용 — 필요시 확장)
const COMPETITOR_TECHNOLOGIES = [
  '고어텍스', '고어', 'GORE-TEX', 'Gore-Tex', 'Goretex',
  '4A', '제오폴리머', 'Geopolymer',
  '엑스포', 'EXPO',
  '큐담', '엠포스',
];

// URL 인코딩 헬퍼: 한글 같은 unescaped char 포함 URL을 Playwright가 처리 가능한 형태로 변환
// decodeURI 한 번 돌려서 이미 인코딩된 경우 double-encoding 방지
function safeUrl(u) {
  if (!u) return u;
  try { return encodeURI(decodeURI(u)); } catch (_) { return u; }
}

// 브라우저 인스턴스 (요청 간 재사용)
let browserInstance = null;
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

// 인증 미들웨어
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.1.0',
    ourTechnologies: OUR_TECHNOLOGIES,
    ourPatentCount: OUR_PATENT_NUMBERS.size,
    hasAuth: AUTH_TOKEN !== 'change-me-in-production',
  });
});

// 디버그: K-APT 검색 페이지 구조 탐색
app.get('/debug/kapt-list', requireAuth, async (req, res) => {
  const { aptName, ptDate } = req.query;
  if (!aptName) return res.status(400).json({ error: 'aptName required' });
  try {
    const info = await searchKaptByAptName(aptName, ptDate, { debug: true });
    return res.json(info);
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// K-APT 공고 상세 페이지 접근 + PDF 파싱 + 우리 공법/특허 매칭
app.post('/verify', requireAuth, async (req, res) => {
  const { bidNum, siteName, assignee, ptDate, by, dataGoKrKey } = req.body || {};

  // bidNum 없으면 단지명으로 data.go.kr 검색 → bidNum 후보 찾기
  if (!bidNum) {
    if (!siteName) return res.status(400).json({ error: 'bidNum or siteName required' });
    if (!dataGoKrKey) return res.status(400).json({ error: 'dataGoKrKey required when bidNum missing' });
    return handleBySiteName({ siteName, assignee, ptDate, by, dataGoKrKey }, res);
  }

  const startedAt = Date.now();
  let context = null;

  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      extraHTTPHeaders: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      ignoreHTTPSErrors: true, // kg2b.co.kr 등 cert hostname 불일치 도메인 우회
    });
    const page = await context.newPage();

    // 1단계: 메인 페이지 방문 (세션 쿠키 확보)
    await page.goto('https://www.k-apt.go.kr/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);

    // 2단계: 공고 상세 페이지
    const detailUrl = `https://www.k-apt.go.kr/bid/bidDetail.do?bidNum=${encodeURIComponent(bidNum)}`;
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000); // JS 렌더링 + AJAX 대기

    // 페이지 전체 텍스트
    const pageText = await page.evaluate(() => document.body?.innerText || '');

    // PDF/HWP 첨부파일 링크 추출
    const attachments = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a')];
      return links
        .map(a => ({
          href: a.href,
          text: (a.innerText || '').trim(),
          onclick: a.getAttribute('onclick'),
        }))
        .filter(l =>
          /\.(pdf|hwp|doc|docx)/i.test(l.href) ||
          /\.(pdf|hwp|doc|docx)/i.test(l.text) ||
          /fileDown|downLoad|attachFile/i.test(l.onclick || '')
        );
    });

    let combinedText = pageText;
    const attachResults = [];

    // 첨부파일 다운로드 + 파싱 (PDF/HWP/HWPX 지원, 세션 쿠키 공유)
    for (const att of attachments.slice(0, 10)) {
      const isPdf = /\.pdf(\?|$)/i.test(att.href) || /\.pdf\b/i.test(att.text);
      const isHwp = /\.(hwp|hwpx)(\?|$)/i.test(att.href) || /\.(hwp|hwpx)\b/i.test(att.text);
      if (!isPdf && !isHwp) {
        attachResults.push({ href: att.href, text: att.text, skipped: 'non-pdf-hwp' });
        continue;
      }
      try {
        const buffer = await page.request.get(safeUrl(att.href), { timeout: 30000 }).then(r => r.body());
        let data;
        if (isHwp) {
          data = await parseHwpBuffer(buffer);
          combinedText += '\n\n[HWP: ' + att.text + ']\n' + (data.text || '').slice(0, 30000);
        } else {
          data = await pdf(buffer);
          combinedText += '\n\n[PDF: ' + att.text + ']\n' + (data.text || '').slice(0, 30000);
        }
        const pdfText = (data.text || '').slice(0, 30000);
        attachResults.push({ href: att.href, text: att.text, pdfLength: pdfText.length });
      } catch (e) {
        attachResults.push({ href: att.href, text: att.text, error: e.message });
      }
    }

    // 우리 공법/특허 매칭
    let matched = findOurInText(combinedText);
    let kg2bFollowed = false;
    let kg2bInfo = null;

    // === kg2b follow: K-APT에서 매칭 실패 시 kg2b 공고서 PDF 직접 파싱 ===
    if (!matched) {
      try {
        // 0) bidNum이 kg2b_ prefix면 직접 URL 조합 (가장 확실한 경로)
        let externalUrl = null;
        const kg2bPrefix = String(bidNum).match(/^kg2b_(\d+)$/i);
        if (kg2bPrefix) {
          externalUrl = `https://www.kg2b.co.kr/user/bid_list/KaptBidView?bidcode=${kg2bPrefix[1]}`;
        }
        // 1) prefix 아니면 K-APT 페이지에서 링크/버튼/onclick/HTML 전역 탐색
        if (!externalUrl) externalUrl = await page.evaluate(() => {
          // 1) <a href="kg2b...">
          const aTags = [...document.querySelectorAll('a')];
          let found = aTags.find(a => /kg2b\.co\.kr/i.test(a.href || ''));
          if (found) return found.href;
          // 2) <a> 또는 <button> 텍스트가 "해당 공고 가기"
          const allClickable = [...document.querySelectorAll('a,button,span,div')];
          const btn = allClickable.find(el => ((el.innerText || '').trim().replace(/\s+/g, ' ')).includes('해당 공고 가기'));
          if (btn) {
            // 2a) 같은 element onclick 에서 kg2b URL 추출
            const oc = btn.getAttribute('onclick') || '';
            const m = oc.match(/https?:\/\/(?:www\.)?kg2b\.co\.kr[^'"\s)]+/i);
            if (m) return m[0];
            // 2b) href 가 있으면 (a 태그)
            if (btn.href && /kg2b\.co\.kr/i.test(btn.href)) return btn.href;
            // 2c) parent anchor 탐색
            const parentA = btn.closest?.('a');
            if (parentA?.href && /kg2b\.co\.kr/i.test(parentA.href)) return parentA.href;
          }
          // 3) 페이지 전체 HTML에서 kg2b URL 또는 KaptBidView?bidcode= 패턴 찾기
          const html = document.documentElement.outerHTML;
          const urlMatch = html.match(/https?:\/\/(?:www\.)?kg2b\.co\.kr\/[^'"\s)>]+/i) ||
                           html.match(/kg2b\.co\.kr\/user\/bid_list\/KaptBidView\?bidcode=\d+/i);
          if (urlMatch) {
            const u = urlMatch[0];
            return u.startsWith('http') ? u : ('https://www.' + u);
          }
          // 4) bidcode 값만 있으면 조합해서 kg2b URL 생성
          const bidcodeMatch = html.match(/bidcode[=:]\s*["']?(\d+)/i) || html.match(/kg2b_(\d+)/i);
          if (bidcodeMatch) return `https://www.kg2b.co.kr/user/bid_list/KaptBidView?bidcode=${bidcodeMatch[1]}`;
          return null;
        });
        if (externalUrl && /kg2b\.co\.kr/i.test(externalUrl)) {
          kg2bFollowed = true;
          // networkidle 까지 대기 (AJAX/lazy-load 완료)
          await page.goto(externalUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
            // networkidle 타임아웃이면 domcontentloaded 로 fallback
            await page.goto(externalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          });
          await page.waitForTimeout(3000);
          // 스크롤로 추가 콘텐츠 로드 유도
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
          await page.waitForTimeout(2000);
          // kg2b 페이지 전체 텍스트
          const kg2bPageText = await page.evaluate(() => document.body?.innerText || '');
          combinedText += '\n\n[kg2b page]\n' + kg2bPageText;
          // 공고서 PDF/HWP/DOC 링크 강화 탐색 (<a>, <button>, onclick, HTML 전역)
          const pdfLinks = await page.evaluate(() => {
            const out = [];
            // 1) <a> 태그
            for (const a of document.querySelectorAll('a')) {
              const href = a.href || '';
              const text = (a.innerText || '').trim();
              const onclick = a.getAttribute('onclick') || '';
              if (/\.(pdf|hwp|hwpx)($|\?)/i.test(href) ||
                  /\.(pdf|hwp|hwpx)(\s|$)/i.test(text) ||
                  /fileDown|fileView|downLoad|attachFile|getFile/i.test(href + ' ' + onclick)) {
                out.push({ href, text, kind: 'a' });
              }
            }
            // 2) <button>/<span> with onclick (다운로드 버튼)
            for (const b of document.querySelectorAll('button, span[onclick], div[onclick]')) {
              const onclick = b.getAttribute('onclick') || '';
              const text = (b.innerText || '').trim();
              if (/fileDown|fileView|downLoad|\.pdf|\.hwp/i.test(onclick) ||
                  /\.(pdf|hwp|hwpx)/i.test(text)) {
                // onclick 안에서 실제 URL/파일ID 추출
                const urlMatch = onclick.match(/https?:\/\/[^'"\s)]+/i);
                const idMatch = onclick.match(/['"](\d+)['"]|fileId=(\d+)|fileSeq=(\d+)/);
                out.push({ href: urlMatch ? urlMatch[0] : '', text, onclick, fileId: (idMatch && (idMatch[1]||idMatch[2]||idMatch[3])) || '', kind: 'btn' });
              }
            }
            // 3) 전체 HTML에서 .pdf/.hwp URL 정규식 스캔
            const html = document.documentElement.outerHTML;
            const urlMatches = [...html.matchAll(/https?:\/\/[^'"\s<>]+\.(?:pdf|hwp|hwpx)/gi)];
            for (const m of urlMatches) out.push({ href: m[0], text: '(html-scan)', kind: 'html' });
            return out;
          });
          // 공고원문이 JunjabidView 같은 별도 페이지 링크인 경우 1단계 더 follow
          if (pdfLinks.length === 0) {
            const junjaUrl = await page.evaluate(() => {
              const anchors = [...document.querySelectorAll('a')];
              const m = anchors.find(a => /JunjabidView|junjabidView|공고원문/i.test((a.href || '') + ' ' + (a.innerText || '')));
              if (m && m.href && !m.href.endsWith('#')) return m.href;
              // 버튼 onclick
              const btns = [...document.querySelectorAll('button, a, span')];
              const b = btns.find(el => /공고원문/.test(el.innerText || ''));
              if (b) {
                const oc = b.getAttribute('onclick') || '';
                const m2 = oc.match(/['"]([^'"\s)]+JunjabidView[^'"\s)]+)['"]/i);
                if (m2) return new URL(m2[1], location.href).href;
              }
              return null;
            }).catch(() => null);
            if (junjaUrl) {
              try {
                await page.goto(junjaUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
                  await page.goto(junjaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                });
                await page.waitForTimeout(3000);
                const junjaText = await page.evaluate(() => document.body?.innerText || '');
                combinedText += '\n\n[kg2b JunjabidView]\n' + junjaText;
                // PDF 재탐색 (JunjabidView 페이지에서)
                const junjaLinks = await page.evaluate(() => {
                  const out = [];
                  for (const a of document.querySelectorAll('a')) {
                    const href = a.href || '', text = (a.innerText || '').trim(), onclick = a.getAttribute('onclick') || '';
                    if (/\.(pdf|hwp|hwpx)($|\?)/i.test(href) || /\.(pdf|hwp|hwpx)/i.test(text) || /fileDown|fileView|downLoad|attachFile|getFile|board/i.test(href + ' ' + onclick)) {
                      out.push({ href, text, kind: 'a' });
                    }
                  }
                  for (const b of document.querySelectorAll('button, span[onclick], div[onclick]')) {
                    const onclick = b.getAttribute('onclick') || '', text = (b.innerText || '').trim();
                    if (/fileDown|fileView|downLoad|\.pdf|\.hwp/i.test(onclick) || /\.(pdf|hwp|hwpx)/i.test(text)) {
                      const urlMatch = onclick.match(/https?:\/\/[^'"\s)]+/i);
                      const idMatch = onclick.match(/['"](\d+)['"]|fileId=(\d+)|fileSeq=(\d+)/);
                      out.push({ href: urlMatch ? urlMatch[0] : '', text, onclick, fileId: (idMatch && (idMatch[1]||idMatch[2]||idMatch[3])) || '', kind: 'btn' });
                    }
                  }
                  const html = document.documentElement.outerHTML;
                  for (const m of html.matchAll(/https?:\/\/[^'"\s<>]+\.(?:pdf|hwp|hwpx)/gi)) out.push({ href: m[0], text: '(html-scan)', kind: 'html' });
                  return out;
                });
                pdfLinks.push(...junjaLinks);
                kg2bInfo = { ...kg2bInfo || {}, junjaUrl, junjaLinksCount: junjaLinks.length };
              } catch (e) {
                kg2bInfo = { url: externalUrl, junjaUrl, junjaError: e.message };
              }
            }
          }
          // 우선순위: 공고서/공고문/입찰공고 텍스트 있는 것 → 나머지 → 비어있어도 첫번째
          const pref = pdfLinks.find(l => /공고서|공고문|입찰공고/.test(l.text)) || pdfLinks.find(l => /\.pdf/i.test(l.href)) || pdfLinks[0];
          if (pref && pref.href) {
            try {
              const buffer = await page.request.get(safeUrl(pref.href), { timeout: 30000 }).then(r => r.body());
              // HWP/HWPX면 LibreOffice로 변환, 아니면 PDF 파싱
              const isHwp = /\.(hwp|hwpx)(\?|$)/i.test(pref.href) || /\.(hwp|hwpx)\b/i.test(pref.text);
              const data = isHwp ? await parseHwpBuffer(buffer) : await pdf(buffer);
              const docText = (data.text || '').slice(0, 50000);
              combinedText += '\n\n[kg2b 공고서 ' + (isHwp ? 'HWP' : 'PDF') + ': ' + pref.text + ']\n' + docText;
              kg2bInfo = { url: externalUrl, pdfHref: pref.href, pdfText: pref.text, pdfLength: docText.length, fileType: isHwp ? 'hwp' : 'pdf', totalLinks: pdfLinks.length };
            } catch (e) {
              kg2bInfo = { url: externalUrl, pdfError: e.message, candidateHref: pref.href, totalLinks: pdfLinks.length };
            }
          } else {
            // 디버그: 페이지에 <iframe> 이 있으면 그 src 확인
            const iframes = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(f => f.src).filter(Boolean)).catch(() => []);
            // 디버그: 전체 href 개수 + 특징적인 키워드 등장 위치
            const hrefStats = await page.evaluate(() => {
              const allA = [...document.querySelectorAll('a')];
              const all = allA.map(a => ({ href: a.href, text: (a.innerText || '').trim().slice(0, 50) }));
              const pdfMentioned = document.body.innerText.includes('.pdf');
              const 공고서Idx = document.body.innerText.indexOf('공고서');
              const 공고원문Idx = document.body.innerText.indexOf('공고원문');
              return { totalAnchors: allA.length, pdfMentioned, 공고서Idx, 공고원문Idx, firstLinks: all.slice(0, 10) };
            }).catch(() => null);
            kg2bInfo = { url: externalUrl, pdfError: 'no_pdf_link_found', totalLinks: pdfLinks.length, linkSamples: pdfLinks.slice(0, 5), pageTextPreview: kg2bPageText.slice(0, 800), iframes, hrefStats };
          }
          // kg2b 컨텐츠 포함해서 재매칭
          matched = findOurInText(combinedText);
        }
      } catch (e) {
        kg2bInfo = { error: e.message };
      }
    }

    const duration = Date.now() - startedAt;
    await context.close();

    // 타사 언급 + 우리 특허 전체 리스트 수집 (검증완료 여부 무관)
    const competitor = findCompetitorInText(combinedText);
    const ourPatents = findAllOurPatentsInText(combinedText);

    if (matched) {
      return res.json({
        status: 'verified',
        isOurAnnouncement: true,
        matchedBy: matched.type,
        matchedValue: matched.value,
        patentName: matched.patentName,
        ourPatents,
        competitorPatents: competitor.patents,
        competitorTechs: competitor.techs,
        bidNum,
        pageTextLength: pageText.length,
        attachmentCount: attachResults.length,
        kg2bFollowed,
        kg2bInfo,
        source: kg2bFollowed ? 'kapt_with_kg2b_follow' : 'kapt_bid_detail',
        durationMs: duration,
        message: matched.type === 'patent'
          ? `공고에서 우리 특허 [${matched.value}] 확인됨${kg2bFollowed ? ' (kg2b 공고서 경유)' : ''}`
          : `공고에서 우리 공법 [${matched.value}] 확인됨${kg2bFollowed ? ' (kg2b 공고서 경유)' : ''}`,
      });
    }

    return res.json({
      status: 'needs_review',
      reason: 'no_our_tech_in_announcement',
      bidNum,
      pageTextLength: pageText.length,
      attachmentCount: attachResults.length,
      attachments: attachResults,
      kg2bFollowed,
      kg2bInfo,
      durationMs: duration,
      pageTextPreview: pageText.slice(0, 500),
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === 잔디 Playwright 로그인 테스트 엔드포인트 ===
// 사용: POST /admin/jandi-login-test
// 환경변수 필요: JANDI_EMAIL, JANDI_PASSWORD, JANDI_TEAM
// 로그인 성공 시 페이지 title, URL 반환
app.post('/admin/jandi-login-test', requireAuth, async (req, res) => {
  const email = process.env.JANDI_EMAIL;
  const password = process.env.JANDI_PASSWORD;
  const team = process.env.JANDI_TEAM;
  if (!email || !password || !team) {
    return res.status(400).json({ error: 'JANDI_EMAIL, JANDI_PASSWORD, JANDI_TEAM env vars required' });
  }
  const startedAt = Date.now();
  let context = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    // 1) 로그인 페이지 직접 접근 (/login/ko) - jandi.com 공식 로그인 페이지
    await page.goto('https://www.jandi.com/login/ko', { waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
      await page.goto('https://www.jandi.com/login/ko', { waitUntil: 'domcontentloaded', timeout: 30000 });
    });
    await page.waitForTimeout(3000); // SPA 렌더 대기
    const beforeUrl = page.url();
    // 로그인 폼 감지 대기 (최대 10초)
    try {
      await page.waitForSelector('input[type="email"], input[type="password"], input[name="email"], input[name="password"]', { timeout: 10000 });
    } catch (_) {}
    // 2) 로그인 폼 탐지 및 입력
    const loginResult = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const emailInput = inputs.find(el =>
        el.type === 'email' ||
        el.name === 'email' ||
        el.id === 'email' ||
        /email|이메일/i.test(el.placeholder || '')
      );
      const passInput = inputs.find(el =>
        el.type === 'password' ||
        el.name === 'password' ||
        /password|비밀번호/i.test(el.placeholder || '')
      );
      return {
        hasEmailInput: !!emailInput,
        hasPassInput: !!passInput,
        totalInputs: inputs.length,
        inputTypes: inputs.map(i => ({ type: i.type, name: i.name, id: i.id, placeholder: (i.placeholder || '').slice(0, 30) })),
      };
    });
    if (!loginResult.hasEmailInput || !loginResult.hasPassInput) {
      // 로그인 페이지 form이 없으면 이미 로그인돼있을 가능성 OR 다른 페이지 구조
      const title = await page.title();
      const pageText = (await page.evaluate(() => document.body?.innerText || '')).slice(0, 500);
      // 추가 디버그: 모든 버튼/링크 + HTML 스니펫
      const debug = await page.evaluate(() => {
        return {
          links: [...document.querySelectorAll('a')].slice(0, 20).map(a => ({ text: (a.innerText || '').trim().slice(0, 40), href: (a.href || '').slice(0, 100) })).filter(l => l.text),
          buttons: [...document.querySelectorAll('button')].slice(0, 20).map(b => ({ text: (b.innerText || '').trim().slice(0, 40), onclick: (b.getAttribute('onclick') || '').slice(0, 80) })).filter(b => b.text),
          iframes: [...document.querySelectorAll('iframe')].map(f => f.src),
          htmlSnippet: document.body?.innerHTML?.slice(0, 2000) || '',
        };
      });
      await context.close();
      return res.json({
        status: 'no_login_form',
        beforeUrl, afterUrl: page.url(), title,
        pageTextPreview: pageText,
        inputDetection: loginResult,
        debug,
        durationMs: Date.now() - startedAt,
      });
    }
    // 3) 이메일·비밀번호 입력 + 로그인 버튼 클릭
    await page.evaluate(({ e, p }) => {
      const inputs = [...document.querySelectorAll('input')];
      const emailInput = inputs.find(el => el.type === 'email' || el.name === 'email' || el.id === 'email' || /email|이메일/i.test(el.placeholder || ''));
      const passInput = inputs.find(el => el.type === 'password' || el.name === 'password' || /password|비밀번호/i.test(el.placeholder || ''));
      if (emailInput) {
        emailInput.value = e;
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (passInput) {
        passInput.value = p;
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { e: email, p: password });
    await page.waitForTimeout(500);
    // 로그인 버튼 클릭 (form submit 또는 button click)
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"], input[type="submit"], button.login-btn, button.btn-login, button[class*="login" i]')
        || [...document.querySelectorAll('button')].find(b => /log\s*in|로그인|sign\s*in/i.test(b.innerText || ''));
      if (btn) { btn.click(); return 'clicked'; }
      const form = document.querySelector('form');
      if (form) { form.submit(); return 'form-submitted'; }
      return 'no_button';
    });
    // 로그인 처리 대기
    await page.waitForTimeout(4000).catch(() => {});
    const afterUrl = page.url();
    const afterTitle = await page.title();
    const afterText = (await page.evaluate(() => document.body?.innerText || '')).slice(0, 300);
    // 로그인 성공 판단: URL이 로그인 페이지 벗어나면 성공
    const loggedIn = !/login|landing/i.test(afterUrl) && !/login|landing/i.test(beforeUrl ? '' : afterUrl);
    await context.close();
    return res.json({
      status: loggedIn ? 'logged_in' : 'login_uncertain',
      beforeUrl, afterUrl, afterTitle, afterText,
      clicked,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === 잔디 채널 스크롤 헬퍼 — 마우스 wheel 기반 (과거 메시지 lazy-load 트리거) ===
// cutoffMs 시각보다 오래된 메시지까지 로드되면 중단.
// 반환: { scrolls, finalHeight, oldestTs }
async function scrollJandiChannelToCutoff(page, cutoffMs, maxScrolls = 500) {
  const chatArea = page.locator('.cpanel._chatPanel, ._primaryPanel, .msgs-holder, .msgs-stage').first();
  let box = null;
  try { box = await chatArea.boundingBox({ timeout: 5000 }); } catch (_) {}
  if (!box) {
    const vp = page.viewportSize() || { width: 1280, height: 720 };
    box = { x: vp.width / 2, y: vp.height / 2, width: 1, height: 1 };
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);

  let scrolls = 0, stagnant = 0;
  let oldestTs = null;
  let lastHeight = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0);
  let lastMsgCount = await page.evaluate(() => document.querySelectorAll('.msg-attach, .preview-file').length).catch(() => 0);

  while (scrolls < maxScrolls) {
    // 더 큰 wheel + 랜덤 대기 (잔디 rate limit 회피)
    await page.mouse.wheel(0, -2500);
    await page.waitForTimeout(500 + Math.floor(Math.random() * 200));
    scrolls++;

    // 20회마다 "더 강력한" 스크롤 시도: Home 키 + 맨 위 요소 scrollIntoView
    if (scrolls % 20 === 0) {
      await page.keyboard.press('Home').catch(() => {});
      await page.waitForTimeout(800);
      // 맨 위 메시지에서 살짝 아래로 내렸다 다시 위로 (lazy load 재트리거)
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(300);
      await page.mouse.wheel(0, -3000);
      await page.waitForTimeout(800);
    }

    // 5회마다 상태 체크 (message 개수 + scrollHeight 동시 감시)
    if (scrolls % 5 === 0) {
      const { oldest, curH, msgCount } = await page.evaluate(() => {
        const times = [...document.querySelectorAll('time, .fn-write-time time')]
          .map(t => (t.textContent || '').trim()).filter(Boolean);
        let oldest = Infinity;
        for (const s of times) {
          const m = s.match(/(\d{4})\/(\d{2})\/(\d{2})/);
          if (m) {
            const ts = new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime();
            if (ts > 0 && ts < oldest) oldest = ts;
          }
        }
        return {
          oldest: oldest === Infinity ? null : oldest,
          curH: document.documentElement.scrollHeight,
          msgCount: document.querySelectorAll('.msg-attach, .preview-file').length,
        };
      });
      if (oldest) oldestTs = oldest;
      if (oldest && oldest <= cutoffMs) break;
      // 메시지 개수 또는 scrollHeight 중 하나라도 늘었으면 stagnant 리셋
      if (curH === lastHeight && msgCount === lastMsgCount) {
        stagnant++;
        if (stagnant >= 10) break;  // 5 × 10 = 50회 변화 없으면 정말로 끝
      } else {
        stagnant = 0;
        lastHeight = curH;
        lastMsgCount = msgCount;
      }
    }
  }
  return {
    scrolls,
    finalHeight: lastHeight,
    msgCount: lastMsgCount,
    oldestTs: oldestTs ? new Date(oldestTs).toISOString() : null,
  };
}

// === 잔디 로그인 헬퍼 (재사용) ===
// 반환: { ok, status, beforeUrl, submitUrl, finalUrl, teamUrl, hasCaptcha?, error? }
async function performJandiLogin(page, { email, password, team }) {
  const teamUrl = `https://${team}.jandi.com/`;

  // "로그인 된 상태"의 URL 판별 — 앱 경로여야 함 (/app/, /topics/, /chats/, /bots/ 등)
  // /landing/, /login/, /signin 은 로그인 페이지
  const isInApp = (url) =>
    url.includes(`${team}.jandi.com`) &&
    !/\/landing|\/login|\/signin/i.test(url);

  // 1) 팀 도메인 접근 — 로그인 상태면 앱에 머물고, 아니면 랜딩/signin으로 튕김
  await page.goto(teamUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const beforeUrl = page.url();

  if (isInApp(beforeUrl)) {
    return { ok: true, status: 'already_logged_in', beforeUrl, finalUrl: beforeUrl, teamUrl };
  }

  // 2) signin 페이지로 명시적 이동 (teamUrl로 되돌아올 redirectUrl 포함)
  const signinUrl = `https://www.jandi.com/landing/kr/signin?redirectUrl=${encodeURIComponent(teamUrl)}`;
  await page.goto(signinUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // 로그인 폼 감지
  try {
    await page.waitForSelector('input[type="email"], input[name="email"], input[type="password"]', { timeout: 12000 });
  } catch (_) {
    return { ok: false, status: 'no_form', beforeUrl, finalUrl: page.url() };
  }

  // 사전체크 — 정보용 (abort 안 함, 끝까지 시도해보고 결과로 판단)
  const preCheck = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    return {
      hasRecaptcha: !!document.querySelector('iframe[src*="recaptcha"]'),
      has2FA: /verification code|인증 코드|otp|2단계 인증/i.test(text),
      pageTitle: document.title,
    };
  });

  // 입력
  const emailEl = await page.$('input[type="email"], input[name="email"], input#email');
  const passEl = await page.$('input[type="password"], input[name="password"]');
  if (!emailEl || !passEl) {
    return { ok: false, status: 'no_form', beforeUrl, finalUrl: page.url(), preCheck };
  }
  await emailEl.fill(email);
  await passEl.fill(password);
  await page.waitForTimeout(400);

  // 제출
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"], input[type="submit"]')
      || [...document.querySelectorAll('button')].find(b => /로그인|log\s*in|sign\s*in/i.test(b.innerText || ''));
    if (btn) { btn.click(); return 'button'; }
    const form = document.querySelector('form');
    if (form) { form.submit(); return 'form'; }
    return null;
  });
  if (!clicked) return { ok: false, status: 'no_submit_button', beforeUrl, finalUrl: page.url() };

  // 제출 후 — URL 바뀌거나 사이드바 뜨거나 5초 중 빠른 거
  await Promise.race([
    page.waitForURL(url => {
      const u = url.toString();
      return u.includes(`${team}.jandi.com`) || /app\/#/.test(u);
    }, { timeout: 15000 }).catch(() => {}),
    page.waitForSelector('aside, [class*="sidebar" i], nav[class*="lnb" i]', { timeout: 15000 }).catch(() => {}),
    page.waitForSelector('.error-message, [class*="error" i], [role="alert"]', { timeout: 12000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(2500);
  const submitUrl = page.url();

  // 로그인 직후 에러 메시지 감지
  const postCheck = await page.evaluate(() => {
    const errEls = [...document.querySelectorAll('.error-message, [class*="error" i], [role="alert"], [class*="invalid" i]')];
    const errTexts = errEls.map(e => (e.innerText || '').trim()).filter(t => t && t.length < 200 && t.length > 3);
    return {
      hasErrors: errTexts.length > 0,
      errors: errTexts.slice(0, 5),
      bodyPreview: (document.body?.innerText || '').slice(0, 300),
    };
  });

  // 팀 워크스페이스로 강제 이동 — 로그인 성공했으면 /app/ 진입, 실패면 /landing/ 로 튕김
  await page.goto(teamUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const finalUrl = page.url();

  const loggedIn = isInApp(finalUrl);
  return {
    ok: loggedIn,
    status: loggedIn ? 'logged_in' : (postCheck.hasErrors ? 'login_rejected' : 'login_uncertain'),
    beforeUrl, submitUrl, finalUrl, teamUrl,
    preCheck, postCheck,
  };
}

// === 잔디 채널 목록 조회 (discovery / debug) ===
// 사용: POST /admin/jandi-channels-list
// 목적: 사이드바의 토픽/채팅 채널명·href를 덤프 → "입찰 공고(POUR공법)" 존재 확인
app.post('/admin/jandi-channels-list', requireAuth, async (req, res) => {
  const email = process.env.JANDI_EMAIL;
  const password = process.env.JANDI_PASSWORD;
  const team = process.env.JANDI_TEAM;
  if (!email || !password || !team) {
    return res.status(400).json({ error: 'JANDI_EMAIL, JANDI_PASSWORD, JANDI_TEAM env vars required' });
  }
  const startedAt = Date.now();
  let context = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    const login = await performJandiLogin(page, { email, password, team });
    if (!login.ok) {
      await context.close();
      return res.json({ status: 'login_failed', login, durationMs: Date.now() - startedAt });
    }

    // 사이드바 완전 렌더 대기 (SPA)
    await page.waitForTimeout(4000);

    // 다양한 selector 조합으로 사이드바 채널 추출
    const channels = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      const push = (name, href, source, extra = {}) => {
        name = (name || '').trim();
        if (!name || name.length > 60) return;
        const key = name + '|' + (href || '');
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ name, href: href || null, source, ...extra });
      };
      // 1) 토픽/채팅 링크
      for (const a of document.querySelectorAll('a[href*="/topics/"], a[href*="/chats/"], a[href*="/messages/"], a[href*="/dms/"]')) {
        const href = a.getAttribute('href') || a.href || '';
        const name = (a.innerText || a.textContent || '').trim();
        const kind = /topics/.test(href) ? 'topic' : /chats|messages/.test(href) ? 'chat' : 'dm';
        push(name, href, 'href-link', { kind });
      }
      // 2) data-* 속성
      for (const el of document.querySelectorAll('[data-channel-name], [data-room-name], [data-topic-name], [data-entity-name]')) {
        const name = el.getAttribute('data-channel-name') || el.getAttribute('data-room-name') || el.getAttribute('data-topic-name') || el.getAttribute('data-entity-name');
        const id = el.getAttribute('data-channel-id') || el.getAttribute('data-room-id') || el.getAttribute('data-topic-id') || el.getAttribute('data-entity-id');
        push(name, null, 'data-attr', { id });
      }
      // 3) 사이드바 영역의 li/div 텍스트 (fallback)
      const sidebarRoots = [...document.querySelectorAll('aside, [class*="sidebar" i], [class*="lnb" i], nav[class*="side" i]')];
      for (const root of sidebarRoots) {
        for (const el of root.querySelectorAll('li, div[role="button"], a, [class*="item" i]')) {
          const txt = (el.innerText || '').trim();
          if (!txt || txt.length > 60 || /\n/.test(txt)) continue;
          push(txt, null, 'sidebar-scan');
          if (out.length > 200) break;
        }
      }
      return out;
    });

    const htmlSnippet = channels.length === 0
      ? await page.evaluate(() => document.body?.innerHTML?.slice(0, 5000) || '')
      : null;

    await context.close();
    return res.json({
      status: 'ok',
      login,
      channelCount: channels.length,
      channels: channels.slice(0, 100),  // 너무 많으면 잘라냄
      htmlSnippet,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === 잔디 채널 첨부파일 수집 ===
// 사용: POST /admin/jandi-channel-fetch
// body: { channelName?='입찰 공고(POUR공법)', channelHref?, monthsBack?=12, maxScrolls?=200 }
// 흐름: 로그인 → 채널 진입(href 직접 or 사이드바 클릭) → 과거까지 스크롤 → 첨부파일 메타 수집
app.post('/admin/jandi-channel-fetch', requireAuth, async (req, res) => {
  const email = process.env.JANDI_EMAIL;
  const password = process.env.JANDI_PASSWORD;
  const team = process.env.JANDI_TEAM;
  if (!email || !password || !team) {
    return res.status(400).json({ error: 'JANDI_EMAIL, JANDI_PASSWORD, JANDI_TEAM env vars required' });
  }
  const {
    channelName = '입찰 공고(POUR공법)',
    channelHref,
    monthsBack = 12,
    maxScrolls = 300,
  } = req.body || {};
  const cutoff = new Date(Date.now() - monthsBack * 30 * 86400 * 1000);
  const startedAt = Date.now();
  let context = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
    });
    const page = await context.newPage();

    const login = await performJandiLogin(page, { email, password, team });
    if (!login.ok) {
      await context.close();
      return res.json({ status: 'login_failed', login, durationMs: Date.now() - startedAt });
    }
    await page.waitForTimeout(3500);  // 사이드바 렌더 대기

    // === 채널 진입 ===
    let entryDebug = {};
    let entered = false;
    if (channelHref) {
      const fullUrl = channelHref.startsWith('http')
        ? channelHref
        : `https://${team}.jandi.com${channelHref.startsWith('/') ? '' : '/'}${channelHref}`;
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      entryDebug = { method: 'direct-href', fullUrl };
      entered = true;
    } else {
      // 사이드바에서 lnb-list-item 중 채널명 매칭 → Playwright native click (AngularJS ng-click 트리거)
      const itemLocator = page.locator('.lnb-list-item').filter({ hasText: channelName });
      const itemCount = await itemLocator.count();
      entryDebug = { method: 'sidebar-native-click', channelName, candidateCount: itemCount };
      if (itemCount === 0) {
        // 폴백 — 모든 텍스트로 검색
        const altLocator = page.locator(`text="${channelName}"`);
        const altCount = await altLocator.count();
        entryDebug.fallbackTextCount = altCount;
        if (altCount > 0) {
          await altLocator.first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await altLocator.first().click({ timeout: 10000, force: true }).catch(e => entryDebug.clickError = e.message);
        }
      } else {
        await itemLocator.first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await itemLocator.first().click({ timeout: 10000 }).catch(e => entryDebug.clickError = e.message);
      }

      // URL이 /#!/room/숫자 또는 /#!/topic/숫자 로 바뀔 때까지 대기 (max 15초)
      try {
        await page.waitForURL(u => /#!\/(room|topic)\/\d+/.test(u.toString()), { timeout: 15000 });
        entryDebug.urlAfterClick = page.url();
        entered = true;
      } catch (_) {
        entryDebug.urlAfterClick = page.url();
        entryDebug.urlChangeTimeout = true;
        // URL 바뀌지 않았어도 일단 진행 시도
        entered = entryDebug.urlAfterClick.includes('#!/');
      }
    }

    if (!entered) {
      await context.close();
      return res.json({
        status: 'channel_not_found',
        channelName,
        entryDebug,
        hint: 'POST /admin/jandi-channels-list 로 사이드바 채널명 확인 후 channelHref 를 직접 넘길 것',
        durationMs: Date.now() - startedAt,
      });
    }

    // === 메시지 영역 안정화 + 과거 메시지 로드 위해 스크롤 업 ===
    await page.waitForSelector('[class*="message" i], [class*="msg" i], main, [role="main"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);  // 잔디는 SPA — 채널 클릭 후 메시지 로드까지 시간 필요

    // === DOM 진단 (셀렉터 정확도 확인) ===
    const domDiag = await page.evaluate(() => {
      const sample = (sel, n = 3) => {
        const els = [...document.querySelectorAll(sel)];
        return {
          count: els.length,
          samples: els.slice(0, n).map(el => ({
            tag: el.tagName,
            className: (el.className || '').toString().slice(0, 100),
            text: (el.innerText || '').trim().slice(0, 80),
          })),
        };
      };
      const allClassNames = new Set();
      for (const el of document.querySelectorAll('*')) {
        const c = (el.className || '').toString();
        if (c) c.split(/\s+/).forEach(x => x && allClassNames.add(x));
      }
      const classKeywords = ['message', 'msg', 'file', 'attach', 'card', 'chat', 'room'];
      const matchedClasses = [...allClassNames].filter(c =>
        classKeywords.some(k => c.toLowerCase().includes(k))
      ).slice(0, 50);
      return {
        url: location.href,
        title: document.title,
        bodyTextLen: document.body?.innerText?.length || 0,
        bodyPreview: (document.body?.innerText || '').slice(0, 500),
        anchorCount: document.querySelectorAll('a').length,
        iframeCount: document.querySelectorAll('iframe').length,
        timeElCount: document.querySelectorAll('time, [datetime]').length,
        msgClassMatches: sample('[class*="message" i]', 5),
        msgItemMatches: sample('[class*="msg" i]', 5),
        fileClassMatches: sample('[class*="file" i]', 5),
        attachClassMatches: sample('[class*="attach" i]', 5),
        scrollContainers: sample('[class*="scroll" i]', 5),
        relevantClassNames: matchedClasses,
      };
    });

    const scrollResult = await scrollJandiChannelToCutoff(page, cutoff.getTime(), maxScrolls);

    // === 첨부파일 추출 — .msg-attach 안에서 확장자 매칭 leaf 엘리먼트 전부 ===
    const fileExtractResult = await page.evaluate(() => {
      const exts = /\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)/i;
      const extsEnd = /\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)$/i;
      const out = [];
      const seen = new Set();

      const findFileId = (el) => {
        if (!el) return null;
        const attrs = ['data-file-id', 'data-id', 'data-attach-id', 'data-message-id', 'message-id', 'file-id'];
        for (const a of attrs) { const v = el.getAttribute?.(a); if (v) return v; }
        for (const child of el.querySelectorAll?.('[data-file-id], [data-id], [message-id], [data-attach-id]') || []) {
          for (const a of attrs) { const v = child.getAttribute?.(a); if (v) return v; }
        }
        for (const x of [el, ...el.querySelectorAll?.('a, button, [ng-click]') || []]) {
          const oc = (x.getAttribute?.('ng-click') || '') + ' ' + (x.getAttribute?.('onclick') || '');
          const m = oc.match(/['"](\d{6,})['"]/) || oc.match(/file[Ii]d[\s:=]+['"]?(\d+)/);
          if (m) return m[1];
        }
        return null;
      };
      const findHref = (el) => {
        for (const a of el.querySelectorAll?.('a') || []) {
          const h = a.href || '';
          if (h && !h.endsWith('#') && !/javascript:/i.test(h)) return h;
        }
        return '';
      };

      // 가까운 시간/작성자 찾는 헬퍼
      const getMsgContext = (el) => {
        let ancestor = el;
        for (let i = 0; i < 15 && ancestor; i++) {
          if (/(msg-attach|message|_messageBubbleTarget|msgs-stage)/.test((ancestor.className || '').toString())) {
            const timeEl = ancestor.querySelector('time, .fn-write-time');
            const profileEl = ancestor.querySelector('._profileName, .fn-user-name, .member-name');
            return {
              ts: timeEl ? (timeEl.textContent || '').trim() : null,
              uploader: profileEl ? (profileEl.innerText || '').trim() : null,
            };
          }
          ancestor = ancestor.parentElement;
        }
        return { ts: null, uploader: null };
      };

      const messageBlocks = [...document.querySelectorAll('.msg-attach')];

      // 잔디는 각 파일을 .preview-file [file-id="X"] [selected-attachment="{JSON}"] 구조로 렌더
      // selected-attachment JSON 안에 fileUrl, filename(storage hash), title(원본), size, ext 모두 있음
      const previewFiles = [...document.querySelectorAll('.preview-file[file-id], [chat-viewer-for-viewer-origin-file-id]')];
      let leafCheckTotal = previewFiles.length, leafCheckMatched = 0;

      for (const el of previewFiles) {
        const fileId = el.getAttribute('file-id') || el.getAttribute('chat-viewer-for-viewer-origin-file-id');
        if (!fileId || seen.has(fileId)) continue;
        seen.add(fileId);

        let attachJson = null;
        const rawJson = el.getAttribute('selected-attachment');
        if (rawJson) {
          try { attachJson = JSON.parse(rawJson); } catch (_) {}
        }

        const content = attachJson?.content || {};
        const filename = content.title || content.name || (el.querySelector('.info-title')?.innerText || '').trim();
        const fileUrl = content.fileUrl || null;
        const storageName = content.filename || null; // 잔디 storage hash
        const ext = content.ext || (filename.match(/\.([a-z0-9]+)$/i) || [])[1] || null;
        const size = content.size || null;
        const mimeType = content.type || null;

        if (!filename || !extsEnd.test(filename)) continue;
        leafCheckMatched++;

        const ctx = getMsgContext(el);
        out.push({
          filename,
          fileId,
          fileUrl,
          storageName,
          ext,
          size,
          mimeType,
          uploader: ctx.uploader,
          ts: ctx.ts,
        });
      }

      // 첫 .preview-file outerHTML (디버그용)
      const fileSampleHTML = previewFiles[0] ? previewFiles[0].outerHTML.slice(0, 4000) : null;

      return {
        files: out,
        msgAttachCount: messageBlocks.length,
        leafCheckTotal,
        leafCheckMatched,
        fileSampleHTML,
      };
    });
    const files = fileExtractResult.files;

    const pageUrl = page.url();
    await context.close();

    // 파일명 파싱 summary (순번 범위 등)
    const seqs = files
      .map(f => (f.filename.match(/^(\d+)_/) || [])[1])
      .filter(Boolean)
      .map(s => parseInt(s, 10));
    const seqSummary = seqs.length
      ? { min: Math.min(...seqs), max: Math.max(...seqs), count: seqs.length }
      : null;

    return res.json({
      status: 'ok',
      channelName,
      entryDebug,
      monthsBack,
      cutoff: cutoff.toISOString(),
      scrollResult,
      fileCount: files.length,
      seqSummary,
      msgAttachCount: fileExtractResult.msgAttachCount,
      leafCheckTotal: fileExtractResult.leafCheckTotal,
      leafCheckMatched: fileExtractResult.leafCheckMatched,
      fileSampleHTML: fileExtractResult.fileSampleHTML,
      files,
      pageUrl,
      domDiag,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === 잔디 채널 파일 일괄 다운로드 + Firebase Storage 업로드 (Phase 3b) ===
// 사용: POST /admin/jandi-channel-sync
// body: { channelName?='입찰 공고(POUR공법)', monthsBack?=12, maxFiles?=100, forceReupload?=false }
// 흐름:
//   1. 로그인 + 채널 진입 + 스크롤 → 파일 메타 수집
//   2. 각 파일: RTDB evidence/{fileId} 이미 있으면 skip (forceReupload 제외)
//   3. i1.jandi.com downloadUrl API → CloudFront signed URL 다운로드
//   4. Firebase Storage evidence/jandi/{teamId}/{fileId}_{filename} 업로드
//   5. RTDB evidence/{fileId} 메타 기록
//   6. 요약 반환
app.post('/admin/jandi-channel-sync', requireAuth, async (req, res) => {
  const email = process.env.JANDI_EMAIL;
  const password = process.env.JANDI_PASSWORD;
  const team = process.env.JANDI_TEAM;
  if (!email || !password || !team) {
    return res.status(400).json({ error: 'JANDI_EMAIL, JANDI_PASSWORD, JANDI_TEAM env vars required' });
  }
  const {
    channelName = '입찰 공고(POUR공법)',
    monthsBack = 12,
    maxFiles = 100,
    maxScrolls = 400,
    forceReupload = false,
  } = req.body || {};
  const cutoff = new Date(Date.now() - monthsBack * 30 * 86400 * 1000);
  const startedAt = Date.now();
  let context = null;

  try {
    // Firebase Admin 초기화
    const fb = await getFirebaseAdmin();
    const bucket = admin.storage().bucket();
    const db = admin.database();

    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
    });
    const page = await context.newPage();

    // 1) 로그인
    const login = await performJandiLogin(page, { email, password, team });
    if (!login.ok) {
      await context.close();
      return res.json({ status: 'login_failed', login });
    }
    await page.waitForTimeout(3000);

    // 2) 채널 진입
    const itemLocator = page.locator('.lnb-list-item').filter({ hasText: channelName });
    const itemCount = await itemLocator.count();
    if (itemCount === 0) {
      await context.close();
      return res.json({ status: 'channel_not_found', channelName });
    }
    await itemLocator.first().click({ timeout: 10000 });
    try {
      await page.waitForURL(u => /#!\/room\/\d+/.test(u.toString()), { timeout: 15000 });
    } catch (_) {}
    await page.waitForTimeout(5000);

    // 3) 과거 메시지 스크롤 (헬퍼 사용)
    const scrollRes = await scrollJandiChannelToCutoff(page, cutoff.getTime(), maxScrolls);
    console.log('[channel-sync] scroll:', scrollRes);

    // 4) 파일 메타 추출 (preview-file selected-attachment JSON)
    const files = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('.preview-file[file-id]')) {
        const fileId = el.getAttribute('file-id');
        if (!fileId || seen.has(fileId)) continue;
        seen.add(fileId);
        let att = null;
        try { att = JSON.parse(el.getAttribute('selected-attachment') || '{}'); } catch (_) {}
        const c = att?.content || {};
        if (!c.title) continue;
        out.push({
          fileId,
          filename: c.title,
          ext: c.ext,
          size: c.size,
          mimeType: c.type,
          storageName: c.filename,
          originalFileUrl: c.fileUrl,
        });
      }
      return out;
    });

    // teamId 추출 — 첫 fileUrl 에서
    let teamId = null;
    for (const f of files) {
      const m = (f.originalFileUrl || '').match(/files-private\/(\d+)\//);
      if (m) { teamId = m[1]; break; }
    }
    if (!teamId) teamId = process.env.JANDI_TEAM_ID || '26098605';

    // JWT
    const cookies = await context.cookies();
    const jwt = cookies.find(c => c.name === '_jd_.access_token')?.value;
    if (!jwt) {
      await context.close();
      return res.json({ status: 'error', error: 'no_jwt_cookie' });
    }

    // 5) 각 파일 처리
    const results = { uploaded: [], skipped: [], failed: [] };
    const filesToProcess = files.slice(0, maxFiles);

    for (const f of filesToProcess) {
      try {
        // 이미 RTDB에 있으면 skip
        if (!forceReupload) {
          const snap = await db.ref(`evidence/${f.fileId}`).once('value');
          if (snap.exists()) {
            results.skipped.push({ fileId: f.fileId, filename: f.filename, reason: 'already_synced' });
            continue;
          }
        }

        // downloadUrl API
        const apiUrl = `https://i1.jandi.com/file-api/v1/teams/${teamId}/files/${f.fileId}/downloadUrl?fileId=${f.fileId}`;
        const r1 = await context.request.get(apiUrl, {
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'Referer': `https://${team}.jandi.com/`,
            'Accept': 'application/vnd.tosslab.jandi-v1+json',
          },
          timeout: 15000,
        });
        if (!r1.ok()) {
          results.failed.push({ fileId: f.fileId, filename: f.filename, step: 'api_downloadUrl', status: r1.status() });
          continue;
        }
        const apiJson = await r1.json();
        const signedUrl = apiJson?.downloadUrl;
        if (!signedUrl) {
          results.failed.push({ fileId: f.fileId, filename: f.filename, step: 'no_signed_url' });
          continue;
        }

        // 실제 다운로드
        const r2 = await context.request.get(signedUrl, { timeout: 60000 });
        if (!r2.ok()) {
          results.failed.push({ fileId: f.fileId, filename: f.filename, step: 'cloudfront', status: r2.status() });
          continue;
        }
        const buf = await r2.body();
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

        // Firebase Storage 업로드
        const safeFilename = f.filename.replace(/[^\w.\-가-힣()]/g, '_').slice(0, 100);
        const storagePath = `evidence/jandi/${teamId}/${f.fileId}_${safeFilename}`;
        const file = bucket.file(storagePath);
        await file.save(buf, {
          metadata: {
            contentType: f.mimeType || 'application/octet-stream',
            metadata: {
              fileId: f.fileId,
              sha256,
              originalFilename: f.filename,
              sourceChannel: channelName,
              syncedAt: new Date().toISOString(),
            },
          },
          resumable: false,
        });
        // 공개 URL 대신 signed read URL 생성 (기본 7일, 필요시 갱신)
        const [signedReadUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        // RTDB 메타 기록 — undefined 필드 null 로 치환
        const parsed = parseFilenameLocal(f.filename);
        await db.ref(`evidence/${f.fileId}`).set({
          fileId: f.fileId,
          filename: f.filename || null,
          parsedSeq: parsed.seq == null ? null : parsed.seq,
          parsedSiteName: parsed.siteName || null,
          parsedMethod: parsed.method || null,
          parsedMethodPrefix: parsed.methodPrefix || null,
          ext: f.ext || null,
          size: f.size == null ? null : f.size,
          mimeType: f.mimeType || null,
          sha256,
          teamId: teamId || null,
          channelName: channelName || null,
          storagePath,
          storageBucket: bucket.name,
          signedReadUrl,
          signedReadUrlExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          syncedAt: new Date().toISOString(),
          ptMatchStatus: 'pending',
        });

        results.uploaded.push({
          fileId: f.fileId,
          filename: f.filename,
          size: buf.length,
          sha256: sha256.slice(0, 16),
          storagePath,
        });
      } catch (e) {
        results.failed.push({ fileId: f.fileId, filename: f.filename, error: e.message });
      }
    }

    await context.close();
    return res.json({
      status: 'ok',
      channelName,
      teamId,
      totalFilesFound: files.length,
      processed: filesToProcess.length,
      uploaded: results.uploaded.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
      results,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// 파일명 파서 (server 내부용 — src/utils/jandiFileParser.js 와 동일 로직)
const JANDI_METHOD_PREFIXES = [
  'POUR공법', 'CNC공법', 'DO공법', 'DETEX공법',
  'POUR솔루션', 'POUR시스템',
  'POUR', 'CNC', 'DO', 'DETEX', '시멘트분말',
];
function parseFilenameLocal(filename) {
  const extMatch = (filename || '').match(/\.([a-z0-9]+)$/i);
  if (!extMatch) return { seq: null, siteName: '', method: '', methodPrefix: '' };
  const base = filename.slice(0, -extMatch[0].length);
  const m = base.match(/^(?:(\d+)_)?(.+?)(?:\(([^)]+)\))?\s*$/);
  if (!m) return { seq: null, siteName: '', method: '', methodPrefix: '' };
  let rest = (m[2] || '').trim();
  let methodPrefix = '';
  for (const p of JANDI_METHOD_PREFIXES) {
    if (rest.startsWith(p + '_')) {
      methodPrefix = p;
      rest = rest.slice(p.length + 1).trim();
      break;
    }
  }
  return {
    seq: m[1] ? parseInt(m[1], 10) : null,
    siteName: rest,
    method: (m[3] || '').trim(),
    methodPrefix,
  };
}

// === 기존 evidence 재파싱 (파일명 재분석만, 다운로드 X) ===
// 사용: POST /admin/jandi-reparse-evidence
// body: { dryRun?=false }
app.post('/admin/jandi-reparse-evidence', requireAuth, async (req, res) => {
  const { dryRun = false } = req.body || {};
  try {
    await getFirebaseAdmin();
    const db = admin.database();
    const snap = await db.ref('evidence').once('value');
    const evidence = snap.val() || {};

    const changed = [];
    const updates = {};
    for (const [fileId, ev] of Object.entries(evidence)) {
      const parsed = parseFilenameLocal(ev.filename);
      const oldSite = ev.parsedSiteName || '';
      const newSite = parsed.siteName || '';
      if (oldSite === newSite && ev.parsedMethodPrefix === parsed.methodPrefix) continue;
      changed.push({
        fileId,
        filename: ev.filename,
        oldSite,
        newSite,
        methodPrefix: parsed.methodPrefix,
      });
      if (!dryRun) {
        updates[`evidence/${fileId}/parsedSiteName`] = parsed.siteName;
        updates[`evidence/${fileId}/parsedSeq`] = parsed.seq;
        updates[`evidence/${fileId}/parsedMethod`] = parsed.method;
        updates[`evidence/${fileId}/parsedMethodPrefix`] = parsed.methodPrefix || null;
        // 매칭상태: 이미 matched 인 건 유지, 그 외만 pending 으로 초기화
        const hasMatch = ev.matchedPtIds && Object.keys(ev.matchedPtIds).length > 0;
        updates[`evidence/${fileId}/ptMatchStatus`] = hasMatch ? 'matched' : 'pending';
      }
    }
    if (!dryRun && Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }
    return res.json({
      status: 'ok',
      dryRun,
      totalEvidence: Object.keys(evidence).length,
      changedCount: changed.length,
      changes: changed,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === Phase 3c: evidence ↔ PT 자동 매칭 ===
// 사용: POST /admin/jandi-pt-match
// body: { minScore?=0.75, dryRun?=false, onlyUnmatched?=true }
// 흐름:
//   1. RTDB evidence/ 전체 로드
//   2. RTDB pt/ 전체 로드 (siteName 인덱스 구축)
//   3. 각 evidence: parsedSiteName 으로 PT 후보 매칭 (normalize + substring score)
//   4. 매칭 score >= minScore 이면:
//        pt/{ptId}/evidenceFiles/{fileId} = { filename, storagePath, matchScore, matchedAt }
//        evidence/{fileId}/matchedPtIds/{ptId} = matchScore
app.post('/admin/jandi-pt-match', requireAuth, async (req, res) => {
  const { minScore = 0.75, dryRun = false, onlyUnmatched = true } = req.body || {};
  const startedAt = Date.now();
  try {
    await getFirebaseAdmin();
    const db = admin.database();

    // 단지명 정규화 — 공백/괄호/숫자단지 제거
    const norm = (s) => (s || '').toString()
      .replace(/\s+/g, '')
      .replace(/[()()[\]【】]/g, '')
      .toLowerCase();

    // 유사도 — substring + subsequence 조합
    const similarity = (a, b) => {
      const na = norm(a), nb = norm(b);
      if (!na || !nb) return 0;
      if (na === nb) return 1;
      if (na.includes(nb) || nb.includes(na)) return 0.9;
      const longer = na.length >= nb.length ? na : nb;
      const shorter = na.length >= nb.length ? nb : na;
      let best = 0;
      for (let len = shorter.length; len >= 3 && len > best; len--) {
        for (let i = 0; i + len <= shorter.length; i++) {
          if (longer.includes(shorter.slice(i, i + len))) { best = len; break; }
        }
      }
      const substringScore = best / longer.length;
      let subseqScore = 0;
      if (shorter.length >= 4) {
        let i = 0, j = 0, matched = 0;
        while (i < shorter.length && j < longer.length) {
          if (shorter[i] === longer[j]) { matched++; i++; }
          j++;
        }
        if (i === shorter.length) {
          subseqScore = matched / longer.length;
          if (shorter.length / longer.length >= 0.5) subseqScore = Math.max(subseqScore, 0.85);
        }
      }
      return Math.max(substringScore, subseqScore);
    };

    // 한국 주요 시·군·구 리스트 (지역명 prefix 제거용)
    const REGIONS = [
      '서울','부산','인천','대구','대전','광주','울산','세종','제주',
      '수원','성남','용인','고양','부천','안산','남양주','안양','평택','의정부','시흥','파주','김포','광명','군포','광주','하남','이천','안성','구리','양주','오산','포천','의왕','여주','과천','연천','가평','양평','화성',
      '춘천','원주','강릉','속초','동해','태백','삼척','홍천','횡성','평창','영월','정선','철원','양구','인제','고성','양양',
      '청주','충주','제천','음성','단양','보은','옥천','영동','진천','괴산','증평',
      '천안','공주','보령','아산','논산','계룡','당진','금산','부여','서산','서천','예산','청양','홍성','태안',
      '전주','군산','익산','정읍','남원','김제','완주','진안','무주','장수','임실','순창','고창','부안',
      '목포','여수','순천','나주','광양','담양','곡성','구례','고흥','보성','화순','장흥','강진','해남','영암','무안','함평','영광','장성','완도','진도','신안',
      '포항','경주','김천','안동','구미','영주','영천','상주','문경','경산','군위','의성','청송','영양','영덕','청도','고령','성주','칠곡','예천','봉화','울진','울릉',
      '창원','마산','진주','통영','사천','김해','밀양','거제','양산','의령','함안','창녕','고성','남해','하동','산청','함양','거창','합천',
    ];

    // parsedSite 변형 — 원본 + 지역 prefix 제거 버전 (제거한 토큰 기록)
    // 반환: [{ text, strippedTokens: [] }, ...]
    const variantsOf = (s) => {
      const original = (s || '').trim();
      const out = [{ text: original, strippedTokens: [] }];
      let cur = original;
      const stripped = [];
      for (let step = 0; step < 2; step++) {
        const match = cur.match(/^(\S+)\s+(.+)$/);
        if (!match) break;
        const [, first, rest] = match;
        if (REGIONS.includes(first) || /[시군구읍면동]$/.test(first) || first.length <= 3) {
          cur = rest;
          stripped.push(first);
          if (!out.find(v => v.text === cur)) out.push({ text: cur, strippedTokens: [...stripped] });
        } else break;
      }
      return out;
    };

    // 지역 토큰이 PT siteName 또는 address 에 포함되는지 (일부 매칭 허용)
    const regionInPt = (token, pt) => {
      if (!token) return true;
      const t = token.replace(/[시군구읍면동]$/, '');  // "서울시" → "서울"
      if (!t) return true;
      const hay = (pt.siteName || '') + ' ' + (pt.address || '');
      return hay.includes(t);
    };

    // 복합 매칭 — 변형별로 스코어 계산, 단 지역 stripped 된 variant는 해당 지역이 PT에도 있어야 인정
    const composite = (parsedSite, pt) => {
      const addr = pt.address || '';
      const variants = variantsOf(parsedSite);
      let bestName = 0, bestAddr = 0, bestVariant = null;
      for (const v of variants) {
        // 지역 stripped 된 variant는 제거한 지역이 PT 에 있어야 함 (오탐 방지)
        const regionOk = v.strippedTokens.every(tok => regionInPt(tok, pt));
        if (!regionOk) continue;
        const ns = similarity(v.text, pt.siteName);
        const as = addr ? similarity(v.text, addr) : 0;
        if (ns > bestName) { bestName = ns; bestVariant = v; }
        if (as > bestAddr) bestAddr = as;
      }
      if (bestName >= 0.95) return { score: bestName, matchedBy: 'name' };

      let regionBoost = 0;
      const firstToken = (parsedSite.match(/^[가-힣]{2,3}/) || [])[0];
      if (firstToken && addr.includes(firstToken)) regionBoost = 0.3;

      if (bestName >= 0.5 && (bestAddr >= 0.7 || regionBoost > 0)) {
        return { score: Math.max(0.85, bestName + regionBoost * 0.2), matchedBy: 'name+address' };
      }
      if (bestAddr >= 0.6 && regionBoost > 0 && bestName >= 0.3) {
        return { score: 0.85, matchedBy: 'address+region' };
      }
      const addrOnly = bestAddr * 0.8;
      if (addrOnly > bestName) return { score: addrOnly, matchedBy: 'address' };
      return { score: bestName, matchedBy: 'name' };
    };

    // 1. evidence 로드
    const evSnap = await db.ref('evidence').once('value');
    const evidence = evSnap.val() || {};
    const evCount = Object.keys(evidence).length;

    // 2. pt 로드 — siteName + address 둘 다 인덱스
    const ptSnap = await db.ref('pt').once('value');
    const pts = ptSnap.val() || {};
    const ptEntries = Object.entries(pts)
      .filter(([, v]) => v?.siteName)
      .map(([id, v]) => ({ id, siteName: v.siteName, address: v.address || '', ptAssignee: v.ptAssignee, date: v.date, result: v.results }));

    // 3. 매칭 — composite (name + address) 사용
    const updates = {};
    const results = { evidenceProcessed: 0, matched: 0, multiMatch: 0, unmatched: 0, matches: [] };

    for (const [fileId, ev] of Object.entries(evidence)) {
      results.evidenceProcessed++;
      if (onlyUnmatched && ev.matchedPtIds && Object.keys(ev.matchedPtIds).length > 0) continue;

      const evSite = ev.parsedSiteName;
      if (!evSite) { results.unmatched++; continue; }

      const candidates = ptEntries
        .map(p => {
          const c = composite(evSite, p);
          return { ...p, score: c.score, matchedBy: c.matchedBy };
        })
        .filter(p => p.score >= minScore)
        .sort((a, b) => b.score - a.score);

      if (candidates.length === 0) {
        results.unmatched++;
        if (!dryRun) updates[`evidence/${fileId}/ptMatchStatus`] = 'no_match';
        continue;
      }

      // 상위 후보들 — score 1.0 인 정확 일치 여러 개면 전부 연결, 부분 일치면 top 1 만
      const topScore = candidates[0].score;
      const toLink = topScore >= 0.95
        ? candidates.filter(c => c.score >= topScore - 0.01)  // 다 연결
        : [candidates[0]];  // top 1 만

      if (toLink.length > 1) results.multiMatch++;
      results.matched++;

      const matchedIdsObj = {};
      for (const c of toLink) {
        matchedIdsObj[c.id] = Number(c.score.toFixed(3));
        if (!dryRun) {
          // undefined 는 Firebase 가 reject — null 로 치환
          updates[`pt/${c.id}/evidenceFiles/${fileId}`] = {
            filename: ev.filename || null,
            storagePath: ev.storagePath || null,
            ext: ev.ext || null,
            size: ev.size == null ? null : ev.size,
            parsedSeq: ev.parsedSeq == null ? null : ev.parsedSeq,
            parsedMethod: ev.parsedMethod || null,
            matchScore: Number(c.score.toFixed(3)),
            matchedAt: new Date().toISOString(),
            matchedBy: c.matchedBy || 'jandi-auto-sync',
          };
        }
      }
      if (!dryRun) {
        updates[`evidence/${fileId}/matchedPtIds`] = matchedIdsObj;
        updates[`evidence/${fileId}/ptMatchStatus`] = 'matched';
        updates[`evidence/${fileId}/matchedAt`] = new Date().toISOString();
      }

      results.matches.push({
        fileId,
        filename: ev.filename,
        parsedSiteName: evSite,
        matchedPts: toLink.map(c => ({ id: c.id, siteName: c.siteName, address: c.address, score: Number(c.score.toFixed(3)), matchedBy: c.matchedBy, ptAssignee: c.ptAssignee, date: c.date })),
      });
    }

    if (!dryRun && Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    return res.json({
      status: 'ok',
      dryRun,
      minScore,
      evidenceCount: evCount,
      ptCount: ptEntries.length,
      summary: {
        processed: results.evidenceProcessed,
        matched: results.matched,
        multiMatch: results.multiMatch,
        unmatched: results.unmatched,
      },
      updateKeys: dryRun ? undefined : Object.keys(updates).length,
      sampleMatches: results.matches.slice(0, 15),
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === Phase 4: 중복감지 (Type A~D) ===
// 사용: POST /admin/jandi-detect-duplicates
// body: { dryRun?=false }
//
// Type A: Multi-match — 하나의 evidence 가 여러 PT 에 연결됨
//         → PT date 최신 것을 primary, 나머지 suppressedBy=최신ptId
// Type B: Revision — 파일명에 '재공고/정정/v2/특허오기재' 포함
//         → evidence.isRevision=true, 같은 parsedSiteName 그룹 내 최신 seq 만 primary
// Type C: 같은 단지 여러 evidence — parsedSiteName+parsedMethod 같은 파일 여러 개
//         → 최신 seq 만 primary, 나머지 supersededByFileId
// Type D: SHA-256 중복 — 서로 다른 fileId지만 내용 동일
//         → sameContentAs=[fileId1,...] 역참조
app.post('/admin/jandi-detect-duplicates', requireAuth, async (req, res) => {
  const { dryRun = false } = req.body || {};
  const startedAt = Date.now();
  try {
    await getFirebaseAdmin();
    const db = admin.database();

    const [evSnap, ptSnap] = await Promise.all([
      db.ref('evidence').once('value'),
      db.ref('pt').once('value'),
    ]);
    const evidence = evSnap.val() || {};
    const pts = ptSnap.val() || {};
    const updates = {};
    const report = { typeA: [], typeB: [], typeC: [], typeD: [] };

    // ------- Type A: multi-match 정리 -------
    for (const [fileId, ev] of Object.entries(evidence)) {
      const ptIds = Object.keys(ev.matchedPtIds || {});
      if (ptIds.length < 2) continue;
      // PT date 수집
      const dated = ptIds
        .map(pid => ({ pid, date: pts[pid]?.date || '', assignee: pts[pid]?.ptAssignee }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const primary = dated[0];
      const suppressed = dated.slice(1);
      report.typeA.push({
        fileId, filename: ev.filename,
        primary: { pid: primary.pid, date: primary.date, assignee: primary.assignee },
        suppressed: suppressed.map(s => ({ pid: s.pid, date: s.date, assignee: s.assignee })),
      });
      if (!dryRun) {
        // pt/{suppressedPid}/evidenceFiles/{fileId}/suppressed = true
        for (const s of suppressed) {
          updates[`pt/${s.pid}/evidenceFiles/${fileId}/suppressed`] = true;
          updates[`pt/${s.pid}/evidenceFiles/${fileId}/supersededBy`] = primary.pid;
        }
        updates[`evidence/${fileId}/primaryPtId`] = primary.pid;
      }
    }

    // ------- Type B: Revision (재공고/정정) -------
    const REVISION_RE = /재공고|정정|_v\d+|특허오기재|수정본|재업로드/i;
    for (const [fileId, ev] of Object.entries(evidence)) {
      if (!REVISION_RE.test(ev.filename || '')) continue;
      report.typeB.push({ fileId, filename: ev.filename });
      if (!dryRun) updates[`evidence/${fileId}/isRevision`] = true;
    }

    // ------- Type C: 같은 단지 여러 evidence (정식 재공고 아닌 중복) -------
    // parsedSiteName + parsedMethodPrefix 기준 그룹화 → 최신 seq 만 primary
    const siteGroups = new Map();
    for (const [fileId, ev] of Object.entries(evidence)) {
      if (!ev.parsedSiteName) continue;
      const key = (ev.parsedSiteName + '|' + (ev.parsedMethodPrefix || '')).toLowerCase().replace(/\s+/g, '');
      if (!siteGroups.has(key)) siteGroups.set(key, []);
      siteGroups.get(key).push({ fileId, seq: ev.parsedSeq || 0, filename: ev.filename, isRev: REVISION_RE.test(ev.filename || '') });
    }
    for (const [key, arr] of siteGroups.entries()) {
      if (arr.length < 2) continue;
      // 최신 seq (또는 revision 포함한 것 중 최신) 를 primary
      arr.sort((a, b) => b.seq - a.seq);
      const primary = arr[0];
      const older = arr.slice(1);
      report.typeC.push({
        key, siteName: evidence[primary.fileId]?.parsedSiteName,
        count: arr.length,
        primary: { fileId: primary.fileId, seq: primary.seq, filename: primary.filename },
        older: older.map(o => ({ fileId: o.fileId, seq: o.seq, filename: o.filename, isRevision: o.isRev })),
      });
      if (!dryRun) {
        for (const o of older) {
          updates[`evidence/${o.fileId}/supersededByFileId`] = primary.fileId;
        }
        updates[`evidence/${primary.fileId}/hasOlderVersions`] = older.length;
      }
    }

    // ------- Type D: SHA-256 중복 -------
    const shaGroups = new Map();
    for (const [fileId, ev] of Object.entries(evidence)) {
      if (!ev.sha256) continue;
      if (!shaGroups.has(ev.sha256)) shaGroups.set(ev.sha256, []);
      shaGroups.get(ev.sha256).push({ fileId, filename: ev.filename });
    }
    for (const [sha, arr] of shaGroups.entries()) {
      if (arr.length < 2) continue;
      report.typeD.push({
        sha256: sha.slice(0, 16),
        count: arr.length,
        files: arr.map(a => ({ fileId: a.fileId, filename: a.filename })),
      });
      if (!dryRun) {
        const ids = arr.map(a => a.fileId);
        for (const a of arr) {
          updates[`evidence/${a.fileId}/sameContentAs`] = ids.filter(x => x !== a.fileId);
        }
      }
    }

    if (!dryRun && Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    return res.json({
      status: 'ok',
      dryRun,
      counts: {
        typeA_multiMatch: report.typeA.length,
        typeB_revision: report.typeB.length,
        typeC_siteDuplicates: report.typeC.length,
        typeD_sha256Duplicates: report.typeD.length,
      },
      updateKeys: dryRun ? undefined : Object.keys(updates).length,
      report,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === Phase 3c+ : 미매칭 evidence 조회 + top 후보 추천 ===
// 사용: POST /admin/jandi-unmatched-evidence
// body: { minCandidateScore?=0.3, topN?=3 }
// 반환: 각 no_match evidence + 가장 가까운 PT 후보 N개 (score 순)
app.post('/admin/jandi-unmatched-evidence', requireAuth, async (req, res) => {
  const { minCandidateScore = 0.3, topN = 3 } = req.body || {};
  try {
    await getFirebaseAdmin();
    const db = admin.database();

    const norm = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()()[\]【】]/g, '').toLowerCase();
    const similarity = (a, b) => {
      const na = norm(a), nb = norm(b);
      if (!na || !nb) return 0;
      if (na === nb) return 1;
      if (na.includes(nb) || nb.includes(na)) return 0.9;
      const longer = na.length >= nb.length ? na : nb;
      const shorter = na.length >= nb.length ? nb : na;
      let best = 0;
      for (let len = shorter.length; len >= 2 && len > best; len--) {
        for (let i = 0; i + len <= shorter.length; i++) {
          if (longer.includes(shorter.slice(i, i + len))) { best = len; break; }
        }
      }
      const substringScore = best / longer.length;
      let subseqScore = 0;
      if (shorter.length >= 4) {
        let i = 0, j = 0, matched = 0;
        while (i < shorter.length && j < longer.length) {
          if (shorter[i] === longer[j]) { matched++; i++; }
          j++;
        }
        if (i === shorter.length) {
          subseqScore = matched / longer.length;
          if (shorter.length / longer.length >= 0.5) subseqScore = Math.max(subseqScore, 0.85);
        }
      }
      return Math.max(substringScore, subseqScore);
    };

    const [evSnap, ptSnap] = await Promise.all([
      db.ref('evidence').once('value'),
      db.ref('pt').once('value'),
    ]);
    const evidence = evSnap.val() || {};
    const pts = ptSnap.val() || {};
    const ptEntries = Object.entries(pts)
      .filter(([, v]) => v?.siteName)
      .map(([id, v]) => ({ id, siteName: v.siteName, address: v.address || '', ptAssignee: v.ptAssignee, date: v.date, result: v.results }));

    // composite: siteName + address 조합 + 지역명 prefix 제거 변형 (위 jandi-pt-match 와 동일)
    const REGIONS = [
      '서울','부산','인천','대구','대전','광주','울산','세종','제주',
      '수원','성남','용인','고양','부천','안산','남양주','안양','평택','의정부','시흥','파주','김포','광명','군포','하남','이천','안성','구리','양주','오산','화성','의왕','여주','과천',
      '춘천','원주','강릉','속초','동해','태백',
      '청주','충주','제천','천안','공주','보령','아산','논산','당진','서산','홍성','예산','태안',
      '전주','군산','익산','정읍','남원','목포','여수','순천','나주','광양',
      '포항','경주','구미','김천','안동','영주','경산','영천','상주','문경','창원','마산','진주','통영','김해','밀양','거제','양산','사천',
    ];
    const variantsOf = (s) => {
      const original = (s || '').trim();
      const out = [{ text: original, strippedTokens: [] }];
      let cur = original;
      const stripped = [];
      for (let step = 0; step < 2; step++) {
        const match = cur.match(/^(\S+)\s+(.+)$/);
        if (!match) break;
        const [, first, rest] = match;
        if (REGIONS.includes(first) || /[시군구읍면동]$/.test(first) || first.length <= 3) {
          cur = rest;
          stripped.push(first);
          if (!out.find(v => v.text === cur)) out.push({ text: cur, strippedTokens: [...stripped] });
        } else break;
      }
      return out;
    };
    const regionInPt = (token, pt) => {
      if (!token) return true;
      const t = token.replace(/[시군구읍면동]$/, '');
      if (!t) return true;
      const hay = (pt.siteName || '') + ' ' + (pt.address || '');
      return hay.includes(t);
    };
    const composite = (parsedSite, pt) => {
      const addr = pt.address || '';
      const variants = variantsOf(parsedSite);
      let bestName = 0, bestAddr = 0;
      for (const v of variants) {
        const regionOk = v.strippedTokens.every(tok => regionInPt(tok, pt));
        if (!regionOk) continue;
        const ns = similarity(v.text, pt.siteName);
        const as = addr ? similarity(v.text, addr) : 0;
        if (ns > bestName) bestName = ns;
        if (as > bestAddr) bestAddr = as;
      }
      if (bestName >= 0.95) return { score: bestName, matchedBy: 'name' };
      let regionBoost = 0;
      const firstToken = (parsedSite.match(/^[가-힣]{2,3}/) || [])[0];
      if (firstToken && addr.includes(firstToken)) regionBoost = 0.3;
      if (bestName >= 0.5 && (bestAddr >= 0.7 || regionBoost > 0)) {
        return { score: Math.max(0.85, bestName + regionBoost * 0.2), matchedBy: 'name+address' };
      }
      if (bestAddr >= 0.6 && regionBoost > 0 && bestName >= 0.3) {
        return { score: 0.85, matchedBy: 'address+region' };
      }
      const addrOnly = bestAddr * 0.8;
      if (addrOnly > bestName) return { score: addrOnly, matchedBy: 'address' };
      return { score: bestName, matchedBy: 'name' };
    };

    const unmatched = [];
    for (const [fileId, ev] of Object.entries(evidence)) {
      if (ev.ptMatchStatus === 'matched') continue;
      if (!ev.parsedSiteName) {
        unmatched.push({ fileId, filename: ev.filename, reason: 'no_parsed_site', candidates: [] });
        continue;
      }
      const candidates = ptEntries
        .map(p => {
          const c = composite(ev.parsedSiteName, p);
          return { ...p, score: c.score, matchedBy: c.matchedBy };
        })
        .filter(p => p.score >= minCandidateScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
      unmatched.push({
        fileId,
        filename: ev.filename,
        parsedSeq: ev.parsedSeq,
        parsedSiteName: ev.parsedSiteName,
        parsedMethod: ev.parsedMethod,
        ext: ev.ext,
        size: ev.size,
        storagePath: ev.storagePath,
        candidates: candidates.map(c => ({
          ptId: c.id,
          siteName: c.siteName,
          address: c.address,
          ptAssignee: c.ptAssignee,
          date: c.date,
          result: c.result ? Object.keys(c.result).join(',') : null,
          score: Number(c.score.toFixed(3)),
          matchedBy: c.matchedBy,
        })),
      });
    }

    const withCandidates = unmatched.filter(u => u.candidates.length > 0);
    const noCandidates = unmatched.filter(u => u.candidates.length === 0);

    return res.json({
      status: 'ok',
      totalUnmatched: unmatched.length,
      withCandidates: withCandidates.length,
      noCandidates: noCandidates.length,
      unmatched,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === 수동 매칭 적용/해제 ===
// 사용: POST /admin/jandi-manual-link
// body: { fileId, ptId, unlink?=false }
app.post('/admin/jandi-manual-link', requireAuth, async (req, res) => {
  const { fileId, ptId, unlink = false } = req.body || {};
  if (!fileId || !ptId) return res.status(400).json({ error: 'fileId and ptId required' });
  try {
    await getFirebaseAdmin();
    const db = admin.database();
    const evSnap = await db.ref(`evidence/${fileId}`).once('value');
    const ev = evSnap.val();
    if (!ev) return res.status(404).json({ error: 'evidence not found' });

    const updates = {};
    if (unlink) {
      updates[`pt/${ptId}/evidenceFiles/${fileId}`] = null;
      updates[`evidence/${fileId}/matchedPtIds/${ptId}`] = null;
    } else {
      updates[`pt/${ptId}/evidenceFiles/${fileId}`] = {
        filename: ev.filename,
        storagePath: ev.storagePath,
        ext: ev.ext,
        size: ev.size,
        parsedSeq: ev.parsedSeq,
        parsedMethod: ev.parsedMethod,
        matchScore: 1.0,
        matchedAt: new Date().toISOString(),
        matchedBy: 'manual',
      };
      updates[`evidence/${fileId}/matchedPtIds/${ptId}`] = 1.0;
      updates[`evidence/${fileId}/ptMatchStatus`] = 'matched';
      updates[`evidence/${fileId}/matchedAt`] = new Date().toISOString();
    }
    await db.ref().update(updates);
    return res.json({ status: 'ok', action: unlink ? 'unlinked' : 'linked', fileId, ptId });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === 잔디 실제 다운로드 URL sniff ===
// 사용: POST /admin/jandi-download-sniff
// body: { channelName?='입찰 공고(POUR공법)' }
// 흐름: 로그인 → 채널 진입 → 네트워크 인터셉트 → 첫 파일 카드 클릭 → 실제 발생 요청 로그
app.post('/admin/jandi-download-sniff', requireAuth, async (req, res) => {
  const email = process.env.JANDI_EMAIL;
  const password = process.env.JANDI_PASSWORD;
  const team = process.env.JANDI_TEAM;
  if (!email || !password || !team) {
    return res.status(400).json({ error: 'env vars required' });
  }
  const { channelName = '입찰 공고(POUR공법)' } = req.body || {};
  const startedAt = Date.now();
  let context = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
    });
    const page = await context.newPage();

    // 네트워크 인터셉트
    const interestingRequests = [];
    page.on('request', r => {
      const u = r.url();
      if (/files|download|attach|s3|cloudfront|jandi\.com\/api/i.test(u) && !u.includes('.css') && !u.includes('.svg') && !u.includes('.png') && !u.includes('.jpg')) {
        interestingRequests.push({ method: r.method(), url: u.slice(0, 250), headers: r.headers() });
      }
    });
    page.on('response', async r => {
      // 404/200 response of download-ish URLs
      const u = r.url();
      if (/files-down|download|\/files\//i.test(u) && !u.includes('.css')) {
        const idx = interestingRequests.findIndex(x => x.url.slice(0, 100) === u.slice(0, 100));
        if (idx >= 0) {
          interestingRequests[idx].responseStatus = r.status();
          interestingRequests[idx].responseHeaders = r.headers();
        }
      }
    });

    const login = await performJandiLogin(page, { email, password, team });
    if (!login.ok) {
      await context.close();
      return res.json({ status: 'login_failed', login });
    }
    await page.waitForTimeout(3000);

    // 채널 클릭
    const itemLocator = page.locator('.lnb-list-item').filter({ hasText: channelName });
    await itemLocator.first().click({ timeout: 10000 });
    await page.waitForURL(u => /#!\/room\/\d+/.test(u.toString()), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(6000);

    // 첫 preview-file 발견 → download 클릭/hover 시도
    const fileCount = await page.locator('.preview-file[file-id]').count();
    let clickedFileId = null, downloadEvent = null;
    if (fileCount > 0) {
      // 첫 파일의 file-id 확보
      clickedFileId = await page.locator('.preview-file[file-id]').first().getAttribute('file-id');

      // download 이벤트 listen (클릭으로 trigger될 경우)
      const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);

      // preview-file 또는 인접 download 버튼 클릭
      // 잔디는 파일카드 hover 시 다운로드 아이콘 표시 → 먼저 hover, 그 다음 click
      await page.locator('.preview-file[file-id]').first().hover({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      // 다운로드 버튼 탐색
      const downloadBtn = page.locator('.preview-file[file-id]').first().locator('xpath=ancestor::*[.//button or .//a][1]//*[contains(@class,"download") or contains(@class,"save") or contains(@class,"icon-ic-save")]').first();
      const btnCount = await downloadBtn.count().catch(() => 0);
      if (btnCount > 0) {
        await downloadBtn.click({ timeout: 5000 }).catch(() => {});
      } else {
        // fallback — 파일카드 자체 click
        await page.locator('.preview-file[file-id]').first().click({ timeout: 5000 }).catch(() => {});
      }
      const dl = await downloadPromise;
      if (dl) {
        downloadEvent = {
          url: dl.url(),
          suggestedFilename: dl.suggestedFilename(),
        };
      }
    }

    // 추가 1초 대기 — 비동기 요청 잡기
    await page.waitForTimeout(1500);

    await context.close();
    return res.json({
      status: 'ok',
      fileCount,
      clickedFileId,
      downloadEvent,
      requestCount: interestingRequests.length,
      requests: interestingRequests.slice(-30),
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === 잔디 파일 다운로드 검증 (Phase 3a) ===
// 사용: POST /admin/jandi-file-download-test
// body: { fileUrl: "https://files.jandi.com/files-private/.../..." }
// 흐름: 로그인 → context.request.get(fileUrl) → 응답 메타 + 첫 200바이트 hex 반환
//       (성공 시 binary content-type / 실패 시 HTML 로그인 redirect)
app.post('/admin/jandi-file-download-test', requireAuth, async (req, res) => {
  const email = process.env.JANDI_EMAIL;
  const password = process.env.JANDI_PASSWORD;
  const team = process.env.JANDI_TEAM;
  if (!email || !password || !team) {
    return res.status(400).json({ error: 'JANDI_EMAIL, JANDI_PASSWORD, JANDI_TEAM env vars required' });
  }
  const { fileUrl } = req.body || {};
  if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
    return res.status(400).json({ error: 'fileUrl required (full URL)' });
  }
  const startedAt = Date.now();
  let context = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
    });
    const page = await context.newPage();

    const login = await performJandiLogin(page, { email, password, team });
    if (!login.ok) {
      await context.close();
      return res.json({ status: 'login_failed', login, durationMs: Date.now() - startedAt });
    }

    // body 에서 fileId / teamId 추출 (fileUrl 에서 자동 파싱)
    let fileId = req.body?.fileId;
    let teamId = req.body?.teamId;
    if (!fileId || !teamId) {
      // fileUrl 패턴 https://files.jandi.com/files-private/{teamId}/{hash}
      const m = fileUrl.match(/files-private\/(\d+)\/([a-f0-9]+)/);
      if (m) { teamId = teamId || m[1]; }
    }

    // JWT 쿠키 추출
    const cookies = await context.cookies();
    const jwt = cookies.find(c => c.name === '_jd_.access_token')?.value;

    if (!fileId) {
      await context.close();
      return res.json({ status: 'error', error: 'fileId required (from channel-fetch output)', hasJwt: !!jwt, teamId });
    }

    // Step 1: i1.jandi.com/file-api 에서 signed downloadUrl 획득
    let step1 = {}, step2 = {};
    try {
      const apiUrl = `https://i1.jandi.com/file-api/v1/teams/${teamId}/files/${fileId}/downloadUrl?fileId=${fileId}`;
      // Accept 헤더 여러 버전 시도
      const acceptCandidates = [
        'application/vnd.tosslab.jandi-v1+json',
        'application/vnd.tosslab.jandi-v3+json',
        'application/vnd.tosslab.jandi+json',
        'application/json',
        '*/*',
      ];
      step1.attempts = [];
      let r1 = null, apiJson = null, signedUrl = null;
      for (const accept of acceptCandidates) {
        r1 = await context.request.get(apiUrl, {
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'Referer': `https://${team}.jandi.com/`,
            'Accept': accept,
          },
          timeout: 15000,
        });
        const s = r1.status();
        step1.attempts.push({ accept, status: s });
        if (s >= 200 && s < 300) {
          apiJson = await r1.json().catch(() => null);
          signedUrl = apiJson?.downloadUrl || apiJson?.url || apiJson?.data?.downloadUrl;
          if (signedUrl) { step1.workingAccept = accept; break; }
        } else if (s === 406) {
          continue; // try next
        } else {
          // 401/403/500 등은 바로 stop
          const body = await r1.text().catch(() => '');
          step1.attempts[step1.attempts.length - 1].bodyPreview = body.slice(0, 200);
          break;
        }
      }
      if (r1) {
        step1.finalStatus = r1.status();
        step1.finalContentType = r1.headers()['content-type'];
      }
      step1.responseBody = apiJson;
      step1.signedUrlPreview = signedUrl ? signedUrl.slice(0, 200) + '...' : null;

      // Step 2: signed URL로 실제 다운로드
      if (signedUrl) {
        const r2 = await context.request.get(signedUrl, { timeout: 60000 });
        const buf = await r2.body();
        step2 = {
          httpStatus: r2.status(),
          contentType: r2.headers()['content-type'],
          contentLength: r2.headers()['content-length'],
          totalBytes: buf.length,
          first50UTF8: buf.slice(0, 50).toString('utf-8').replace(/[^\x20-\x7e]/g, '.'),
          first64Hex: buf.slice(0, 64).toString('hex'),
        };
      }
    } catch (e) {
      step1.error = e.message;
    }

    const verdict = (step2.httpStatus === 200 && step2.totalBytes > 1000) ? 'download_works' : 'download_failed';

    await context.close();
    return res.json({
      status: 'ok',
      method: '2-step api call (downloadUrl → signed cloudfront)',
      teamId, fileId,
      hasJwt: !!jwt,
      step1,
      step2,
      verdict,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// === Phase 1: K-APT 전체 공고 리스트 크롤링 (aptName 필터 없이) ===
// 사용: POST /admin/kapt-list-crawl { startDate, endDate, pageNo, bidGb }
// 목적: aptName 없어도 bidList.do 가 결과 반환하는지 검증 + 초기 캐시 구축용
app.post('/admin/kapt-list-crawl', requireAuth, async (req, res) => {
  const { startDate, endDate, pageNo = 1, bidGb = 'bid_gb_1' } = req.body || {};
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required (YYYY-MM-DD)' });
  const startedAt = Date.now();
  let context = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    // 1) 메인 접속 (세션 쿠키)
    await page.goto('https://www.k-apt.go.kr/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    // 2) 리스트 페이지 (aptName 비움)
    const listUrl = `https://www.k-apt.go.kr/bid/bidList.do?searchBidGb=${bidGb}&bidTitle=&aptName=&searchDateGb=reg&dateStart=${startDate}&dateEnd=${endDate}&pageNo=${pageNo}`;
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    // 3) 차단 여부 먼저 체크
    const pageText = await page.evaluate(() => document.body?.innerText || '');
    const blocked = /반복 요청이 차단|차단되었습니다/.test(pageText);
    if (blocked) {
      await context.close();
      return res.json({ status: 'blocked', durationMs: Date.now() - startedAt, pageTextPreview: pageText.slice(0, 200) });
    }
    // 4) 공고 row 추출 (표 구조에서 cells + onclick 기반 bidNum)
    const result = await page.evaluate(() => {
      const bids = [];
      const tables = [...document.querySelectorAll('table')];
      for (const t of tables) {
        const trs = [...t.querySelectorAll('tbody tr, :scope > tr')];
        const dataRows = trs.filter(r => r.querySelectorAll('td').length > 2);
        for (const r of dataRows) {
          const cells = [...r.querySelectorAll('td')].map(td => td.innerText.trim());
          const allAttr = [...r.querySelectorAll('a,tr,td')].map(el => (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('href') || '')).join(' ');
          const bidMatch = allAttr.match(/['"(]\s*([a-z0-9_]+_\d+|\d{14,18})\s*['")]/i) ||
                           allAttr.match(/bidNum['"=\s:]+([a-z0-9_]+_\d+|\d{14,18})/i) ||
                           (cells.join(' ')).match(/(kg\w*_\d+)/i) ||
                           (cells.join(' ')).match(/(\d{17})/);
          if (bidMatch) {
            bids.push({ bidNum: bidMatch[1], cells: cells.map(c => c.slice(0, 80)) });
          }
        }
      }
      // pagination 정보 추출
      const pageLinks = [...document.querySelectorAll('a,button')]
        .map(el => (el.innerText || '').trim())
        .filter(t => /^\d+$/.test(t) || /다음|이전|처음|끝/.test(t));
      const bodyLen = (document.body?.innerText || '').length;
      return { bids, pageLinks: pageLinks.slice(0, 20), bodyLen };
    });
    await context.close();
    return res.json({
      status: 'ok',
      listUrl,
      pageNo,
      bidGb,
      dateRange: { startDate, endDate },
      bidCount: result.bids.length,
      bids: result.bids,
      pageLinks: result.pageLinks,
      bodyLen: result.bodyLen,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message });
  }
});

// 타사 공법·특허번호 감지 (공고문에 경쟁사 언급 있는지)
function findCompetitorInText(text) {
  const result = { patents: [], techs: [] };
  if (!text) return result;
  const seen = new Set();
  for (const m of text.matchAll(/10-\d{7}/g)) {
    const num = m[0];
    if (seen.has(num)) continue;
    seen.add(num);
    if (!OUR_PATENT_NUMBERS.has(num)) result.patents.push(num);
  }
  for (const tech of COMPETITOR_TECHNOLOGIES) {
    if (containsTechnology(text, tech)) {
      if (!result.techs.includes(tech)) result.techs.push(tech);
    }
  }
  return result;
}

// 우리 회사 특허번호 전체 목록 (첫 매칭 뿐만이 아닌 모든 매칭)
function findAllOurPatentsInText(text) {
  if (!text) return [];
  const found = new Set();
  for (const m of text.matchAll(/10-\d{7}/g)) {
    if (OUR_PATENT_NUMBERS.has(m[0])) found.add(m[0]);
  }
  const normText = text.replace(/\s+/g, ' ');
  for (const p of OUR_PATENTS) {
    if (!p.name || p.name.length < 15) continue;
    if (normText.includes(p.name.replace(/\s+/g, ' ').trim())) found.add(p.num);
  }
  return [...found];
}

function findOurInText(text) {
  if (!text) return null;
  for (const tech of OUR_TECHNOLOGIES) {
    if (containsTechnology(text, tech)) return { type: 'technology', value: tech };
  }
  const matches = text.matchAll(/10-\d{7}/g);
  for (const m of matches) {
    if (OUR_PATENT_NUMBERS.has(m[0])) return { type: 'patent', value: m[0] };
  }
  // 특허명 매칭: 공고문에 특허명이 인용된 경우 (공백 정규화 후 비교)
  const normText = text.replace(/\s+/g, ' ');
  for (const p of OUR_PATENTS) {
    if (!p.name || p.name.length < 15) continue;
    const normName = p.name.replace(/\s+/g, ' ').trim();
    if (normText.includes(normName)) {
      return { type: 'patent_name', value: p.num, patentName: p.name };
    }
  }
  return null;
}

function containsTechnology(text, tech) {
  if (!text || !tech) return false;
  if (/[가-힣]/.test(tech)) return text.includes(tech);
  const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 경계: 앞뒤 영문자/숫자가 아니면 OK (한글 붙은 'POUR공법' 케이스 대응)
  // 'POURED', 'POURING' 같은 영어 연장은 여전히 제외
  const re = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=[^A-Za-z0-9]|$)`, 'i');
  return re.test(text);
}

// === 단지명 정규화 + 유사도 계산 ===
function normalizeAptName(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[()[\]()]/g, '')
    .replace(/(아파트|주공|입대의|관리사무소|차)$/g, '')
    .toLowerCase();
}

// Levenshtein 거리
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  matrix[0] = Array.from({ length: a.length + 1 }, (_, j) => j);
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

// 유사도 (0~1, 1이 정확 일치)
function similarityScore(name1, name2) {
  const n1 = normalizeAptName(name1);
  const n2 = normalizeAptName(name2);
  if (n1 === n2) return 1.0;
  if (!n1 || !n2) return 0;
  // 포함 관계: 짧은 쪽이 긴 쪽에 포함되면 높은 점수
  if (n1.includes(n2) || n2.includes(n1)) {
    const ratio = Math.min(n1.length, n2.length) / Math.max(n1.length, n2.length);
    return 0.6 + ratio * 0.4; // 0.6 ~ 1.0
  }
  // Levenshtein 기반 유사도
  const dist = levenshtein(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  return Math.max(0, 1 - dist / maxLen) * 0.6; // 0 ~ 0.6
}

// === K-APT 직접 검색 (data.go.kr가 놓치는 취소 공고/최신 공고 커버) ===
// aptName으로 K-APT 목록 페이지 긁어 bidNum 후보 수집
async function searchKaptByAptName(aptName, ptDate, opts = {}) {
  const debug = !!opts.debug;
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  try {
    // 1) 메인 (세션 쿠키)
    await page.goto('https://www.k-apt.go.kr/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);

    // 2) ptDate 기준 ±12개월 범위 검색
    const target = ptDate ? new Date(ptDate) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dateEnd = fmt(new Date(target.getTime() + 90 * 86400000));
    const dateStart = fmt(new Date(target.getTime() - 365 * 86400000));

    // K-APT bidList.do: bid_gb_1(입찰공고) 먼저, 없으면 bid_gb_3(입찰결과) 시도
    // 기한 지난 건은 결과공고로만 남아있는 경우가 많음
    const bidGbOrder = ['bid_gb_1', 'bid_gb_3'];
    let listUrl = '';
    for (const bidGb of bidGbOrder) {
      listUrl = `https://www.k-apt.go.kr/bid/bidList.do?searchBidGb=${bidGb}&bidTitle=&aptName=${encodeURIComponent(aptName)}&searchDateGb=reg&dateStart=${dateStart}&dateEnd=${dateEnd}`;
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      const hasData = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('tbody tr, table tr')].filter(r => r.querySelectorAll('td').length > 1);
        return rows.length > 0 && document.body.innerText.length > 1500;
      });
      if (hasData) break; // 데이터 있으면 여기서 멈춤
    }

    // 3) 검색 form 실제 제출 시도 (aptName input이 있으면 fill + submit)
    const formSubmitted = await page.evaluate((apt) => {
      const inputs = [...document.querySelectorAll('input')];
      const aptInput = inputs.find(el => el.name === 'aptName' || el.id === 'aptName' || el.placeholder?.includes('단지명'));
      if (aptInput) {
        aptInput.value = apt;
        aptInput.dispatchEvent(new Event('input', { bubbles: true }));
        aptInput.dispatchEvent(new Event('change', { bubbles: true }));
        // 검색 버튼 찾아 클릭
        const btn = document.querySelector('button.btn_search, a.btn_search, button[onclick*="search"], a[onclick*="goSearch"], a.btn_srch, #btnSearch');
        if (btn) { btn.click(); return 'clicked'; }
        // 폼 직접 submit
        const form = aptInput.closest('form');
        if (form) { form.submit(); return 'submitted'; }
        return 'no_button';
      }
      return 'no_input';
    }, aptName);
    await page.waitForTimeout(3500);

    // 3b) 결과 행에서 bidNum + bidKaptname + bidTitle + bidRegdate 추출
    const extraction = await page.evaluate(() => {
      const out = { candidates: [], tablesFound: [], pageTitle: document.title, bodyPreview: (document.body?.innerText || '').slice(0, 800) };
      // 모든 table을 수집하고 각 컬럼 개수 + 샘플 row 기록
      const tables = [...document.querySelectorAll('table')];
      for (let ti = 0; ti < tables.length; ti++) {
        const t = tables[ti];
        const trs = [...t.querySelectorAll('tbody tr'), ...t.querySelectorAll(':scope > tr')];
        const dataRows = trs.filter(r => r.querySelectorAll('td').length > 1);
        if (dataRows.length === 0) continue;
        const sample = dataRows.slice(0, 3).map(r => ({
          cells: [...r.querySelectorAll('td')].map(td => td.innerText.trim().slice(0, 60)),
          links: [...r.querySelectorAll('a')].slice(0, 3).map(a => ({
            text: (a.innerText || '').trim().slice(0, 40),
            onclick: (a.getAttribute('onclick') || '').slice(0, 120),
            href: (a.href || '').slice(0, 120),
          })),
        }));
        out.tablesFound.push({
          index: ti,
          className: t.className,
          id: t.id,
          rowCount: dataRows.length,
          colCount: dataRows[0]?.querySelectorAll('td').length || 0,
          sample,
        });
        // bidNum 추출 시도
        for (const r of dataRows) {
          const cells = [...r.querySelectorAll('td')].map(td => td.innerText.trim());
          const allAttr = [...r.querySelectorAll('a,tr,td')].map(el => (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('href') || '')).join(' ');
          const bidMatch = allAttr.match(/['"(]\s*([a-z0-9_]+_\d+|\d{14,18})\s*['")]/i) || allAttr.match(/bidNum['"=\s:]+([a-z0-9_]+_\d+|\d{14,18})/i) || (cells.join(' ')).match(/(kg\w*_\d+)/i) || (cells.join(' ')).match(/(\d{17})/);
          if (bidMatch) {
            out.candidates.push({ tableIndex: ti, bidNum: bidMatch[1], cells: cells.map(c => c.slice(0, 60)) });
          }
        }
      }
      return out;
    });
    extraction.formSubmitted = formSubmitted;

    if (debug) {
      return { aptName, ptDate, listUrl, dateStart, dateEnd, ...extraction };
    }

    // 셀 배열에서 단지명·공고명·등록일 추정
    // K-APT 목록 통상 컬럼: [번호, 공고번호, 공고명, 단지명, 주소, 등록일, 상태] 또는 비슷한 변형
    const parsed = extraction.candidates.map(c => {
      const datePattern = /\d{4}[-.]\d{2}[-.]\d{2}/;
      const bidRegdate = (c.cells.find(cel => datePattern.test(cel)) || '').match(datePattern)?.[0]?.replace(/\./g, '-') || '';
      // 단지명은 aptName과 유사도 가장 높은 셀
      let bidKaptname = '';
      let bestScore = 0;
      for (const cel of c.cells) {
        if (!cel || datePattern.test(cel) || /^\d+$/.test(cel)) continue;
        const s = similarityScore(aptName, cel);
        if (s > bestScore) { bestScore = s; bidKaptname = cel; }
      }
      // 공고명은 가장 긴 텍스트 셀 (보통 제목이 길다)
      const sortedByLen = [...c.cells].filter(cel => cel && !datePattern.test(cel) && !/^\d+$/.test(cel)).sort((a, b) => b.length - a.length);
      const bidTitle = sortedByLen[0] || '';
      return {
        bidNum: c.bidNum,
        bidKaptname: bidKaptname || aptName,
        bidTitle,
        bidRegdate,
      };
    });
    return parsed;
  } finally {
    await context.close().catch(() => {});
  }
}

// 한국 아파트 브랜드 사전 (공백 없는 이름에서 뒤쪽 브랜드 추출용)
// 자주 등장하는 것 우선 포함. 필요시 확장.
const APT_BRANDS = [
  // 대형 브랜드
  '래미안', '자이', '푸르지오', '힐스테이트', '더샵', '롯데캐슬', '아이파크',
  '센트레빌', '위브', '스위첸', '하늘채', '데시앙', '금호어울림', '한양수자인',
  '두산위브', '휴먼시아', '이지더원',
  // S클래스 (중흥건설) + 변형
  'S클래스', 's클래스', '중흥S클래스', '중흥에스클래스', '에스클래스',
  // 이편한세상 변형
  '서해그랑블', 'e편한세상', 'E편한세상', '이편한세상', '에편한세상',
  '이-편한세상', '이편한', '편한세상',
  // 기타 중견·신규
  '벽산블루밍', '청구', '한솔', '솔파크', '코오롱하늘채', '우성', '삼환', '풍성',
  '삼부', '럭키', '미래', '동아', '풍림', '남광', '상아', '진흥', '한솔솔파크',
  '부영', '대우', '현대', '한라비발디', '한신휴', '쌍용스윗닷홈',
  '오션파크', '센트럴파크', '그랑블',
  '더블루', '에코시티', '리버뷰', '파크뷰', '시티파크', '하이츠', '빌리지',
  '파크리오', '오투', '더시티', '파밀리에', '해모로', '리슈빌', '해피트리',
  '뜨란채', '숲속마을', '센트레빌시티',
  // 공공/임대
  '휴먼빌', 'SH빌', 'LH건설임대',
  // 한국토지주택 / 지역공기업
  '프르지오써밋', '디에이치', '더포레스트', '더클래식', '더케이', '더프라임',
  // 중견 추가
  '어울림', '한진해모로', '무궁화', '삼송더샵', '신안인스빌',
];

// 단지명 변형 생성 (검색 커버리지 향상)
// 예) "성산마을서해그랑블" → ["성산마을서해그랑블","성산마을","서해그랑블","그랑블","성산마을서해그랑블"...]
// 예) "부산 광안 진로비치 아파트" → ["부산광안진로비치","진로비치","부산","광안",...]
// 예) "하안주공7단지" → ["하안주공7단지","하안주공","하안","7단지","하안7단지"]
function generateAptNameVariations(name) {
  if (!name) return [];
  const raw = String(name);
  const cleaned = raw.replace(/\s+/g, '').replace(/아파트|APT|apt/gi, '').replace(/[()[\]]/g, '');
  const variations = new Set([cleaned]);

  // 1) 공백 분리 토큰
  const tokens = raw.split(/\s+/).map(t => t.replace(/아파트|APT|apt/gi, '').replace(/[()[\]]/g, '').trim()).filter(t => t.length >= 2);
  for (const tok of tokens) variations.add(tok);

  // 2) 접두 한글 2~4자 (행정구역 prefix)
  const prefixMatch = cleaned.match(/^([가-힣]{2,4})/);
  const prefix = prefixMatch?.[1];
  if (prefix && prefix !== cleaned) variations.add(prefix);

  // 3) "N단지" 패턴
  const danjiMatch = cleaned.match(/(\d+)\s*단지/);
  if (danjiMatch) {
    variations.add(danjiMatch[1] + '단지');
    if (prefix) variations.add(prefix + danjiMatch[1] + '단지');
  }
  // 4) "N차" 패턴
  const chaMatch = cleaned.match(/(\d+)차/);
  if (chaMatch && prefix) variations.add(prefix + chaMatch[0]);

  // 5) 숫자·단지·차 제거 한글만
  const koreanOnly = cleaned.replace(/\d+|단지|차/g, '').trim();
  if (koreanOnly.length >= 2 && koreanOnly !== cleaned && koreanOnly !== prefix) {
    variations.add(koreanOnly);
  }

  // 6) prefix + 뒷부분
  if (prefix) {
    const afterPrefix = cleaned.slice(prefix.length).replace(/\d+차|\d+단지|\d+/g, '').trim();
    if (afterPrefix.length >= 2) variations.add(prefix + afterPrefix);
  }

  // 7) 공백 분리 토큰 중 가장 긴 한글 토큰 (브랜드)
  const longestKoreanToken = tokens
    .filter(t => /^[가-힣]+$/.test(t))
    .sort((a, b) => b.length - a.length)[0];
  if (longestKoreanToken && longestKoreanToken.length >= 2) {
    variations.add(longestKoreanToken);
    if (prefix && prefix !== longestKoreanToken) {
      variations.add(prefix + longestKoreanToken);
    }
  }

  // 8) ⭐ 브랜드 사전 매칭: cleaned 가 어느 브랜드로 끝나면 그 브랜드 추출
  //    예) "성산마을서해그랑블" → "서해그랑블"
  //    예) "양산2차e편한세상" → "e편한세상"
  for (const brand of APT_BRANDS) {
    if (cleaned.endsWith(brand)) {
      variations.add(brand);
      // prefix(지역) + 브랜드 조합도 추가 (지역 일부 + 브랜드)
      if (prefix && prefix !== brand) {
        variations.add(prefix + brand);
      }
      break;
    }
  }
  // 8b) 브랜드가 중간에 있는 경우 (ex: "래미안영통파크" 가정)
  for (const brand of APT_BRANDS) {
    const idx = cleaned.indexOf(brand);
    if (idx >= 0 && brand.length >= 3) {
      variations.add(brand);
      // 브랜드 뒤 문자열까지 (래미안영통파크 → 래미안영통파크)
      const fromBrand = cleaned.slice(idx);
      if (fromBrand.length >= brand.length + 1 && fromBrand.length <= brand.length + 6) {
        variations.add(fromBrand);
      }
    }
  }

  // 9) ⭐ 접미사 슬라이싱 (브랜드 사전에 없는 아파트 대응)
  //    cleaned 에서 숫자·단지·차 제거 후 뒤 3-5자 추출
  const tailBase = cleaned.replace(/\d+(?:차|단지)?$/g, '').trim();
  for (const len of [5, 4, 3]) {
    if (tailBase.length > len) {
      const tail = tailBase.slice(-len);
      // 순수 한글이어야 의미 있음 (숫자/알파벳은 skip)
      if (/^[가-힣]+$/.test(tail)) variations.add(tail);
    }
  }

  return [...variations].filter(v => v.length >= 2);
}

// data.go.kr 단지명 검색 → 유사도 1/2/3순위 → K-APT 파싱 시도
async function handleBySiteName({ siteName, assignee, ptDate, by, dataGoKrKey }, res) {
  const startedAt = Date.now();
  try {
    // 최근 3년 단지명 검색 (더 많은 후보 확보)
    const year = ptDate ? parseInt(String(ptDate).slice(0, 4), 10) : new Date().getFullYear();
    const allCandidates = [];
    const seen = new Set();
    const variations = generateAptNameVariations(siteName);
    for (const variation of variations) {
      for (const y of [year, year - 1, year - 2]) {
        const params = new URLSearchParams({
          serviceKey: dataGoKrKey,
          hsmpNm: variation,
          srchYear: String(y),
          pageNo: '1',
          numOfRows: '100',
          type: 'json',
        });
        const url = `https://apis.data.go.kr/1613000/ApHusBidResultNoticeInfoOfferServiceV2/getHsmpNmSearchV2?${params}`;
        try {
          const resp = await fetch(url, { headers: { 'User-Agent': 'POUR-Verify/1.0', 'Accept': 'application/json' } });
          if (!resp.ok) continue;
          const data = await resp.json();
          const items = data?.response?.body?.items;
          if (!items) continue;
          const arr = Array.isArray(items) ? items : [items];
          for (const it of arr) {
            if (!seen.has(it.bidNum)) {
              seen.add(it.bidNum);
              allCandidates.push(it);
            }
          }
        } catch (e) { /* continue */ }
      }
    }

    // data.go.kr 0건이면 K-APT 직접 검색 fallback
    // Rate-limit 완화: 변형 중 최대 2개만 시도 (cleaned + longestKoreanToken 또는 prefix)
    // 변형 사이 2초 대기 (K-APT 반복요청 차단 방지)
    let kaptFallbackUsed = false;
    if (allCandidates.length === 0) {
      const kaptVariations = variations.slice(0, 2); // 5+ → 2개로 축소
      for (let vi = 0; vi < kaptVariations.length; vi++) {
        const variation = kaptVariations[vi];
        if (vi > 0) await new Promise(r => setTimeout(r, 2000)); // 2초 대기
        try {
          const kaptCandidates = await searchKaptByAptName(variation, ptDate);
          if (kaptCandidates && kaptCandidates.length > 0) {
            kaptFallbackUsed = true;
            for (const c of kaptCandidates) {
              if (!seen.has(c.bidNum)) {
                seen.add(c.bidNum);
                allCandidates.push(c);
              }
            }
            if (allCandidates.length > 0) break;
          }
        } catch (e) { /* K-APT 검색 실패는 조용히 넘어감 */ }
      }
    }

    if (allCandidates.length === 0) {
      return res.json({
        status: 'needs_review',
        reason: 'site_not_found',
        siteName,
        searched: { years: [year, year - 1, year - 2], kaptFallbackTried: true },
        durationMs: Date.now() - startedAt,
      });
    }

    // === 유사도 점수 + 시기 근접 복합 정렬 ===
    const target = ptDate ? new Date(ptDate).getTime() : Date.now();
    const ONE_YEAR = 365 * 86400 * 1000;
    const ranked = allCandidates
      .map(b => {
        const nameScore = similarityScore(siteName, b.bidKaptname);
        const daysDiff = Math.abs(new Date(b.bidRegdate || 0).getTime() - target) / ONE_YEAR;
        const timeScore = Math.max(0, 1 - daysDiff / 3); // 3년 이상이면 0
        const totalScore = nameScore * 0.7 + timeScore * 0.3;
        return { ...b, _nameScore: nameScore, _timeScore: timeScore, _totalScore: totalScore };
      })
      .filter(b => b._nameScore >= 0.3) // 너무 다른 단지 제외
      .sort((a, b) => b._totalScore - a._totalScore);

    if (ranked.length === 0) {
      return res.json({
        status: 'needs_review',
        reason: 'no_similar_name_candidates',
        siteName,
        totalCandidates: allCandidates.length,
        durationMs: Date.now() - startedAt,
      });
    }

    // === 상위 1/2/3순위를 K-APT에서 파싱 ===
    const top3 = ranked.slice(0, 3);
    const browser = await getBrowser();
    let firstMatch = null;
    const attempts = [];

    for (let rank = 0; rank < top3.length; rank++) {
      if (rank > 0) await new Promise(r => setTimeout(r, 1500)); // rate-limit 완화: 후보간 1.5초 대기
      const bid = top3[rank];
      let context = null;
      try {
        context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          locale: 'ko-KR',
          ignoreHTTPSErrors: true,
        });
        const page = await context.newPage();
        await page.goto('https://www.k-apt.go.kr/', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1000);
        const detailUrl = `https://www.k-apt.go.kr/bid/bidDetail.do?bidNum=${encodeURIComponent(bid.bidNum)}`;
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        const pageText = await page.evaluate(() => document.body?.innerText || '');
        const matched = findOurInText(pageText);
        attempts.push({
          rank: rank + 1,
          bidNum: bid.bidNum,
          bidKaptname: bid.bidKaptname,
          bidTitle: bid.bidTitle,
          bidRegdate: bid.bidRegdate,
          nameScore: Number(bid._nameScore.toFixed(3)),
          timeScore: Number(bid._timeScore.toFixed(3)),
          totalScore: Number(bid._totalScore.toFixed(3)),
          pageTextLength: pageText.length,
          matched,
        });
        if (matched) {
          firstMatch = { rank: rank + 1, bid, matched };
          await context.close();
          break;
        }
        await context.close();
      } catch (e) {
        attempts.push({ rank: rank + 1, bidNum: bid.bidNum, bidKaptname: bid.bidKaptname, error: e.message });
        if (context) await context.close().catch(() => {});
      }
    }

    if (firstMatch) {
      return res.json({
        status: 'verified',
        isOurAnnouncement: true,
        matchedBy: firstMatch.matched.type,
        matchedValue: firstMatch.matched.value,
        matchedRank: firstMatch.rank,
        bidNum: firstMatch.bid.bidNum,
        bidTitle: firstMatch.bid.bidTitle,
        bidKaptname: firstMatch.bid.bidKaptname,
        source: kaptFallbackUsed ? 'kapt_direct_search' : 'siteName_ranked_search',
        rankedAttempts: attempts,
        durationMs: Date.now() - startedAt,
        message: firstMatch.matched.type === 'patent'
          ? `[${firstMatch.rank}순위 "${firstMatch.bid.bidKaptname}"] 공고에서 우리 특허 [${firstMatch.matched.value}] 확인됨`
          : `[${firstMatch.rank}순위 "${firstMatch.bid.bidKaptname}"] 공고에서 우리 공법 [${firstMatch.matched.value}] 확인됨`,
      });
    }

    return res.json({
      status: 'needs_review',
      reason: 'no_our_tech_in_top3_candidates',
      siteName,
      totalCandidates: allCandidates.length,
      rankedAttempts: attempts,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}

app.listen(PORT, () => {
  console.log(`[kapt-playwright-server] listening on :${PORT}`);
  console.log(`[kapt-playwright-server] Auth: ${AUTH_TOKEN === 'change-me-in-production' ? '⚠️ default token! set AUTH_TOKEN env' : 'configured'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});
