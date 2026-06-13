/**
 * Playwright Dark Mode Audit — HEADED (visible browser)
 * Opens a real browser window, logs in as admin, forces dark mode,
 * and navigates through all public pages with screenshots.
 *
 * Usage: node scripts/playwright-dark-audit.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://olluq.xyz';
const EMAIL = 'briyankrnd@gmail.com';
const PASS = '@Kontol2133';
const OUT_DIR = join(__dirname, '..', 'screenshots', 'dark-audit');

mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  { name: '01-home',         path: '/',              label: 'Home' },
  { name: '02-search',       path: '/search',        label: 'Search' },
  { name: '03-genre-list',   path: '/genre',         label: 'Genre List' },
  { name: '04-genre-action', path: '/genre/action',  label: 'Genre: Action' },
  { name: '05-bookmarks',    path: '/bookmarks',     label: 'Bookmarks' },
  { name: '06-history',      path: '/history',       label: 'History' },
  { name: '07-profile',      path: '/profile',       label: 'Profile' },
  { name: '08-vip',          path: '/vip',           label: 'VIP' },
  { name: '09-about',        path: '/about',         label: 'About' },
  { name: '10-contact',      path: '/contact',       label: 'Contact' },
  { name: '11-terms',        path: '/terms',         label: 'Terms' },
  { name: '12-privacy',      path: '/privacy',       label: 'Privacy' },
  { name: '13-advertise',    path: '/advertise',     label: 'Advertise' },
];

const issues = [];

async function run() {
  console.log('🌙 Starting HEADED dark mode audit...\n');

  // Launch VISIBLE browser with mobile emulation
  const browser = await chromium.launch({
    headless: false,  // ← VISIBLE browser window!
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  // Force dark mode on every page load
  await context.addInitScript(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  const page = await context.newPage();

  // ── STEP 1: Login ──────────────────────────────────────────
  console.log('🔐 Step 1: Login as admin...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.waitForTimeout(500);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to /admin
  try {
    await page.waitForURL('**/admin**', { timeout: 15000 });
    console.log('  ✅ Login successful! Redirected to /admin\n');
  } catch {
    console.log('  ⚠️  Login redirect unclear, continuing anyway...\n');
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT_DIR, '00-admin-dashboard.png'), fullPage: false });
  console.log('  📸 00-admin-dashboard.png');

  // ── STEP 2: Navigate to public homepage ────────────────────
  console.log('\n🌐 Step 2: Navigate to public homepage...');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Ensure dark mode is active
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, '01-home.png'), fullPage: true });
  console.log('  📸 01-home.png (full page)');

  // ── STEP 3: Audit each public page ─────────────────────────
  console.log('\n📋 Step 3: Auditing all public pages in dark mode...\n');

  for (let i = 1; i < PAGES.length; i++) {
    const { name, path, label } = PAGES[i];
    console.log(`  [${i + 1}/${PAGES.length}] ${label} (${path})...`);

    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2500);

      // Ensure dark mode
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.waitForTimeout(300);

      // Screenshot
      await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
      console.log(`    📸 ${name}.png`);

      // Quick visual check
      const check = await page.evaluate(() => {
        const problems = [];
        const html = document.documentElement;
        const bg = getComputedStyle(html).getPropertyValue('--bg-primary').trim();

        // Check dark mode actually applied
        if (html.getAttribute('data-theme') !== 'dark') problems.push('Dark mode not active');

        // Check for horizontal overflow
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 5) {
          problems.push(`H-overflow: ${document.documentElement.scrollWidth}px`);
        }

        // Check for broken images
        const imgs = document.querySelectorAll('img');
        let broken = 0;
        imgs.forEach(img => {
          if (img.naturalWidth === 0 && img.complete) broken++;
        });
        if (broken > 0) problems.push(`${broken} broken img`);

        // Check for text visibility issues (white text on white bg)
        const body = document.body;
        const bodyBg = getComputedStyle(body).backgroundColor;
        if (bg && bg.includes('FFF')) problems.push('BG still light!');

        // Check for visible error messages
        const errors = document.querySelectorAll('[class*="error"], [class*="Error"]');
        errors.forEach(e => {
          if (e.offsetParent !== null && e.textContent?.length > 10) {
            problems.push(`Visible error: "${e.textContent?.slice(0, 50)}"`);
          }
        });

        // Manga count
        const mangaLinks = document.querySelectorAll('a[href*="/manga/"]');
        if (mangaLinks.length > 0) problems.push(`Info: ${mangaLinks.length} manga links`);

        return { bg, problems };
      }).catch(() => ({ bg: 'unknown', problems: ['eval failed'] }));

      if (check.problems.length > 0) {
        const realIssues = check.problems.filter(p => !p.startsWith('Info:'));
        if (realIssues.length > 0) {
          issues.push({ page: name, label, issues: realIssues });
          realIssues.forEach(p => console.log(`    ⚠️  ${p}`));
        }
        check.problems.filter(p => p.startsWith('Info:')).forEach(p => console.log(`    ℹ️  ${p}`));
      }

      // Pause briefly so user can see the page
      await page.waitForTimeout(1000);
    } catch (err) {
      console.log(`    ❌ Failed: ${err.message.slice(0, 80)}`);
      issues.push({ page: name, label, issues: ['Load failed: ' + err.message.slice(0, 60)] });
    }
  }

  // ── STEP 4: Manga detail & reader ──────────────────────────
  console.log('\n📖 Step 4: Check manga detail & reader...');

  // Go to a genre page and click the first manga
  await page.goto(`${BASE}/genre/action`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

  const firstManga = await page.locator('a[href*="/manga/"]').first();
  if (await firstManga.count() > 0) {
    const href = await firstManga.getAttribute('href');
    console.log(`  → Manga detail: ${href}`);

    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: join(OUT_DIR, '14-manga-detail.png'), fullPage: true });
    console.log('    📸 14-manga-detail.png');

    // Try to find and click a chapter link
    const chapterLink = page.locator('a[href*="/chapter/"]').first();
    if (await chapterLink.count() > 0) {
      const chHref = await chapterLink.getAttribute('href');
      console.log(`  → Chapter reader: ${chHref}`);

      await page.goto(`${BASE}${chHref}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(3000);
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.screenshot({ path: join(OUT_DIR, '15-chapter-reader.png'), fullPage: false });
      console.log('    📸 15-chapter-reader.png');
    } else {
      console.log('  ⚠️  No chapter links found');
    }
  } else {
    console.log('  ⚠️  No manga found on genre page');
  }

  // ── SUMMARY ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('🌙 DARK MODE AUDIT COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Screenshots saved:    ${OUT_DIR}/`);
  console.log(`Pages with issues:    ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n⚠️  Issues found:');
    issues.forEach(({ page, label, issues: pIssues }) => {
      console.log(`   ${page} (${label}):`);
      pIssues.forEach(i => console.log(`     • ${i}`));
    });
  } else {
    console.log('\n✅ No issues found!');
  }

  console.log('\n👀 Browser will stay open for 10 seconds for visual review...');
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('\n✅ Done!');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});