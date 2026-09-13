#!/usr/bin/env node
import { loadEnv, closeBrowser, getBrowserContext } from '/Users/mac/VSC Project/Manga Zone/scripts/lib/local-import-utils.mjs';
import { chromium } from 'playwright';

loadEnv();

const chapterUrl = 'https://04x-1s.manhwaland.land/aunt-and-me-chapter-aunt-and-me/';

console.log('🔍 Diagnosing chapter page image loading...');
console.log('   URL:', chapterUrl);
console.log('');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 720 },
});

const page = await ctx.newPage();

// Log ALL image responses
const imageResponses = [];
page.on('response', async (resp) => {
  const url = resp.url();
  const ct = resp.headers()['content-type'] || '';
  const status = resp.status();
  if (ct.startsWith('image/') || url.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
    imageResponses.push({ url, status, contentType: ct });
    console.log(`  📷 IMAGE RESPONSE: ${status} ${ct} — ${url.substring(0, 100)}...`);
  }
});

console.log('🌐 Navigating to chapter page...');
try {
  const resp = await page.goto(chapterUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  console.log('   Status:', resp?.status());
} catch (err) {
  console.log('   Navigation error:', err.message);
}

// Wait for network
try {
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
} catch {}

await new Promise(r => setTimeout(r, 3000));

// Scroll to trigger lazy load
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise(r => setTimeout(r, 3000));

// Get ALL img elements from DOM
console.log('');
console.log('=== IMG ELEMENTS IN DOM ===');
const imgs = await page.$$eval('img', (elements) => {
  return elements.map(img => ({
    src: img.src || '',
    dataSrc: img.dataset.src || img.getAttribute('data-src') || '',
    alt: img.alt || '',
    className: img.className || '',
    width: img.naturalWidth || 0,
    height: img.naturalHeight || 0,
  })).filter(i => i.src || i.dataSrc);
});

for (const img of imgs) {
  console.log(`  src="${img.src?.substring(0, 80) || 'NONE'}..." data-src="${img.dataSrc?.substring(0, 80) || ''}" class="${img.className}" ${img.width}x${img.height}`);
}

console.log('');
console.log('=== READERAREA CONTENT ===');
const readerArea = await page.$eval('#readerarea', el => el.innerHTML.substring(0, 2000)).catch(() => 'NOT FOUND');
console.log(readerArea);

console.log('');
console.log('=== ALL IMAGE RESPONSES CAPTURED ===');
console.log(`Total: ${imageResponses.length}`);
for (const r of imageResponses) {
  console.log(`  ${r.status} ${r.contentType} — ${r.url.substring(0, 120)}`);
}

await browser.close();
process.exit(0);