import { chromium } from 'playwright';

const URL = 'https://olluq.xyz/manga/from-weakling-to-nemesis/chapter/f1249f5d-e378-40f6-94dc-7d8c30dee4d3';
const SCREENSHOT_DIR = 'screenshots/chapter-reader';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 }, // iPhone 14 Pro Max size
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  console.log('📱 Navigating to chapter reader...');
  console.log(`   URL: ${URL}\n`);

  // Collect console errors
  const consoleErrors = [];
  const networkErrors = [];
  const failedImages = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      networkErrors.push({ url: response.url(), status: response.status() });
    }
  });

  page.on('requestfailed', request => {
    const url = request.url();
    if (url.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
      failedImages.push({ url, failure: request.failure()?.errorText });
    }
  });

  // Navigate — use domcontentloaded (faster, doesn't wait for all ads/analytics)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000); // Wait for images to start loading

  // Take initial screenshot (top of page)
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/01-top.png`,
    fullPage: false,
  });
  console.log('✅ Screenshot 01: Top of page');

  // Get page dimensions
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  console.log(`📊 Page height: ${scrollHeight}px, Viewport: ${viewportHeight}px\n`);

  // Scroll down progressively and take screenshots
  let scrollPos = 0;
  let screenshotNum = 2;
  const scrollStep = Math.floor(viewportHeight * 0.8);

  while (scrollPos < scrollHeight) {
    scrollPos += scrollStep;
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollPos);
    await page.waitForTimeout(1000); // Wait for images to load
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${String(screenshotNum).padStart(2, '0')}-scroll-${scrollPos}.png`,
      fullPage: false,
    });
    console.log(`✅ Screenshot ${String(screenshotNum).padStart(2, '0')}: Scroll ${scrollPos}px`);
    screenshotNum++;

    // Safety limit
    if (screenshotNum > 30) {
      console.log('⚠️ Reached 30 screenshot limit, stopping');
      break;
    }
  }

  // Take full-page screenshot
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/00-full-page.png`,
    fullPage: true,
  });
  console.log('\n✅ Full-page screenshot saved');

  // Get all image elements and check for broken ones
  const allImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map(img => ({
      src: img.src,
      alt: img.alt,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      displayed: img.offsetWidth > 0 || img.offsetHeight > 0,
      rect: img.getBoundingClientRect(),
    }));
  });

  console.log(`\n📊 IMAGE ANALYSIS (${allImages.length} images found):`);

  const broken = allImages.filter(img => !img.complete || (img.naturalWidth === 0 && img.naturalHeight === 0));
  const displayed = allImages.filter(img => img.displayed);
  const hidden = allImages.filter(img => !img.displayed);

  console.log(`   Total: ${allImages.length}`);
  console.log(`   Displayed: ${displayed.length}`);
  console.log(`   Hidden/Not rendered: ${hidden.length}`);
  console.log(`   Broken (failed to load): ${broken.length}`);

  if (broken.length > 0) {
    console.log('\n❌ BROKEN IMAGES:');
    broken.slice(0, 10).forEach((img, i) => {
      console.log(`   ${i + 1}. src: ${img.src.substring(0, 100)}...`);
      console.log(`      naturalWidth: ${img.naturalWidth}, naturalHeight: ${img.naturalHeight}`);
    });
    if (broken.length > 10) console.log(`   ... and ${broken.length - 10} more`);
  }

  // Check for ad zones
  const adZones = await page.evaluate(() => {
    const ads = Array.from(document.querySelectorAll('[class*="ad"], [id*="ad"], [data-ad], ins'));
    return ads.map(el => ({
      tag: el.tagName,
      className: el.className?.toString().substring(0, 80),
      visible: el.offsetHeight > 0,
      height: el.offsetHeight,
      html: el.innerHTML?.substring(0, 200),
    }));
  });

  console.log(`\n📊 AD ZONES: ${adZones.length} found`);
  adZones.forEach((ad, i) => {
    console.log(`   ${i + 1}. <${ad.tag}> class="${ad.className}" visible=${ad.visible} height=${ad.height}px`);
  });

  // Check for layout issues
  const layoutInfo = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;

    // Check for horizontal scroll
    const hasHorizontalScroll = html.scrollWidth > html.clientWidth;

    // Check for overflow elements
    const overflowing = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.offsetWidth > html.clientWidth + 5 && el.offsetHeight > 10) {
        overflowing.push({
          tag: el.tagName,
          className: el.className?.toString().substring(0, 60),
          width: el.offsetWidth,
        });
      }
    });

    return {
      bodyHeight: body.scrollHeight,
      htmlHeight: html.scrollHeight,
      viewportWidth: html.clientWidth,
      viewportHeight: html.clientHeight,
      scrollWidth: html.scrollWidth,
      hasHorizontalScroll,
      overflowingElements: overflowing.slice(0, 10),
    };
  });

  console.log('\n📊 LAYOUT INFO:');
  console.log(`   Body height: ${layoutInfo.bodyHeight}px`);
  console.log(`   HTML height: ${layoutInfo.htmlHeight}px`);
  console.log(`   Viewport: ${layoutInfo.viewportWidth}x${layoutInfo.viewportHeight}px`);
  console.log(`   Scroll width: ${layoutInfo.scrollWidth}px`);
  console.log(`   Horizontal scroll: ${layoutInfo.hasHorizontalScroll ? 'YES ⚠️' : 'No'}`);

  if (layoutInfo.overflowingElements.length > 0) {
    console.log('\n⚠️ OVERFLOWING ELEMENTS:');
    layoutInfo.overflowingElements.forEach((el, i) => {
      console.log(`   ${i + 1}. <${el.tag}> class="${el.className}" width=${el.width}px`);
    });
  }

  // Report network errors
  if (networkErrors.length > 0) {
    console.log(`\n❌ NETWORK ERRORS (${networkErrors.length}):`);
    networkErrors.slice(0, 10).forEach((err, i) => {
      console.log(`   ${i + 1}. [${err.status}] ${err.url.substring(0, 120)}`);
    });
  }

  // Report console errors
  if (consoleErrors.length > 0) {
    console.log(`\n❌ CONSOLE ERRORS (${consoleErrors.length}):`);
    consoleErrors.slice(0, 10).forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.substring(0, 150)}`);
    });
  }

  // Report failed images
  if (failedImages.length > 0) {
    console.log(`\n❌ FAILED IMAGE LOADS (${failedImages.length}):`);
    failedImages.slice(0, 10).forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.url.substring(0, 120)} — ${err.failure}`);
    });
  }

  if (networkErrors.length === 0 && consoleErrors.length === 0 && failedImages.length === 0) {
    console.log('\n✅ No errors detected!');
  }

  await browser.close();
  console.log('\n📁 Screenshots saved to screenshots/chapter-reader/');
})();