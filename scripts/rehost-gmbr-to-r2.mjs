#!/usr/bin/env node
/**
 * rehost-gmbr-to-r2.mjs  (v2 — intercept-based, bypasses 403)
 *
 * Strategy that WORKS (proven by test-gmbr-playwright.mjs):
 * 1. Navigate to manhwaland.land chapter page (source_url)
 * 2. Intercept ALL gmbr.pro image responses via page.on('response')
 * 3. Match intercepted images to DB rows by page number (001.jpg → page 1)
 * 4. Upload each buffer to R2 → update DB URL
 *
 * Usage:
 *   node scripts/rehost-gmbr-to-r2.mjs                      # Process ALL
 *   node scripts/rehost-gmbr-to-r2.mjs --limit=50            # 50 chapters
 *   node scripts/rehost-gmbr-to-r2.mjs --manga=military      # Filter
 *   node scripts/rehost-gmbr-to-r2.mjs --dry-run             # Preview
 *   node scripts/rehost-gmbr-to-r2.mjs --resume              # Skip chapters already in R2
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// ─── Config ─────────────────────────────────────────────────────────────────

const LIMIT       = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const DRY_RUN     = process.argv.includes('--dry-run');
const MANGA_FILTER= process.argv.find(a => a.startsWith('--manga='))?.split('=')[1];
const RESUME      = process.argv.includes('--resume');
const SCROLL_STEP = parseInt(process.argv.find(a => a.startsWith('--scroll='))?.split('=')[1] || '600', 10);

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET     = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET     = process.env.R2_BUCKET;

if (!SUPABASE_URL || !SUPABASE_KEY || !R2_ACCOUNT_ID || !R2_BUCKET) {
  console.error('❌ Missing env vars. Check .env.local');
  process.exit(1);
}

// ─── Clients ────────────────────────────────────────────────────────────────

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET },
});

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Extract page number from gmbr.pro URL: .../001.jpg → 1 */
function pageNumFromUrl(url) {
  const m = url.match(/(\d+)\.(jpg|jpeg|png|webp)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Check if object already exists in R2 */
async function r2Exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

/** Upload buffer to R2 */
async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `/api/r2/image/${key}`;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

const stats = {
  chaptersProcessed: 0, chaptersSkipped: 0,
  imagesDownloaded: 0, imagesUploaded: 0, imagesSkipped: 0, imagesFailed: 0,
  bytesDownloaded: 0, startTime: Date.now(),
};

function printStats() {
  const el = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const rate = (stats.imagesDownloaded / (el || 1)).toFixed(1);
  const mb = (stats.bytesDownloaded / 1024 / 1024).toFixed(1);
  console.log(`\n📊 ${stats.chaptersProcessed} ch | ⬇️${stats.imagesDownloaded} (${rate}/s) | ☁️${stats.imagesUploaded} up | ⏭️${stats.imagesSkipped} skip | ❌${stats.imagesFailed} fail | ${mb}MB | ${el}s\n`);
}

// ─── Get chapters with gmbr.pro images ──────────────────────────────────────

async function getChaptersToProcess() {
  console.log('  Fetching all chapters...');
  let all = [];
  let offset = 0;

  while (true) {
    const { data: page, error } = await sb.from('chapters')
      .select('id, number, source_url, thumbnail_url, manga:manga_id(slug, title)')
      .not('source_url', 'is', null)
      .order('number', { ascending: true })
      .range(offset, offset + 999);

    if (error) throw new Error(`DB error: ${error.message}`);
    if (!page?.length) break;

    all.push(...page);
    offset += 1000;
    if (page.length < 1000) break;
  }

  console.log(`  Total chapters with source_url: ${all.length}`);

  // Filter
  if (MANGA_FILTER) all = all.filter(ch => ch.manga?.slug?.includes(MANGA_FILTER));
  if (LIMIT > 0) all = all.slice(0, LIMIT);

  return all;
}

// ─── Process one chapter via page intercept ─────────────────────────────────

async function processChapter(browser, chapter) {
  const mangaName = chapter.manga?.title || chapter.manga?.slug || '?';

  // Check if this chapter has gmbr.pro images
  const { data: images, error } = await sb.from('chapter_images')
    .select('id, number, image_url')
    .eq('chapter_id', chapter.id)
    .like('image_url', '%gmbr.pro%')
    .order('number', { ascending: true });

  if (error || !images?.length) {
    stats.chaptersSkipped++;
    return;
  }

  // If resume mode, check if ALL images already in R2
  if (RESUME) {
    const r2Key = `chapters/${chapter.id}/${images[0].number}.jpg`;
    if (await r2Exists(r2Key)) {
      // Update all DB URLs to R2
      for (const img of images) {
        const key = `chapters/${chapter.id}/${img.number}.jpg`;
        if (await r2Exists(key)) {
          await sb.from('chapter_images').update({ image_url: `/api/r2/image/${key}` }).eq('id', img.id);
        }
      }
      stats.chaptersSkipped++;
      return;
    }
  }

  console.log(`\n📖 Ch${chapter.number} — ${mangaName} (${images.length} imgs)`);

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Source: ${chapter.source_url}`);
    for (const img of images.slice(0, 3)) {
      console.log(`    Page ${img.number}: ${img.image_url.substring(0, 70)}...`);
    }
    stats.chaptersProcessed++;
    return;
  }

  // ── Launch browser context & navigate to source page ──
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 720 },
    locale: 'id-ID',
    extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8' },
  });

  const page = await context.newPage();

  // Intercept all image responses
  /** @type {Map<number, {buffer: Buffer, contentType: string, url: string}>} */
  const captured = new Map();

  page.on('response', async (resp) => {
    const url = resp.url();
    if (!url.includes('gmbr.pro')) return;
    if (resp.status() !== 200) return;

    try {
      const ct = resp.headers()['content-type'] || '';
      if (!ct.startsWith('image/')) return;

      const body = await resp.body();
      if (body.length < 1024) return;

      const pageNum = pageNumFromUrl(url);
      if (pageNum) {
        captured.set(pageNum, { buffer: Buffer.from(body), contentType: ct, url });
        process.stdout.write(`  📥 p${pageNum} `);
      }
    } catch { /* response body already consumed */ }
  });

  // Navigate to source page
  try {
    await page.goto(chapter.source_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`  ⚠️ Navigation failed: ${e.message.substring(0, 60)}`);
  }

  // Wait for initial load
  await sleep(3000);

  // Scroll through entire page to trigger lazy-loaded images
  const scrollSteps = Math.ceil(50 / (SCROLL_STEP / 100));
  for (let i = 0; i < scrollSteps; i++) {
    const atBottom = await page.evaluate((step) => {
      window.scrollBy(0, step);
      return (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
    }, SCROLL_STEP);

    await sleep(500);
    if (atBottom && i > 5) break; // Ensure minimum scrolls
  }

  // Wait a bit more for stragglers
  await sleep(2000);

  console.log(`\n  Captured: ${captured.size}/${images.length} images`);

  // ── Match & upload ──
  let success = 0;
  for (const img of images) {
    const data = captured.get(img.number);

    if (!data) {
      // Try alternate page number patterns (e.g., 01 vs 1)
      const altKey = captured.size > 0 ? null : null;
      if (!altKey) {
        stats.imagesFailed++;
        continue;
      }
    }

    const r2Key = `chapters/${chapter.id}/${img.number}.jpg`;
    const r2Url = `/api/r2/image/${r2Key}`;

    // Skip if already in R2
    if (await r2Exists(r2Key)) {
      await sb.from('chapter_images').update({ image_url: r2Url }).eq('id', img.id);
      stats.imagesSkipped++;
      success++;
      continue;
    }

    try {
      stats.bytesDownloaded += data.buffer.length;
      await uploadToR2(r2Key, data.buffer, data.contentType);
      await sb.from('chapter_images').update({ image_url: r2Url }).eq('id', img.id);
      stats.imagesDownloaded++;
      stats.imagesUploaded++;
      success++;
    } catch (e) {
      console.log(`  ❌ Upload failed p${img.number}: ${e.message.substring(0, 50)}`);
      stats.imagesFailed++;
    }
  }

  // Update chapter thumbnail
  if (success > 0) {
    const thumbPage = images.find(i => i.number === 5) || images.find(i => i.number === 1) || images[0];
    if (thumbPage) {
      const thumbUrl = `/api/r2/image/chapters/${chapter.id}/${thumbPage.number}.jpg`;
      if (chapter.thumbnail_url?.includes('gmbr.pro') || !chapter.thumbnail_url) {
        await sb.from('chapters').update({ thumbnail_url: thumbUrl }).eq('id', chapter.id);
      }
    }
  }

  console.log(`  ✅ ${success}/${images.length} uploaded`);

  await page.close();
  await context.close();

  stats.chaptersProcessed++;
  if (stats.chaptersProcessed % 10 === 0) printStats();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🔄 Re-host gmbr.pro → R2 (Playwright Intercept v2) ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Limit: ${LIMIT > 0 ? LIMIT : 'ALL'} | Dry: ${DRY_RUN} | Resume: ${RESUME}`);
  console.log(`  Manga: ${MANGA_FILTER || 'all'}\n`);

  console.log('🌐 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  console.log('✅ Ready\n');

  console.log('📋 Finding chapters...');
  const chapters = await getChaptersToProcess();
  console.log(`Found ${chapters.length} chapters\n`);

  if (!chapters.length) {
    console.log('✅ Nothing to do.');
    await browser.close();
    return;
  }

  for (const chapter of chapters) {
    try {
      await processChapter(browser, chapter);
    } catch (e) {
      console.log(`\n❌ Ch${chapter.number} error: ${e.message.substring(0, 80)}`);
      stats.imagesFailed++;
    }
  }

  printStats();
  const mins = ((Date.now() - stats.startTime) / 60000).toFixed(1);
  console.log(`\n✅ Done in ${mins} min!`);
  console.log(`   ${stats.chaptersProcessed} chapters | ${stats.imagesUploaded} uploaded | ${stats.imagesFailed} failed`);

  await browser.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });