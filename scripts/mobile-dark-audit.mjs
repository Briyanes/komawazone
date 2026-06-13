/**
 * Mobile dark mode audit — login as admin, force dark theme, screenshot all public pages
 * Also captures console errors and failed images for diagnostics.
 * Usage: node scripts/mobile-dark-audit.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://olluq.xyz';
const EMAIL = 'briyankrnd@gmail.com';
const PASS = '@Kontol2133';
const OUT_DIR = join(__dirname, '..', 'screenshots', 'mobile-dark');

mkdirSync(OUT_DIR, { recursive: true });

// Pages to screenshot — order matters for the report
const PAGES = [
  { name: '01-home',          path: '/' },
  { name: '02-search',        path: '/search' },
  { name: '03-genre-list',    path: '/genre' },
  { name: '04-genre-detail',  path: '/genre/action' },
  { name: '05-bookmarks',     path: '/bookmarks' },
  { name: '06-history',       path: '/history' },
  { name: '07-profile',       path: '/profile' },
  { name: '08-vip',           path: '/vip' },
  { name: '09-about',         path: '/about' },
  { name: '10-contact',       path: '/contact' },
  { name: '11-terms',         path: '/terms' },
  { name: '12-privacy',       path: '/privacy' },
  { name: '13-advertise',     path: '/advertise' },
  { name: '14-login',         path: '/login' },
  { name: '15-register',      path: '/register' },
];

const report = {
  brokenImages: [],
  consoleErrors: [],
  pageIssues: [],
};

async function run() {
  console.log(`🌙 Dark mode mobile audit → ${OUT_DIR}`);
  console.log(`   Base URL: ${BASE}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });

  // Inject dark mode before every page load
  await context.addInitScript(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  // ── Login ──────────────────────────────────────────────────────
  console.log('🔐 Logging in...');
  const loginPage = await context.newPage();

  // Capture console errors
  context.on('weberror', (err) => {
    report.consoleErrors.push(`WebError: ${err.message}`);
  });

  await loginPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await loginPage.waitForTimeout(2000);
  await loginPage.locator('input[type="email"]').fill(EMAIL);
  await loginPage.locator('input[type="password"]').fill(PASS);
  await loginPage.waitForTimeout(300);
  await loginPage.locator('button[type="submit"]').click();

  try {
    await loginPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log(`  ✅ Logged in! At: ${loginPage.url()}`);
  } catch {
    console.log(`  ⚠️  Login may have failed.`);
  }
  await loginPage.waitForTimeout(2000);

  // Navigate to home explicitly (not admin dashboard)
  console.log('  → Navigating to home page...\n');
  await loginPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await loginPage.waitForTimeout(2000);
  await loginPage.screenshot({ path: join(OUT_DIR, '00-after-login-home.png'), fullPage: true });
  console.log('  ✅ 00-after-login-home.png');
  await loginPage.close();

  // ── Screenshot all pages ───────────────────────────────────────
  for (const { name, path } of PAGES) {
    const p = await context.newPage();

    // Track broken images on this page
    const pageBrokenImages = [];
    p.on('response', (response) => {
      if (response.status() >= 400 && response.url().match(/\.(jpg|jpeg|png|webp|gif)/i)) {
        pageBrokenImages.push({ url: response.url().slice(0, 120), status: response.status() });
      }
    });

    // Track console errors on this page
    const pageConsoleErrors = [];
    p.on('console', (msg) => {
      if (msg.type() === 'error') {
        pageConsoleErrors.push(msg.text().slice(0, 200));
      }
    });

    try {
      console.log(`  ${name} (${path})...`);
      await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await p.waitForTimeout(3000);
      await p.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
      console.log(`  ✅ ${name}.png`);

      // Check for visible issues
      const issues = await p.evaluate(() => {
        const problems = [];

        // Check for placeholder emoji (broken manga covers)
        const placeholders = document.querySelectorAll('div[class*="flex"][class*="items-center"]');
        let placeholderCount = 0;
        placeholders.forEach(el => {
          if (el.textContent?.trim() === '📖') placeholderCount++;
        });
        if (placeholderCount > 0) problems.push(`${placeholderCount} broken cover image(s) (📖)`);

        // Check for empty manga grids
        const mangaCards = document.querySelectorAll('a[href*="/manga/"]');
        if (path.includes('genre') && mangaCards.length === 0) problems.push('No manga in this category');

        // Check for horizontal overflow
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        if (scrollWidth > clientWidth + 5) problems.push(`Horizontal overflow: ${scrollWidth}px > ${clientWidth}px`);

        // Check dark mode is active
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (!isDark) problems.push('Dark mode NOT active!');

        // Check for pagination
        const hasPagination = !!document.querySelector('[class*="pagination"], [class*="Pagination"], [aria-label*="pagination"]');
        const mangaCount = document.querySelectorAll('a[href*="/manga/"]').length;
        if (mangaCount > 20 && !hasPagination) problems.push(`${mangaCount} manga shown, no pagination`);

        return problems;
      }).catch(() => []);

      if (issues.length > 0) {
        report.pageIssues.push({ page: name, path, issues });
        issues.forEach(i => console.log(`     ⚠️  ${i}`));
      }
      if (pageBrokenImages.length > 0) {
        report.brokenImages.push({ page: name, images: pageBrokenImages.slice(0, 5) });
        console.log(`     🖼️  ${pageBrokenImages.length} broken image(s)`);
      }
      if (pageConsoleErrors.length > 0) {
        report.consoleErrors.push({ page: name, errors: pageConsoleErrors.slice(0, 3) });
      }
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message.slice(0, 80)}`);
      report.pageIssues.push({ page: name, path, issues: ['Page failed to load: ' + err.message.slice(0, 100)] });
    }
    await p.close();
  }

  // ── Write report ───────────────────────────────────────────────
  writeFileSync(join(OUT_DIR, 'audit-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n📋 Audit report saved to ${OUT_DIR}/audit-report.json`);

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('DARK MODE MOBILE AUDIT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Pages with issues:    ${report.pageIssues.length}`);
  console.log(`Broken image sets:    ${report.brokenImages.length}`);
  console.log(`Console error sets:   ${report.consoleErrors.length}`);

  if (report.pageIssues.length > 0) {
    console.log('\n⚠️  Issues found:');
    report.pageIssues.forEach(({ page, issues }) => {
      issues.forEach(i => console.log(`   ${page}: ${i}`));
    });
  }

  await browser.close();
  console.log(`\n✅ Done! Screenshots in ${OUT_DIR}`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});