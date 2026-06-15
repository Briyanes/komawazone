#!/usr/bin/env node
/**
 * Playwright test: Verify chapter thumbnails are correct
 * - Screenshot manga detail page with chapter list
 * - Screenshot chapter reader to compare 5th page
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT_DIR = 'screenshots/thumbnail-verify';
mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });

  // ── Test 1: "Not at School, Please" (no images, thumbnail should show placeholder) ──
  console.log('\n📸 Test 1: Not at School, Please');
  console.log('   (chapters have 0 images — should show placeholder)');
  console.log('   Loading page (first compile may take a while)...');
  await page.goto(`${BASE}/manga/not-at-school-please`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Scroll to chapter list
  const chapterList = page.locator('[class*="chapter"], section:has-text("Chapter")').first();
  if (await chapterList.isVisible()) {
    await chapterList.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: `${OUT_DIR}/01-not-at-school-detail.png`, fullPage: false });
  console.log('   ✅ Screenshot saved: 01-not-at-school-detail.png');

  // Check chapter thumbnails
  const thumbnails = await page.locator('img[src*="chapters/"], img[src*="r2."]').count();
  console.log(`   Chapter thumbnail images found: ${thumbnails}`);

  // ── Test 2: "Reborn with Big Rizz Energy" (has thumbnail set to 5th image) ──
  console.log('\n📸 Test 2: Reborn with Big Rizz Energy');
  console.log('   (chapter 459 has thumbnail = 5th image)');
  await page.goto(`${BASE}/manga/reborn-with-big-rizz-energy-reborn-with-big-dick`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Scroll to chapter list
  const chapterSection = page.locator('section, div').filter({ hasText: /Chapter/i }).first();
  if (await chapterSection.isVisible()) {
    await chapterSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: `${OUT_DIR}/02-rizz-energy-detail.png`, fullPage: false });
  console.log('   ✅ Screenshot saved: 02-rizz-energy-detail.png');

  // Extract chapter thumbnail src URLs
  const chapterImgs = await page.locator('img[src*="chapters/"]').evaluateAll(els =>
    els.map(el => ({ src: el.src?.split('/').pop(), alt: el.alt }))
  );
  console.log(`   Chapter thumbnails on page: ${chapterImgs.length}`);
  chapterImgs.slice(0, 5).forEach((img, i) => {
    console.log(`     [${i}] ${img.src} (alt: ${img.alt?.slice(0, 30)})`);
  });

  // ── Test 3: Open chapter reader to see 5th page ──
  console.log('\n📸 Test 3: Open chapter reader for visual comparison');
  // Try to find and click first chapter link
  const chapterLink = page.locator('a[href*="/chapter/"]').first();
  const href = await chapterLink.getAttribute('href');
  if (href) {
    console.log(`   Opening: ${href}`);
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT_DIR}/03-chapter-reader.png`, fullPage: false });
    console.log('   ✅ Screenshot saved: 03-chapter-reader.png');

    // Count reader images
    const readerImgs = await page.locator('img[src*="chapters/"]').count();
    console.log(`   Reader page images: ${readerImgs}`);
  }

  await browser.close();
  console.log('\n✅ All screenshots saved to screenshots/thumbnail-verify/');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});