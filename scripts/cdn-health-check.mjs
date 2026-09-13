#!/usr/bin/env node
/**
 * cdn-health-check.mjs
 *
 * Auto-detects active CDN domains from manhwaland chapter pages using Playwright.
 * Uses Webshare proxy pool to bypass ISP/Kominfo (Internet Positif) blocks.
 * Tests HTTP status, response time, and image availability for each CDN domain.
 * Outputs a JSON report to docs/cdn-status-report.json
 *
 * Usage:
 *   node scripts/cdn-health-check.mjs                  # Full check (proxy)
 *   node scripts/cdn-health-check.mjs --quick          # Quick (1 chapter)
 *   node scripts/cdn-health-check.mjs --json-only      # JSON output only
 *   node scripts/cdn-health-check.mjs --no-proxy       # Direct (no proxy)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const JSON_ONLY = args.includes('--json-only');
const NO_PROXY = args.includes('--no-proxy');

// Webshare proxy pool — read from PROXY_LIST env var or Webshare rotating endpoint
// Format: host:port:user:pass,host:port:user:pass,...
// Or single rotating endpoint: http://p.webshare.io:80 (auto-rotates IP)
const ENV_PROXY_LIST = process.env.PROXY_LIST || process.env.WEBSHARE_PROXY_LIST;
const WEBSHARE_USER = process.env.WEBSHARE_PROXY_USERNAME;
const WEBSHARE_PASS = process.env.WEBSHARE_PROXY_PASSWORD;
const WEBSHARE_ENDPOINT = process.env.WEBSHARE_PROXY_ENDPOINT || 'p.webshare.io';
const WEBSHARE_PORT = process.env.WEBSHARE_PROXY_PORT || '80';

function buildProxyPool() {
  // Priority 1: Full proxy list from env
  if (ENV_PROXY_LIST) {
    return ENV_PROXY_LIST.split(/[,\n]+/).map(token => {
      const parts = token.trim().split(':');
      if (parts.length < 4) return null;
      const [host, port, username, ...rest] = parts;
      const password = rest.join(':');
      if (!host || !username || !password) return null;
      return { server: `http://${host}:${port}`, username, password };
    }).filter(Boolean);
  }

  // Priority 2: Webshare rotating endpoint (username/password → single endpoint)
  if (WEBSHARE_USER && WEBSHARE_PASS) {
    return [{
      server: `http://${WEBSHARE_ENDPOINT}:${WEBSHARE_PORT}`,
      username: WEBSHARE_USER,
      password: WEBSHARE_PASS,
    }];
  }

  // Priority 3: None (direct)
  return [];
}

const PROXY_POOL = buildProxyPool();

// Known source sites — 04x is the actual content host
const SOURCE_SITES = [
  'https://04x.manhwaland.land',
  'https://manhwaland.store',
  'https://manhwaland.site',
  'https://manhwaland.land',
];

// Historical CDN domains (may be dead)
const KNOWN_CDN_DOMAINS = [
  'gmbr.pro',
  'cdn-okto.gmbr.pro',
  'gmbar.xyz',
  'uwakjawa.xyz',
  'kambingjantan.cc',
  'manhwaland.in',
  'cdn.manhwaland.land',
];

const REPORT_FILE = path.join(__dirname, '..', 'docs', 'cdn-status-report.json');
const LOG_FILE = path.join(__dirname, '..', 'docs', 'cdn-monitor-log.jsonl');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function log(msg) { if (!JSON_ONLY) console.log(msg); }

function getRandomProxy() {
  if (NO_PROXY) return undefined;
  return PROXY_POOL[Math.floor(Math.random() * PROXY_POOL.length)];
}

/**
 * Create browser context with optional proxy
 */
async function createContext(proxy) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 800 },
    locale: 'id-ID',
    ignoreHTTPSErrors: true,
    ...(proxy ? {
      proxy: {
        server: proxy.server,
        username: proxy.username,
        password: proxy.password,
      },
    } : {}),
  });
  return { browser, context };
}

/**
 * Check if current page is ISP-blocked (Internet Positif)
 */
function isISPBlocked(url) {
  return url.includes('internet-positif') || url.includes('trustpositif');
}

/**
 * Navigate to manga pages and discover chapter links
 */
async function discoverChaptersFromMangaPages(context, mangaUrls) {
  const chapterUrls = [];
  const toCheck = [...new Set(mangaUrls)].slice(0, QUICK ? 1 : 3);

  for (const mangaUrl of toCheck) {
    try {
      const page = await context.newPage();
      await page.goto(mangaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      const chapters = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => href.includes('-chapter-'));
      });

      chapterUrls.push(...chapters);
      await page.close();
      if (chapterUrls.length >= (QUICK ? 1 : 5)) break;
    } catch {}
  }

  return [...new Set(chapterUrls)];
}

/**
 * Phase 1: Find working source site with manga links
 */
async function findWorkingSourceSite(context) {
  for (const siteUrl of SOURCE_SITES) {
    log(`  Trying: ${siteUrl}`);
    const page = await context.newPage();
    try {
      await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      if (isISPBlocked(currentUrl)) {
        log(`  🚫 ISP BLOCKED → ${currentUrl.substring(0, 50)}...`);
        await page.close();
        continue;
      }

      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href =>
            (href.includes('/manga/') ||
             href.includes('-sub-indo') ||
             href.includes('-bahasa-indonesia') ||
             href.includes('-chapter-')) &&
            !href.includes('/page/') &&
            !href.includes('/category/') &&
            !href.includes('/genre/') &&
            !href.includes('/tag/')
          );
      });

      if (links.length > 0) {
        const mangaLinks = links.filter(l => !l.includes('-chapter-'));
        log(`  ✅ Found ${links.length} links (${mangaLinks.length} manga, ${links.length - mangaLinks.length} chapters)`);
        await page.close();
        return { siteUrl, chapterUrls: links.filter(l => l.includes('-chapter-')), mangaLinks };
      } else {
        log(`  ⚠️  No manga links found`);
      }
    } catch (e) {
      log(`  ❌ Error: ${e.message.substring(0, 60)}`);
    }
    await page.close();
  }
  return null;
}

/**
 * Phase 2: Analyze chapter pages for CDN domains
 */
async function analyzeChapterPages(context, chapterUrls, workingSourceSite, cdnStats) {
  const chaptersToAnalyze = chapterUrls.slice(0, QUICK ? 1 : 5);

  for (const chapterUrl of chaptersToAnalyze) {
    log(`\n  🔍 Analyzing: ${chapterUrl.substring(0, 80)}...`);
    const page = await context.newPage();

    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (/\.(jpg|jpeg|png|webp|gif|avif)/i.test(url) || contentType.startsWith('image/')) {
        try {
          const hostname = new URL(url).hostname;
          const sourceHost = workingSourceSite.replace(/^https?:\/\//, '').replace(/^www\./, '');
          if (!hostname.includes(sourceHost.split('/')[0])) {
            if (!cdnStats[hostname]) {
              cdnStats[hostname] = { count: 0, statuses: {}, sampleUrl: url, responseTimes: [] };
            }
            cdnStats[hostname].count++;
            const status = response.status();
            cdnStats[hostname].statuses[status] = (cdnStats[hostname].statuses[status] || 0) + 1;
            try {
              const timing = response.request().timing();
              if (timing.responseEnd > 0) {
                cdnStats[hostname].responseTimes.push(Math.round(timing.responseEnd));
              }
            } catch {}
          }
        } catch {}
      }
    });

    try {
      await page.goto(chapterUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      for (let i = 0; i < (QUICK ? 5 : 10); i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(500);
      }
    } catch (e) {
      log(`    ⚠️  Nav error: ${e.message.substring(0, 60)}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Phase 3: HTTP-test detected + known CDN domains
 */
async function testCdnDomains(cdnStats, workingSourceSite) {
  const results = [];

  for (const [hostname, stats] of Object.entries(cdnStats)) {
    const avgResponseTime = stats.responseTimes.length > 0
      ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
      : null;

    let httpStatus = null;
    let httpOk = false;
    try {
      const testRes = await fetch(stats.sampleUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*', 'Referer': workingSourceSite + '/' },
        signal: AbortSignal.timeout(10000),
      });
      httpStatus = testRes.status;
      httpOk = testRes.ok;
    } catch {
      httpStatus = 'ERR';
    }

    results.push({
      hostname,
      imageCount: stats.count,
      browserStatuses: stats.statuses,
      httpTest: { status: httpStatus, ok: httpOk },
      avgResponseTimeMs: avgResponseTime,
      sampleUrl: stats.sampleUrl,
      verdict: httpOk ? 'ALIVE' : (stats.count > 0 ? 'PARTIAL' : 'DEAD'),
    });
  }

  // Test known CDN domains not detected
  const detectedHosts = new Set(results.map(r => r.hostname));
  for (const domain of KNOWN_CDN_DOMAINS) {
    if (!detectedHosts.has(domain)) {
      let status = null, ok = false;
      try {
        const res = await fetch(`https://${domain}/`, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        status = res.status;
        ok = res.ok;
      } catch { status = 'ERR'; }
      results.push({
        hostname: domain,
        imageCount: 0,
        browserStatuses: {},
        httpTest: { status, ok },
        avgResponseTimeMs: null,
        sampleUrl: null,
        verdict: ok ? 'ALIVE' : 'DEAD',
        note: 'Not detected in browser capture',
      });
    }
  }

  return results;
}

/**
 * Save report and log entry
 */
function saveReport(sourceSite, cdnResults) {
  const report = {
    timestamp: new Date().toISOString(),
    sourceSite,
    checkedChapters: QUICK ? 1 : 5,
    cdnDomains: cdnResults,
    summary: {
      total: cdnResults.length,
      alive: cdnResults.filter(r => r.verdict === 'ALIVE').length,
      partial: cdnResults.filter(r => r.verdict === 'PARTIAL').length,
      dead: cdnResults.filter(r => r.verdict === 'DEAD').length,
      bestCdn: cdnResults
        .filter(r => r.verdict === 'ALIVE' && r.imageCount > 0)
        .sort((a, b) => (b.imageCount || 0) - (a.imageCount || 0))[0]?.hostname || null,
    },
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  fs.appendFileSync(LOG_FILE, JSON.stringify({
    timestamp: report.timestamp,
    alive: report.summary.alive,
    dead: report.summary.dead,
    bestCdn: report.summary.bestCdn,
  }) + '\n');

  return report;
}

// ─── Main ───
async function main() {
  log('═══════════════════════════════════════════════════');
  log('  📡 CDN Health Check — Auto-Detect Active Domains');
  log('═══════════════════════════════════════════════════');
  log(`  Mode: ${QUICK ? 'QUICK (1 chapter)' : 'FULL (5 chapters)'}`);

  const proxy = getRandomProxy();
  log(`  🔗 Route: ${proxy ? `via proxy ${proxy.server}` : 'direct (no proxy)'}`);

  log('\n🔍 Phase 1: Finding working source site...');
  const { browser, context } = await createContext(proxy);

  const cdnStats = {};
  let workingSourceSite = null;
  let chapterUrls = [];

  try {
    const result = await findWorkingSourceSite(context);
    if (!result) {
      log('\n  ❌ All source sites failed or blocked!');
      await browser.close();
      if (JSON_ONLY) console.log(JSON.stringify({ error: 'No source site available' }));
      process.exit(1);
    }

    workingSourceSite = result.siteUrl;
    chapterUrls = result.chapterUrls;

    if (chapterUrls.length === 0 && result.mangaLinks?.length > 0) {
      log('\n  📖 Discovering chapters from manga pages...');
      chapterUrls = await discoverChaptersFromMangaPages(context, result.mangaLinks);
    }

    if (chapterUrls.length === 0) {
      log('\n  ❌ No chapter URLs found!');
      await browser.close();
      process.exit(1);
    }

    log(`\n📄 Found ${chapterUrls.length} chapters, analyzing ${QUICK ? 1 : 5}...`);
    log('\n🌐 Phase 2: Detecting CDN domains from chapter pages...');
    await analyzeChapterPages(context, chapterUrls, workingSourceSite, cdnStats);
  } finally {
    await browser.close();
  }

  log('\n🧪 Phase 3: HTTP-testing CDN domains...');
  const cdnResults = await testCdnDomains(cdnStats, workingSourceSite);

  log('\n═══════════════════════════════════════════════════');
  log('  📊 CDN DOMAIN HEALTH REPORT');
  log('═══════════════════════════════════════════════════\n');

  for (const r of cdnResults) {
    const icon = r.verdict === 'ALIVE' ? '✅' : r.verdict === 'PARTIAL' ? '⚠️ ' : '❌';
    const img = r.imageCount > 0 ? `${r.imageCount} imgs` : 'no imgs';
    const ms = r.avgResponseTimeMs ? `${r.avgResponseTimeMs}ms` : '—';
    const http = r.httpTest.status ?? '—';
    log(`  ${icon} ${r.hostname.padEnd(30)} ${img.padEnd(10)} HTTP:${String(http).padEnd(5)} ${ms}`);
  }

  const report = saveReport(workingSourceSite, cdnResults);

  log('\n═══════════════════════════════════════════════════');
  log(`  📁 Report: ${path.relative(process.cwd(), REPORT_FILE)}`);
  log(`  📋 Log:    ${path.relative(process.cwd(), LOG_FILE)}`);
  log(`  🏆 Best:   ${report.summary.bestCdn || 'none detected'}`);
  log(`  ✅ Alive: ${report.summary.alive}  ⚠️  Partial: ${report.summary.partial}  ❌ Dead: ${report.summary.dead}`);
  log('═══════════════════════════════════════════════════');

  if (JSON_ONLY) console.log(JSON.stringify(report));
  process.exit(report.summary.alive > 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});