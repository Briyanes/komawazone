import { chromium } from 'playwright';

const browser = await chromium.launch();

// === MOBILE VIEW ===
const mobilePage = await browser.newPage({
  viewport: { width: 390, height: 844 },
});
await mobilePage.goto('https://olluq.xyz/vip', { waitUntil: 'networkidle' });
await mobilePage.evaluate(() => {
  const headings = document.querySelectorAll('h2');
  for (const h of headings) {
    if (h.textContent?.includes('Cara Beli')) {
      h.scrollIntoView({ block: 'center' });
      break;
    }
  }
});
await mobilePage.waitForTimeout(1000);

const mobileInfo = await mobilePage.evaluate(() => {
  const imgs = document.querySelectorAll('img[src*="tokopedia"], img[src*="shopee"]');
  return Array.from(imgs).map(img => {
    const rect = img.getBoundingClientRect();
    const parent = img.closest('a');
    return {
      alt: img.alt,
      width: rect.width,
      height: rect.height,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      parentW: parent?.getBoundingClientRect().width,
      parentH: parent?.getBoundingClientRect().height,
    };
  });
});

await mobilePage.screenshot({ path: 'screenshots/vip-marketplace-mobile.png', fullPage: false });
console.log('MOBILE:', JSON.stringify(mobileInfo, null, 2));

await mobilePage.close();

// === DESKTOP VIEW ===
const desktopPage = await browser.newPage({
  viewport: { width: 1280, height: 800 },
});
await desktopPage.goto('https://olluq.xyz/vip', { waitUntil: 'networkidle' });
await desktopPage.evaluate(() => {
  const headings = document.querySelectorAll('h2');
  for (const h of headings) {
    if (h.textContent?.includes('Cara Beli')) {
      h.scrollIntoView({ block: 'center' });
      break;
    }
  }
});
await desktopPage.waitForTimeout(1000);

const desktopInfo = await desktopPage.evaluate(() => {
  const imgs = document.querySelectorAll('img[src*="tokopedia"], img[src*="shopee"]');
  return Array.from(imgs).map(img => {
    const rect = img.getBoundingClientRect();
    const parent = img.closest('a');
    return {
      alt: img.alt,
      width: rect.width,
      height: rect.height,
      parentW: parent?.getBoundingClientRect().width,
      parentH: parent?.getBoundingClientRect().height,
    };
  });
});

await desktopPage.screenshot({ path: 'screenshots/vip-marketplace-desktop.png', fullPage: false });
console.log('DESKTOP:', JSON.stringify(desktopInfo, null, 2));

await desktopPage.close();
await browser.close();
console.log('Done!');