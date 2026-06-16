/**
 * Check what happens when an already-logged-in user visits /login
 * 
 * Uses Supabase REST API to authenticate with email/password,
 * sets the session cookies, then navigates to /login.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const SITE_URL = 'https://olluq.com';
const EMAIL = 'briyankrnd@gmail.com';
const PASSWORD = '@Kontol2133';

// Read env from .env.local
import { readFileSync } from 'fs';
const envContent = readFileSync('.env.local', 'utf-8');
const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

console.log('Supabase URL:', SUPABASE_URL);
console.log('Email:', EMAIL);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  // ── Step 1: Authenticate via Supabase REST API ──────────────────
  console.log('\n━━━ Step 1: Authenticate via Supabase API ━━━');
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });

  if (authError) {
    console.error('❌ Auth failed:', authError.message);
    await browser.close();
    process.exit(1);
  }

  console.log('✅ Authenticated as:', authData.user.email);
  console.log('   User ID:', authData.user.id);
  console.log('   Session expires:', authData.session.expires_at);

  // ── Step 2: Set Supabase session cookies ────────────────────────
  console.log('\n━━━ Step 2: Set session cookies ━━━');
  
  const session = authData.session;
  // Supabase uses sb-<ref>-auth-token cookie (JSON array) or individual cookies
  // For @supabase/ssr, it uses chunked cookies
  const tokenData = JSON.stringify([
    session.access_token,
    session.refresh_token,
  ]);
  
  // Try both cookie formats
  // Format 1: sb-<project-ref>-auth-token (legacy)
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  
  await context.addCookies([{
    name: cookieName,
    value: encodeURIComponent(tokenData),
    domain: 'olluq.com',
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  }]);

  // Also try base64 encoded version (newer @supabase/ssr format)
  // @supabase/ssr stores as: sb-<ref>-auth-token = base64(JSON([access, refresh]))
  const b64Token = Buffer.from(tokenData).toString('base64');
  await context.addCookies([{
    name: cookieName,
    value: b64Token,
    domain: 'olluq.com',
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  }]);

  console.log('✅ Cookies set:', cookieName);

  // ── Step 3: Visit homepage first to verify login ────────────────
  console.log('\n━━━ Step 3: Visit homepage to verify auth ━━━');
  
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: 'screenshots/login-check/01-home-auth.png' });
  
  // Check if we see the avatar (logged in indicator)
  const pageContent = await page.content();
  const hasLoginButton = pageContent.includes('Masuk');
  const hasAvatar = await page.locator('button[aria-label="User menu"]').count();
  
  console.log('   Has "Masuk" button:', hasLoginButton);
  console.log('   Has user avatar:', hasAvatar > 0);

  // ── Step 4: Navigate to /login ──────────────────────────────────
  console.log('\n━━━ Step 4: Navigate to /login ━━━');
  
  const response = await page.goto(`${SITE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const finalUrl = page.url();
  console.log('   Final URL after /login:', finalUrl);
  console.log('   Response status:', response?.status());
  
  await page.screenshot({ path: 'screenshots/login-check/02-login-page.png' });
  
  // Check what's on the page
  const loginPageContent = await page.content();
  const showsOAuthButtons = loginPageContent.includes('Google') || loginPageContent.includes('google');
  const hasRedirected = !finalUrl.includes('/login');
  
  console.log('\n━━━ RESULT ━━━');
  if (hasRedirected) {
    console.log('✅ GOOD: /login redirects to', finalUrl);
  } else {
    console.log('❌ ISSUE: /login still shows login page for authenticated users');
    console.log('   Shows OAuth buttons:', showsOAuthButtons);
  }

  // ── Step 5: Also check profile page ─────────────────────────────
  console.log('\n━━━ Step 5: Visit /profile to check avatar ━━━');
  
  await page.goto(`${SITE_URL}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: 'screenshots/login-check/03-profile.png' });
  
  const profileUrl = page.url();
  console.log('   Profile URL:', profileUrl);
  
  if (profileUrl.includes('/login')) {
    console.log('❌ ISSUE: /profile redirects to /login — auth cookies not working');
  } else {
    console.log('✅ Profile page accessible');
    // Check avatar image
    const avatarImg = await page.locator('img[alt]').filter({ hasText: /./ }).count();
    console.log('   Images on profile:', avatarImg);
  }

  await browser.close();
  console.log('\n✅ Done! Screenshots saved to screenshots/login-check/');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});