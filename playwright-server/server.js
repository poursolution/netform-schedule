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
import 'dotenv/config';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'change-me-in-production';

const OUR_TECHNOLOGIES = ['POUR', 'CNC', 'DO', 'DETEX', '시멘트분말'];
const OUR_PATENT_NUMBERS = new Set([
  '10-1520738', '10-1703553', '10-1828211', '10-1831299', '10-1883132',
  '10-1885983', '10-1905536', '10-1923102', '10-1935719', '10-1994773',
  '10-2119347', '10-2122691', '10-2122700', '10-2272203', '10-2274045',
  '10-2320426', '10-2345836', '10-2398289', '10-2398296', '10-2398304',
  '10-2425081', '10-2425088', '10-2474761', '10-2516517', '10-2532155',
  '10-2535699', '10-2536398', '10-2539919', '10-2541308', '10-2544157',
  '10-2544161', '10-2562854', '10-2562855', '10-2574833', '10-2574836',
  '10-2586662', '10-2603257', '10-2614027', '10-2643734', '10-2664685',
  '10-2664703', '10-2694890', '10-2680047', '10-2677910', '10-2699417',
  '10-2709702', '10-2709705', '10-2715409', '10-2743867', '10-2780472',
  '10-2784426', '10-2793770', '10-2803706', '10-2805601', '10-2820585',
  '10-2816037', '10-2826539', '10-2844945', '10-2846086', '10-2856577',
  '10-2856580', '10-2856581', '10-2856582', '10-2856572', '10-2859388',
  '10-2856575', '10-2859385', '10-2859386', '10-2859390', '10-2861078',
  '10-2862312', '10-2865278', '10-2865281', '10-2870425', '10-2870421',
  '10-2869493', '10-2888024', '10-2893921', '10-2896797', '10-2900226',
  '10-2907890', '10-2914079', '10-2917109', '10-2917107', '10-2937091',
]);

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
    version: '1.0.0',
    ourTechnologies: OUR_TECHNOLOGIES,
    ourPatentCount: OUR_PATENT_NUMBERS.size,
    hasAuth: AUTH_TOKEN !== 'change-me-in-production',
  });
});

// K-APT 공고 상세 페이지 접근 + PDF 파싱 + 우리 공법/특허 매칭
app.post('/verify', requireAuth, async (req, res) => {
  const { bidNum, siteName, assignee, ptDate, by } = req.body || {};
  if (!bidNum) return res.status(400).json({ error: 'bidNum required' });

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

    // PDF 다운로드 + 파싱 (세션 쿠키 공유)
    for (const att of attachments.slice(0, 3)) {
      if (!/\.pdf/i.test(att.href)) {
        attachResults.push({ href: att.href, text: att.text, skipped: 'non-pdf' });
        continue;
      }
      try {
        const buffer = await page.request.get(att.href, { timeout: 30000 }).then(r => r.body());
        const data = await pdf(buffer);
        const pdfText = (data.text || '').slice(0, 30000);
        combinedText += '\n\n[PDF: ' + att.text + ']\n' + pdfText;
        attachResults.push({ href: att.href, text: att.text, pdfLength: pdfText.length });
      } catch (e) {
        attachResults.push({ href: att.href, text: att.text, error: e.message });
      }
    }

    // 우리 공법/특허 매칭
    const matched = findOurInText(combinedText);
    const duration = Date.now() - startedAt;

    await context.close();

    if (matched) {
      return res.json({
        status: 'verified',
        isOurAnnouncement: true,
        matchedBy: matched.type,
        matchedValue: matched.value,
        bidNum,
        pageTextLength: pageText.length,
        attachmentCount: attachResults.length,
        durationMs: duration,
        message: matched.type === 'patent'
          ? `공고에서 우리 특허 [${matched.value}] 확인됨`
          : `공고에서 우리 공법 [${matched.value}] 확인됨`,
      });
    }

    return res.json({
      status: 'needs_review',
      reason: 'no_our_tech_in_announcement',
      bidNum,
      pageTextLength: pageText.length,
      attachmentCount: attachResults.length,
      attachments: attachResults,
      durationMs: duration,
      pageTextPreview: pageText.slice(0, 500),
    });
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

function findOurInText(text) {
  if (!text) return null;
  for (const tech of OUR_TECHNOLOGIES) {
    if (containsTechnology(text, tech)) return { type: 'technology', value: tech };
  }
  const matches = text.matchAll(/10-\d{7}/g);
  for (const m of matches) {
    if (OUR_PATENT_NUMBERS.has(m[0])) return { type: 'patent', value: m[0] };
  }
  return null;
}

function containsTechnology(text, tech) {
  if (!text || !tech) return false;
  if (/[가-힣]/.test(tech)) return text.includes(tech);
  const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^A-Z가-힣])${escaped}([^A-Z가-힣]|$)`, 'i');
  return re.test(text);
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
