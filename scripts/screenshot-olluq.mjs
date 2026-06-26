/**
 * Buka https://olluq.xyz dengan Playwright dan ambil screenshot
 */
import { chromium } from 'playwright';

const SITE = 'https://olluq.xyz';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'id-ID',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const failedImages = [];
  page.on('response', (resp) => {
    const url = resp.url();
    if (url.match(/\.(jpg|jpeg|png|webp|gif)/i) || url.includes('/api/r2/image/')) {
      if (resp.status() >= 400) {
        failedImages.push({ url: url.slice(0, 100), status: resp.status() });
      }
    }
  });

  // ── 1. HOMEPAGE ──────────────────────────────────────────
  console.log('📄 Membuka homepage...');
  await page.goto(SITE, { waitUntil: 'commit', timeout: 60000 });
  console.log('  ✅ Connected! Waiting for content...');
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'screenshots/olluq-homepage.png', fullPage: false });
  console.log('  ✅ Screenshot: screenshots/olluq-homepage.png');

  const homeImgCount = await page.locator('img').count();
  console.log(`  📸 Total images di homepage: ${homeImgCount}`);

  // ── 2. MANGA DETAIL ──────────────────────────────────────
  console.log('\n📄 Membuka manga detail (hana)...');
  await page.goto(`${SITE}/manga/hana`, { waitUntil: 'commit', timeout: 60000 });
  console.log('  ✅ Connected! Waiting for chapter list...');
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'screenshots/olluq-manga-hana.png', fullPage: false });
  console.log('  ✅ Screenshot: screenshots/olluq-manga-hana.png');

  const chapterImgs = await page.locator('img[src*="r2/image"]').count();
  const deadHostImgs = await page.locator('img[src*="gmbr.pro"], img[src*="gmbar.xyz"], img[src*="uwakjawa.xyz"]').count();
  console.log(`  📸 R2 thumbnails: ${chapterImgs}`);
  console.log(`  🚫 Dead-host thumbnails: ${deadHostImgs}`);

  // ── 3. CHAPTER READER ────────────────────────────────────
  console.log('\n📄 Mencoba buka chapter reader...');
  const chapterLink = await page.locator('a[href*="/chapter/"]').first().getAttribute('href').catch(() => null);
  if (chapterLink) {
    const readerUrl = chapterLink.startsWith('http') ? chapterLink : `${SITE}${chapterLink}`;
    await page.goto(readerUrl, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: 'screenshots/olluq-chapter-reader.png', fullPage: false });
    console.log(`  ✅ Screenshot: screenshots/olluq-chapter-reader.png (${chapterLink})`);

    const readerImgs = await page.locator('img[src*="r2/image"]').count();
    console.log(`  📸 R2 images di reader: ${readerImgs}`);
  } else {
    console.log('  ⚠️ Tidak ada link chapter ditemukan');
  }

  // ── SUMMARY ──────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  if (failedImages.length === 0) {
    console.log('  ✅ Tidak ada image gagal load!');
  } else {
    console.log(`  ❌ ${failedImages.length} image gagal load:`);
    failedImages.slice(0, 10).forEach(f => console.log(`     ${f.status}: ${f.url}`));
    if (failedImages.length > 10) console.log(`     ... dan ${failedImages.length - 10} lainnya`);
  }
  console.log('═'.repeat(60));

  await browser.close();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});