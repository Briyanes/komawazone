/**
 * Mobile visual audit — AUTHENTICATED screenshots
 * Logs in as admin, then captures all public pages in logged-in state.
 * Usage: node scripts/mobile-auth-screenshots.mjs [BASE_URL] [email] [password]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'https://olluq.xyz';
const EMAIL = process.argv[3] || 'briyankrnd@gmail.com';
const PASS = process.argv[4] || '@Kontol2133';
const OUT_DIR = join(__dirname, '..', 'screenshots', 'mobile-auth');

mkdirSync(OUT_DIR, { recursive: true });

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
];

async function run() {
  console.log(`📸 Auth mobile screenshots → ${OUT_DIR}`);
  console.log(`   Base URL: ${BASE}`);
  console.log(`   Email: ${EMAIL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  // ── Step 1: Login ──────────────────────────────────────────────
  console.log('🔐 Logging in...');
  const loginPage = await context.newPage();
  await loginPage.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 20000 });
  await loginPage.waitForTimeout(1500);

  // Fill email
  const emailInput = loginPage.locator('input[type="email"]');
  await emailInput.fill(EMAIL);

  // Fill password
  const passInput = loginPage.locator('input[type="password"]');
  await passInput.fill(PASS);
  await loginPage.waitForTimeout(300);

  // Click submit and wait for navigation
  const submitBtn = loginPage.locator('button[type="submit"]');
  await submitBtn.click();

  // Wait for redirect away from /login
  try {
    await loginPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log(`  ✅ Logged in! Redirected to: ${loginPage.url()}\n`);
  } catch {
    // Check for error messages
    const errorText = await loginPage.locator('[class*="error"], [class*="red"]').textContent().catch(() => null);
    console.log(`  ⚠️  Login may have failed. Current URL: ${loginPage.url()}`);
    if (errorText) console.log(`  Error: ${errorText.trim()}`);
    console.log('');
  }
  await loginPage.waitForTimeout(2000);

  // Save login screenshot for debugging
  await loginPage.screenshot({ path: join(OUT_DIR, '00-after-login.png'), fullPage: true });
  console.log('  ✅ 00-after-login.png');
  await loginPage.close();

  // ── Step 2: Screenshot all pages ───────────────────────────────
  for (const { name, path } of PAGES) {
    const p = await context.newPage();
    try {
      console.log(`  ${name} (${path})...`);
      await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await p.waitForTimeout(1500);
      await p.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
      console.log(`  ✅ ${name}.png`);
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
    }
    await p.close();
  }

  await browser.close();
  console.log(`\n✅ Done! Authenticated screenshots saved to ${OUT_DIR}`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});