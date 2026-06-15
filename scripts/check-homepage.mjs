#!/usr/bin/env node
/**
 * Quick Playwright check: open olluq.xyz homepage, count manga cards,
 * check for broken images, capture console errors, take screenshot.
 */
import { chromium } from 'playwright';

const URL = 'https://olluq.xyz/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const consoleErrors = [];
  const brokenImages = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().match(/\.(jpg|jpeg|png|webp|gif|svg)/i)) {
      brokenImages.push({ url: res.url(), status: res.status() });
    }
  });

  console.log(`→ Navigating to ${URL} ...`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000); // let lazy images load

  // Count manga cards (MangaCard component renders an <article> or <a> with href to /manga/)
  const mangaLinks = await page.$$eval('a[href*="/manga/"]', (els) =>
    els
      .map((e) => e.getAttribute('href'))
      .filter((h) => h && h.startsWith('/manga/') && h !== '/manga/' && !h.includes('/chapter/'))
  );
  const uniqueManga = [...new Set(mangaLinks)];

  // Count images total and check for broken (no naturalWidth)
  const allImages = await page.$$eval('img', (imgs) =>
    imgs.map((img) => ({
      src: img.src,
      naturalWidth: img.naturalWidth,
      alt: img.alt,
      loaded: img.complete && img.naturalWidth > 0,
    }))
  );

  const totalImages = allImages.length;
  const brokenImgs = allImages.filter((i) => !i.loaded && i.src && !i.src.includes('data:'));
  const loadedImages = totalImages - brokenImgs.length;

  // Check section headings
  const headings = await page.$$eval('h2, h3', (els) => els.map((e) => e.textContent?.trim()).filter(Boolean));

  // Check for 18+ badges
  const matureBadges = await page.$$eval('[class*="18"], [class*="mature"], [class*="badge"]', (els) => els.length);

  // Take screenshot
  await page.screenshot({ path: 'screenshots/homepage-check.png', fullPage: true });

  console.log('\n═══════════════════════════════════════════');
  console.log('         HOMEPAGE CHECK RESULTS');
  console.log('═══════════════════════════════════════════\n');
  console.log(`📊 Manga links found: ${uniqueManga.length}`);
  console.log(`📋 Section headings: ${headings.join(' | ')}`);
  console.log(`🖼️  Images total: ${totalImages}`);
  console.log(`✅ Images loaded: ${loadedImages}`);
  console.log(`❌ Images broken: ${brokenImgs.length}`);

  if (brokenImgs.length > 0) {
    console.log('\n⚠️  Broken image details (first 10):');
    brokenImgs.slice(0, 10).forEach((img) => {
      const url = (img.url || '').toString();
      console.log(`   ${img.status || '?'} | ${url.substring(0, 100)}`);
    });
  }

  console.log(`🔞 Badge elements (18+): ${matureBadges}`);
  console.log(`🚫 Console errors: ${consoleErrors.length}`);

  if (consoleErrors.length > 0) {
    console.log('\n⚠️  Console errors (first 10):');
    consoleErrors.slice(0, 10).forEach((e) => console.log(`   ${e.substring(0, 120)}`));
  }

  console.log(`\n📸 Screenshot: screenshots/homepage-check.png`);
  console.log('\n═══════════════════════════════════════════\n');

  await browser.close();

  // Exit code
  process.exit(consoleErrors.length > 5 || brokenImgs.length > 10 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});