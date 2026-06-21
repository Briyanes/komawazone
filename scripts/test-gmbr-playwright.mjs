/**
 * Test: Download gmbr.pro image via Playwright (real browser)
 * This bypasses Cloudflare/anti-bot because it renders JS + handles cookies
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const TARGET_URL = 'https://04x.manhwaland.land/im-the-only-man-on-the-military-base-chapter-1/';
const IMAGE_PATTERN = 'api-l.gmbr.pro';

async function main() {
  console.log('🚀 Launching Playwright browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'id-ID',
    extraHTTPHeaders: {
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  const page = await context.newPage();

  // Intercept image requests
  let downloadedImages = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes(IMAGE_PATTERN) && response.status() === 200) {
      console.log(`  ✅ Image loaded: ${url.split('/').pop()} (${response.headers()['content-type']})`);
      try {
        const buffer = await response.body();
        downloadedImages.push({ url, buffer, size: buffer.length });
      } catch (e) {
        console.log(`  ⚠️ Could not get body: ${e.message}`);
      }
    }
  });

  console.log(`📖 Navigating to: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('⏳ Waiting for Cloudflare challenge...');
  await page.waitForTimeout(5000);

  // Scroll to trigger lazy loading
  console.log('📜 Scrolling to load all images...');
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1000);
  }

  console.log(`\n📊 Results: ${downloadedImages.length} images downloaded`);
  if (downloadedImages.length > 0) {
    console.log(`   First image size: ${downloadedImages[0].size} bytes`);
    writeFileSync('/tmp/gmbr_playwright_001.jpg', downloadedImages[0].buffer);
    console.log('   ✅ Saved to /tmp/gmbr_playwright_001.jpg');
  } else {
    console.log('   ❌ No images captured');

    // Check page title for Cloudflare
    const title = await page.title();
    console.log(`   Page title: "${title}"`);

    // Check for Cloudflare challenge elements
    const cfPresent = await page.evaluate(() => {
      return {
        cfChallenge: !!document.querySelector('#challenge-running, .cf-browser-verification'),
        bodyText: document.body?.innerText?.substring(0, 500),
      };
    });
    console.log('   Cloudflare challenge:', cfPresent.cfChallenge);
    console.log('   Body text:', cfPresent.bodyText);
  }

  await browser.close();
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});