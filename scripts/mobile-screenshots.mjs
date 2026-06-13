/**
 * Mobile visual audit — screenshots of all key pages at iPhone 14 viewport (390×844)
 * Usage: node scripts/mobile-screenshots.mjs [BASE_URL]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'https://olluq.xyz';
const OUT_DIR = join(__dirname, '..', 'screenshots', 'mobile');

mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  { name: '01-home',          path: '/' },
  { name: '02-search',        path: '/search' },
  { name: '03-genre-list',    path: '/genre' },
  { name: '04-bookmarks',     path: '/bookmarks' },
  { name: '05-history',       path: '/history' },
  { name: '06-profile',       path: '/profile' },
  { name: '07-vip',           path: '/vip' },
  { name: '08-login',         path: '/login' },
  { name: '09-register',      path: '/register' },
  { name: '10-about',         path: '/about' },
];

// Dynamic pages — we'll grab real slugs from the homepage
const DYNAMIC_PAGES = [
  { name: 'manga-detail',  selector: 'a[href*="/manga/"]', pathPrefix: '' },
];

async function run() {
  console.log(`📸 Mobile screenshots → ${OUT_DIR}`);
  console.log(`   Base URL: ${BASE}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = context.newPage.bind(context);

  // 1. Static pages
  for (const { name, path } of PAGES) {
    const p = await page();
    try {
      console.log(`  ${name} (${path})...`);
      await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await p.waitForTimeout(1500); // let animations settle
      await p.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
      console.log(`  ✅ ${name}.png`);
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
    }
    await p.close();
  }

  // 2. Dynamic: grab first manga link from homepage for detail + reader
  const homePage = await page();
  try {
    await homePage.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
    await homePage.waitForTimeout(1000);

    // Find first manga link
    const mangaHref = await homePage.evaluate(() => {
      const link = document.querySelector('a[href*="/manga/"]');
      return link?.getAttribute('href') ?? null;
    });

    if (mangaHref) {
      console.log(`\n  Found manga: ${mangaHref}`);
      const mangaPath = mangaHref.startsWith('http') ? new URL(mangaHref).pathname : mangaHref;

      // Manga detail page
      const detailPage = await page();
      await detailPage.goto(`${BASE}${mangaPath}`, { waitUntil: 'networkidle', timeout: 20000 });
      await detailPage.waitForTimeout(1500);
      await detailPage.screenshot({ path: join(OUT_DIR, '11-manga-detail.png'), fullPage: true });
      console.log('  ✅ 11-manga-detail.png');
      await detailPage.close();

      // Genre detail — grab first genre link from genre list
      const genrePage = await page();
      await genrePage.goto(`${BASE}/genre`, { waitUntil: 'networkidle', timeout: 20000 });
      await genrePage.waitForTimeout(1000);
      const genreHref = await genrePage.evaluate(() => {
        const link = document.querySelector('a[href*="/genre/"]');
        return link?.getAttribute('href') ?? null;
      });
      await genrePage.close();

      if (genreHref) {
        const genrePath = genreHref.startsWith('http') ? new URL(genreHref).pathname : genreHref;
        const gdPage = await page();
        await gdPage.goto(`${BASE}${genrePath}`, { waitUntil: 'networkidle', timeout: 20000 });
        await gdPage.waitForTimeout(1500);
        await gdPage.screenshot({ path: join(OUT_DIR, '12-genre-detail.png'), fullPage: true });
        console.log('  ✅ 12-genre-detail.png');
        await gdPage.close();
      }

      // Reader — find chapter link from manga detail
      const readerPage = await page();
      try {
        await readerPage.goto(`${BASE}${mangaPath}`, { waitUntil: 'networkidle', timeout: 20000 });
        await readerPage.waitForTimeout(1000);
        const chapterHref = await readerPage.evaluate(() => {
          const link = document.querySelector('a[href*="/chapter/"]');
          return link?.getAttribute('href') ?? null;
        });
        if (chapterHref) {
          const chapterPath = chapterHref.startsWith('http') ? new URL(chapterHref).pathname : chapterHref;
          const rPage = await page();
          await rPage.goto(`${BASE}${chapterPath}`, { waitUntil: 'networkidle', timeout: 20000 });
          await rPage.waitForTimeout(2000);
          await rPage.screenshot({ path: join(OUT_DIR, '13-reader.png'), fullPage: false }); // reader can be very long
          console.log('  ✅ 13-reader.png');
          await rPage.close();
        }
      } catch (e) {
        console.log(`  ⚠️  reader skipped: ${e.message}`);
      }
      await readerPage.close();
    }
  } catch (e) {
    console.log(`  ⚠️  dynamic pages skipped: ${e.message}`);
  }
  await homePage.close();

  await browser.close();
  console.log(`\n✅ Done! Screenshots saved to ${OUT_DIR}`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});