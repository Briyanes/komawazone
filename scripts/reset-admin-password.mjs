#!/usr/bin/env node
/**
 * Reset admin password + login via browser-side Supabase client + screenshot dashboard
 *
 * Strategy: Navigate to the site first, then use page.evaluate() to call
 * supabase.auth.signInWithPassword() from the browser context.
 * This lets @supabase/ssr set cookies in the correct format automatically.
 */
import { readFileSync } from 'fs';
import { chromium } from 'playwright';

// Load .env.local manually
const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) {
    env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = 'https://qxevzzxjpdoryupeborm.supabase.co';
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SERVICE_KEY || !ANON_KEY) {
  console.error('❌ Missing Supabase keys in .env.local');
  process.exit(1);
}

const NEW_PASSWORD = 'AdminOlluq2026!';

async function getAdminUserId() {
  console.log('=== Finding admin user ===');
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?perPage=100`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );
  const data = await res.json();
  const users = data.users || [];

  const admin = users.find((u) => u.email === 'admin@olluq.com');
  if (!admin) {
    console.error('❌ admin@olluq.com not found!');
    process.exit(1);
  }

  console.log(`✅ Found: ${admin.email} (id: ${admin.id})`);
  return admin;
}

async function resetPassword(userId) {
  console.log('\n=== Resetting password ===');
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    {
      method: 'PUT',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: NEW_PASSWORD }),
    }
  );

  if (res.ok) {
    console.log(`✅ Password reset to: ${NEW_PASSWORD}`);
  } else {
    console.error(`❌ Reset failed: ${await res.text()}`);
    process.exit(1);
  }
}

async function loginAndScreenshot() {
  console.log('\n=== Starting Playwright browser ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // Step 1: Navigate to any page on the site to establish origin
    console.log('1. Navigating to homepage to establish origin...');
    await page.goto('https://olluq.xyz', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('   ✅ Homepage loaded');

    // Step 2: Login via browser-side fetch to Supabase API
    // This sets cookies in @supabase/ssr format automatically
    console.log('2. Signing in via browser-side Supabase API...');
    const loginResult = await page.evaluate(async ({ url, key, email, pass }) => {
      try {
        const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password: pass }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || data.message || 'Unknown error' };

        // Now set cookies manually in the exact format @supabase/ssr expects
        // @supabase/ssr stores: sb-<ref>-auth-token = base64(JSON.stringify(session))
        const projectRef = url.split('//')[1].split('.')[0];
        const cookieName = `sb-${projectRef}-auth-token`;

        // Try both raw JSON and base64 encoded
        const sessionStr = JSON.stringify(data);

        // Set as regular cookie (the SSR client reads this)
        document.cookie = `${cookieName}=${encodeURIComponent(sessionStr)}; path=/; domain=.olluq.xyz; SameSite=Lax; Secure`;

        return {
          success: true,
          email: data.user?.email,
          cookieName,
          cookieLength: sessionStr.length,
        };
      } catch (e) {
        return { error: e.message };
      }
    }, {
      url: SUPABASE_URL,
      key: ANON_KEY,
      email: 'admin@olluq.com',
      pass: NEW_PASSWORD,
    });

    console.log('   Result:', JSON.stringify(loginResult, null, 2));

    if (loginResult.error) {
      console.error(`❌ Login failed: ${loginResult.error}`);
      await browser.close();
      return;
    }

    console.log(`   ✅ Session set for: ${loginResult.email}`);

    // Step 3: Reload to let middleware read the cookie
    console.log('3. Reloading page to apply session...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Step 4: Navigate to /admin
    console.log('4. Navigating to /admin...');
    await page.goto('https://olluq.xyz/admin', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const adminUrl = page.url();
    const title = await page.title();
    console.log(`   URL: ${adminUrl}`);
    console.log(`   Title: ${title}`);

    await page.screenshot({
      path: 'screenshots/admin-dashboard.png',
      fullPage: true,
    });
    console.log('   ✅ Screenshot saved: screenshots/admin-dashboard.png');

    // Check if we're still on login page
    if (adminUrl.includes('/login')) {
      console.log('   ⚠️ Redirected to login. Trying cookie approach #2...');

      // Try using the server-side cookie format (chunked)
      // @supabase/ssr v5+ uses multiple cookies if token > 3KB
      const sessionRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'admin@olluq.com',
          password: NEW_PASSWORD,
        }),
      });
      const session = await sessionRes.json();

      // Set cookies in chunked format
      const projectRef = 'qxevzzxjpdoryupeborm';
      const tokenData = JSON.stringify(session);
      const chunkSize = 2800; // Leave room for cookie metadata

      if (tokenData.length > chunkSize) {
        // Split into chunks
        const chunks = Math.ceil(tokenData.length / chunkSize);
        for (let i = 0; i < chunks; i++) {
          const chunk = tokenData.slice(i * chunkSize, (i + 1) * chunkSize);
          const name = chunks === 1
            ? `sb-${projectRef}-auth-token`
            : `sb-${projectRef}-auth-token.${i}`;
          await context.addCookies([{
            name,
            value: chunk,
            domain: '.olluq.xyz',
            path: '/',
            httpOnly: false,
            secure: true,
            sameSite: 'Lax',
          }]);
        }
      } else {
        await context.addCookies([{
          name: `sb-${projectRef}-auth-token`,
          value: tokenData,
          domain: '.olluq.xyz',
          path: '/',
          httpOnly: false,
          secure: true,
          sameSite: 'Lax',
        }]);
      }

      console.log('   Navigating to /admin with chunked cookies...');
      await page.goto('https://olluq.xyz/admin', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(5000);

      const url2 = page.url();
      console.log(`   URL: ${url2}`);
      await page.screenshot({ path: 'screenshots/admin-dashboard-v2.png', fullPage: true });

      if (url2.includes('/login')) {
        console.log('   ⚠️ Still redirected. Taking login screenshot for reference.');
      }
    }

    // Check content
    const bodyText = (await page.textContent('body')) || '';
    const hasDashboard = bodyText.includes('Dashboard') || bodyText.includes('Manga Terbaru');
    console.log(`   Admin content: ${hasDashboard ? '✅ YES' : '❌ NO'}`);

    // If admin is accessible, screenshot sub-pages
    if (!page.url().includes('/login')) {
      const subPages = [
        { path: '/admin/manga', name: 'manga' },
        { path: '/admin/users', name: 'users' },
        { path: '/admin/import', name: 'import' },
        { path: '/admin/settings', name: 'settings' },
      ];
      for (const sub of subPages) {
        console.log(`\n   Screenshot ${sub.path}...`);
        await page.goto(`https://olluq.xyz${sub.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: `screenshots/admin-${sub.name}.png`,
          fullPage: true,
        });
        console.log(`   ✅ screenshots/admin-${sub.name}.png`);
      }
    }

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    await page.screenshot({ path: 'screenshots/admin-error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
}

// Main
(async () => {
  const admin = await getAdminUserId();
  await resetPassword(admin.id);
  await loginAndScreenshot();

  console.log('\n=== DONE ===');
  console.log('Admin login credentials:');
  console.log(`  Email: admin@olluq.com`);
  console.log(`  Password: ${NEW_PASSWORD}`);
})();