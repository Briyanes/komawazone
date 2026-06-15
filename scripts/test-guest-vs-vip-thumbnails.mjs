#!/usr/bin/env node
/**
 * Playwright test: Compare chapter thumbnails for Guest vs VIP user
 * 
 * Scenario 1: Guest user visits manga detail — mature chapters locked/blurred
 * Scenario 2: VIP user logs in, visits same manga — all thumbnails clear
 * 
 * Target: https://olluq.xyz (production)
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT_DIR = 'screenshots/guest-vs-vip';
mkdirSync(OUT_DIR, { recursive: true });

// Use production URL since user said "visit ke olluq.xyz"
const BASE = 'https://olluq.xyz';

// Test manga — "Reborn with Big Rizz Energy" (has chapter images + thumbnails)
const MANGA_SLUG = 'reborn-with-big-rizz-energy-reborn-with-big-dick';

const VIP_EMAIL = 'briyankrnd@gmail.com';
const VIP_PASSWORD = '@Kontol2133';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // ═══════════════════════════════════════════════════════════════
  // SCENARIO 1: GUEST USER (not logged in)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n👤 SCENARIO 1: Guest user (not logged in)');
  console.log(`   Visiting: ${BASE}/manga/${MANGA_SLUG}`);
  
  await page.goto(`${BASE}/manga/${MANGA_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Scroll to chapter list
  const chapterSection = page.locator('text=Chapters').first();
  if (await chapterSection.isVisible()) {
    await chapterSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: `${OUT_DIR}/01-guest-manga-detail.png`, fullPage: false });
  console.log('   ✅ Screenshot: 01-guest-manga-detail.png');

  // Analyze locked vs unlocked chapters — include BOTH /manga/ and /vip links
  const guestChapters = await page.locator('a[href*="/manga/"], a[href="/vip"]').evaluateAll(els => {
    return els.filter(el => el.textContent?.includes('Chapter')).slice(0, 10).map(el => {
      const img = el.querySelector('img');
      const lockIcon = el.querySelector('svg.lucide-lock, svg[class*="lock"]');
      const href = el.getAttribute('href');
      const isBlurred = img ? img.style.filter?.includes('blur') : false;
      const hasLockOverlay = !!el.querySelector('[class*="absolute"][class*="inset-0"]');
      return {
        text: el.textContent?.trim().slice(0, 50),
        href,
        hasThumbnail: !!img,
        thumbnailSrc: img?.src?.split('/').pop(),
        isBlurred,
        isLocked: href === '/vip' || !!lockIcon,
      };
    });
  });

  console.log(`   📊 Guest chapter analysis (${guestChapters.length} chapters):`);
  guestChapters.forEach((ch, i) => {
    const status = ch.isLocked ? '🔒 LOCKED' : ch.hasThumbnail ? '✅ Thumbnail' : '❌ No thumb';
    console.log(`     [${i}] ${ch.text?.slice(0, 30)} → ${status}${ch.isBlurred ? ' (blurred)' : ''}`);
  });

  // Count locked chapters
  const lockedCount = guestChapters.filter(c => c.isLocked).length;
  const unlockedCount = guestChapters.length - lockedCount;
  console.log(`   📈 Guest: ${unlockedCount} unlocked, ${lockedCount} locked (blurred)`);

  // ═══════════════════════════════════════════════════════════════
  // SCENARIO 2: VIP USER (logged in)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n👑 SCENARIO 2: VIP user login');
  console.log(`   Email: ${VIP_EMAIL}`);
  
  // Go to login page
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT_DIR}/02-login-page.png`, fullPage: false });
  console.log('   ✅ Screenshot: 02-login-page.png');

  // Fill login form
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  
  if (await emailInput.isVisible() && await passwordInput.isVisible()) {
    await emailInput.fill(VIP_EMAIL);
    await passwordInput.fill(VIP_PASSWORD);
    await page.waitForTimeout(500);

    // Find submit button
    const submitBtn = page.locator('button[type="submit"], button:has-text("Masuk"), button:has-text("Login"), button:has-text("Sign")').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      console.log('   ⏳ Waiting for login...');
      await page.waitForTimeout(5000);
      await page.screenshot({ path: `${OUT_DIR}/03-after-login.png`, fullPage: false });
      console.log('   ✅ Screenshot: 03-after-login.png');
    }
  } else {
    console.log('   ⚠️ Could not find login form fields');
    // Try to see what's on the page
    const pageText = await page.textContent('body');
    console.log('   Page text:', pageText?.slice(0, 200));
  }

  // Now visit manga detail as VIP user
  console.log(`\n   Visiting manga as VIP: ${BASE}/manga/${MANGA_SLUG}`);
  await page.goto(`${BASE}/manga/${MANGA_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Scroll to chapter list
  const chapterSection2 = page.locator('text=Chapters').first();
  if (await chapterSection2.isVisible()) {
    await chapterSection2.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: `${OUT_DIR}/04-vip-manga-detail.png`, fullPage: false });
  console.log('   ✅ Screenshot: 04-vip-manga-detail.png');

  // Analyze chapters as VIP
  const vipChapters = await page.locator('a[href*="/manga/"]').evaluateAll(els => {
    return els.filter(el => el.textContent?.includes('Chapter')).slice(0, 10).map(el => {
      const img = el.querySelector('img');
      const lockIcon = el.querySelector('svg.lucide-lock, svg[class*="lock"]');
      const href = el.getAttribute('href');
      const isBlurred = img ? img.style.filter?.includes('blur') : false;
      return {
        text: el.textContent?.trim().slice(0, 50),
        href,
        hasThumbnail: !!img,
        thumbnailSrc: img?.src?.split('/').pop(),
        isBlurred,
        isLocked: href === '/vip' || !!lockIcon,
      };
    });
  });

  console.log(`   📊 VIP chapter analysis (${vipChapters.length} chapters):`);
  vipChapters.forEach((ch, i) => {
    const status = ch.isLocked ? '🔒 LOCKED' : ch.hasThumbnail ? '✅ Thumbnail' : '❌ No thumb';
    console.log(`     [${i}] ${ch.text?.slice(0, 30)} → ${status}${ch.isBlurred ? ' (blurred)' : ''}`);
  });

  const vipLockedCount = vipChapters.filter(c => c.isLocked).length;
  const vipUnlockedCount = vipChapters.length - vipLockedCount;
  console.log(`   📈 VIP: ${vipUnlockedCount} unlocked, ${vipLockedCount} locked`);

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 COMPARISON SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`Guest: ${unlockedCount} visible, ${lockedCount} locked/blurred`);
  console.log(`VIP:   ${vipUnlockedCount} visible, ${vipLockedCount} locked/blurred`);
  
  if (vipUnlockedCount > unlockedCount) {
    console.log('✅ VIP unlock is working — VIP sees more chapters');
  } else if (vipUnlockedCount === 0 && unlockedCount === 0) {
    console.log('⚠️ Both guest and VIP see 0 unlocked — may not be a mature manga');
  } else {
    console.log('ℹ️ Both see same chapters — manga may not be mature-rated');
  }

  await browser.close();
  console.log('\n✅ All screenshots saved to screenshots/guest-vs-vip/');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});