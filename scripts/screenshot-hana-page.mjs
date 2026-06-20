import { chromium } from 'playwright';

const URL = 'https://olluq.xyz/manga/hanas-demons-of-lust';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  // Collect all image requests
  const imageRequests = [];
  page.on('response', response => {
    const url = response.url();
    if (url.match(/\.(jpg|jpeg|png|webp)/i) || url.includes('/api/r2/') || url.includes('r2.dev')) {
      imageRequests.push({
        url: url.substring(0, 150),
        status: response.status(),
        contentType: response.headers()['content-type'],
        contentLength: response.headers()['content-length'],
      });
    }
  });

  console.log('📱 Navigating to:', URL);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll to chapter list
  await page.evaluate(() => {
    const chapterSection = document.querySelector('[class*="chapter"], [id*="chapter"]') || 
                          Array.from(document.querySelectorAll('h2, h3')).find(el => el.textContent?.includes('Chapter'));
    if (chapterSection) chapterSection.scrollIntoView({ behavior: 'instant', block: 'start' });
    else window.scrollTo({ top: 800, behavior: 'instant' });
  });
  await page.waitForTimeout(2000);

  // Take screenshot of chapter list area
  await page.screenshot({ path: 'screenshots/hana-chapter-list.png', fullPage: false });
  console.log('✅ Screenshot saved: screenshots/hana-chapter-list.png');

  // Check all chapter thumbnails
  const chapterThumbs = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map(img => ({
      src: img.src?.substring(0, 150),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      displayed: img.offsetWidth > 0,
      alt: img.alt,
    })).filter(img => img.alt?.includes('Chapter'));
  });

  console.log(`\n📊 CHAPTER THUMBNAILS: ${chapterThumbs.length} found`);
  const broken = chapterThumbs.filter(t => t.naturalWidth === 0 && t.naturalHeight === 0);
  const placeholder = chapterThumbs.filter(t => t.naturalWidth <= 1 || t.naturalHeight <= 1);
  const ok = chapterThumbs.filter(t => t.naturalWidth > 1);

  console.log(`   ✅ Working: ${ok.length}`);
  console.log(`   ❌ Broken (0x0): ${broken.length}`);
  console.log(`   ⚠️ Placeholder (1x1): ${placeholder.length}`);

  if (broken.length > 0) {
    console.log('\n❌ BROKEN THUMBNAILS:');
    broken.slice(0, 5).forEach(t => console.log(`   ${t.alt}: ${t.src}`));
  }

  // Show actual proxied URLs being requested
  console.log(`\n📊 IMAGE REQUESTS (${imageRequests.length}):`);
  imageRequests.slice(0, 15).forEach((r, i) => {
    console.log(`   ${i + 1}. [${r.status}] ${r.contentType} ${r.contentLength || '?'}b`);
    console.log(`      ${r.url}`);
  });

  await browser.close();
})();