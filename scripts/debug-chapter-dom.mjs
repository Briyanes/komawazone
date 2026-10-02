#!/usr/bin/env node
/**
 * Debug: dump struktur gambar halaman chapter (img attrs, natural dims,
 * noscript, ts_reader) — untuk mengetahui kenapa halaman asli tak tertangkap.
 *
 * Usage: node scripts/debug-chapter-dom.mjs [url]
 */
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://www.manhwaindo.my/calamity-summoner-chapter-1/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
});
const page = await context.newPage();

const imageResponses = [];
page.on('response', (res) => {
  const u = res.url();
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)) {
    imageResponses.push({ status: res.status(), url: u.slice(0, 130) });
  }
});

console.log(`[debug] buka ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(15_000);

// Paksa lazy-load seperti worker
await page.evaluate(async () => {
  document.querySelectorAll('img[data-src]').forEach((img) => {
    if (img.getAttribute('src') !== img.getAttribute('data-src')) img.setAttribute('src', img.getAttribute('data-src'));
  });
  for (let y = 0; y <= document.body.scrollHeight; y += 800) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 200));
  }
});
await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(5_000);

const info = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')].map((img) => ({
    src: (img.getAttribute('src') || '').slice(0, 110),
    dataSrc: (img.getAttribute('data-src') || '').slice(0, 110),
    nw: img.naturalWidth, nh: img.naturalHeight,
    cls: (img.className || '').slice(0, 40),
    alt: (img.alt || '').slice(0, 20),
    parent: (img.closest('div')?.id || img.closest('div')?.className || '').toString().slice(0, 50),
  }));
  const readerarea = document.querySelector('#readerarea');
  const noscripts = readerarea ? readerarea.querySelectorAll('noscript').length : -1;
  const noscriptSample = readerarea && noscripts > 0
    ? (readerarea.querySelector('noscript').innerHTML || '').slice(0, 400) : '';
  const tsReader = (document.documentElement.innerHTML.match(/ts_reader\.run\(/) || [null])[0];
  return { title: document.title.slice(0, 60), imgCount: imgs.length, imgs, noscripts, noscriptSample, tsReader };
});

console.log(`\n[debug] title: ${info.title}`);
console.log(`[debug] total <img>: ${info.imgCount}, noscript di #readerarea: ${info.noscripts}, ts_reader: ${info.tsReader}`);
console.log('\n[debug] IMG di halaman:');
for (const i of info.imgs) {
  console.log(`  ${String(i.nw).padStart(5)}x${String(i.nh).padEnd(5)} cls="${i.cls}" alt="${i.alt}"`);
  console.log(`      src: ${i.src || '-'}`);
  if (i.dataSrc) console.log(`      data-src: ${i.dataSrc}`);
}
if (info.noscriptSample) console.log(`\n[debug] sample noscript:\n${info.noscriptSample}`);
console.log(`\n[debug] respons gambar tertangkap: ${imageResponses.length}`);
for (const r of imageResponses.slice(0, 15)) console.log(`  ${r.status} ${r.url}`);

await browser.close();
