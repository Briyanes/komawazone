#!/usr/bin/env node
/**
 * rehost-gmbr-to-r2.mjs
 *
 * Batch re-host ALL gmbr.pro images to Cloudflare R2.
 *
 * Strategy:
 * 1. Query chapter_images + chapters thumbnails with gmbr.pro URLs
 * 2. Download each image via Playwright (real browser bypasses 403 bot protection)
 * 3. Upload to R2 at chapters/{chapterId}/{pageNumber}.jpg
 * 4. Update DB URLs to /api/r2/image/chapters/{chapterId}/{pageNumber}.jpg
 *
 * Usage:
 *   node scripts/rehost-gmbr-to-r2.mjs                    # Process ALL
 *   node scripts/rehost-gmbr-to-r2.mjs --limit 100         # Process 100 chapters
 *   node scripts/rehost-gmbr-to-r2.mjs --concurrency 5     # 5 parallel downloads
 *   node scripts/rehost-gmbr-to-r2.mjs --dry-run           # Preview without changes
 *   node scripts/rehost-gmbr-to-r2.mjs --manga "military"  # Filter by manga slug
 *
 * Stats: ~200ms per image, 3 parallel = ~600ms for 3 images
 *        99,858 images / 3 concurrent ≈ 5-6 hours
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// ─── Config ─────────────────────────────────────────────────────────────────

const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const MANGA_FILTER = process.argv.find(a => a.startsWith('--manga='))?.split('=')[1];
const CHAPTER_FILTER = process.argv.find(a => a.startsWith('--chapter='))?.split('=')[1];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

if (!SUPABASE_URL || !SUPABASE_KEY || !R2_ACCOUNT_ID || !R2_BUCKET) {
  console.error('❌ Missing environment variables. Check .env.local');
  process.exit(1);
}

// ─── Clients ────────────────────────────────────────────────────────────────

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Check if object already exists in R2 */
async function r2Exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Upload buffer to R2 */
async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `/api/r2/image/${key}`;
}

/** Download image via Playwright page.goto */
async function downloadWithPlaywright(page, url, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 20000 });

      if (!resp || !resp.ok()) {
        if (attempt < retries) { await sleep(1000 * attempt); continue; }
        throw new Error(`HTTP ${resp?.status()}`);
      }

      const ct = resp.headers()['content-type'] || 'image/jpeg';
      if (!ct.startsWith('image/')) {
        // gmbr.pro sometimes returns text/html on block
        if (attempt < retries) { await sleep(2000 * attempt); continue; }
        throw new Error(`Bad content-type: ${ct}`);
      }

      const body = await resp.body();
      if (body.length < 1024) {
        if (attempt < retries) { await sleep(2000 * attempt); continue; }
        throw new Error(`Too small: ${body.length} bytes`);
      }

      return { buffer: Buffer.from(body), contentType: ct };
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(2000 * attempt);
    }
  }
  throw new Error('Exhausted retries');
}

// ─── Stats ──────────────────────────────────────────────────────────────────

const stats = {
  chaptersProcessed: 0,
  imagesDownloaded: 0,
  imagesUploaded: 0,
  imagesSkipped: 0,
  imagesFailed: 0,
  bytesDownloaded: 0,
  startTime: Date.now(),
};

function printStats() {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const rate = (stats.imagesDownloaded / (elapsed || 1)).toFixed(1);
  const mbDownloaded = (stats.bytesDownloaded / 1024 / 1024).toFixed(1);
  console.log(`\n📊 Progress: ${stats.chaptersProcessed} chapters | ${stats.imagesDownloaded} downloaded (${rate}/s) | ${stats.imagesUploaded} uploaded | ${stats.imagesSkipped} skipped | ${stats.imagesFailed} failed | ${mbDownloaded} MB | ${elapsed}s\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function getChaptersToProcess() {
  // Strategy: Fetch ALL chapters (only ~20K rows, fast) then check each one
  // individually for gmbr.pro images. This avoids the expensive LIKE query on
  // the 545K-row chapter_images table which causes statement timeouts.

  console.log('  Fetching ALL chapters from chapters table...');
  let allChapters = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data: page, error } = await sb.from('chapters')
      .select(`
        id, number, source_url, thumbnail_url,
        manga:manga_id(slug, title)
      `)
      .order('number', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch chapters: ${error.message}`);
    if (!page || page.length === 0) break;

    allChapters.push(...page);
    offset += PAGE_SIZE;

    if (page.length < PAGE_SIZE) break;
  }

  console.log(`  Found ${allChapters.length} total chapters`);

  // Apply manga/chapter filter early to reduce work
  let result = allChapters;
  if (MANGA_FILTER) {
    result = result.filter(ch => ch.manga?.slug?.includes(MANGA_FILTER));
  }
  if (CHAPTER_FILTER) {
    result = result.filter(ch => ch.id === CHAPTER_FILTER);
  }
  if (LIMIT > 0) {
    result = result.slice(0, LIMIT);
  }

  // gmbrImageCount will be determined per-chapter in processChapter
  result = result.map(ch => ({
    ...ch,
    gmbrImageCount: 0, // checked dynamically per-chapter
  }));

  return result;
}

async function processChapter(browser, chapter) {
  const mangaName = chapter.manga?.title || chapter.manga?.slug || 'unknown';

  // Quick check: does this chapter have gmbr.pro images?
  const { data: images, error } = await sb.from('chapter_images')
    .select('id, number, image_url')
    .eq('chapter_id', chapter.id)
    .like('image_url', '%gmbr.pro%')
    .order('number', { ascending: true });

  if (error) {
    console.log(`  ❌ Failed to fetch images for ch ${chapter.number}: ${error.message}`);
    return;
  }

  // Skip silently if no gmbr.pro images
  if (!images || images.length === 0) {
    stats.chaptersProcessed++;
    return;
  }

  chapter.gmbrImageCount = images.length;
  console.log(`\n📖 Chapter ${chapter.number} — ${mangaName} (${images.length} gmbr.pro images)`);

  // Process images in parallel batches
  const context = await browser.newContext({ userAgent: UA });
  const pages = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    pages.push(await context.newPage());
  }

  let successCount = 0;

  for (let i = 0; i < images.length; i += CONCURRENCY) {
    const batch = images.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(batch.map(async (img, idx) => {
      const page = pages[idx];
      const r2Key = `chapters/${chapter.id}/${img.number}.jpg`;
      const r2Url = `/api/r2/image/${r2Key}`;

      // Skip if already in R2
      if (await r2Exists(r2Key)) {
        if (!DRY_RUN) {
          await sb.from('chapter_images')
            .update({ image_url: r2Url })
            .eq('id', img.id);
        }
        stats.imagesSkipped++;
        return { ok: true, skipped: true };
      }

      if (DRY_RUN) {
        console.log(`  [DRY-RUN] Would download: ${img.image_url.substring(0, 60)}...`);
        return { ok: true, dryRun: true };
      }

      // Download via Playwright
      const { buffer, contentType } = await downloadWithPlaywright(page, img.image_url);
      stats.bytesDownloaded += buffer.length;

      // Upload to R2
      await uploadToR2(r2Key, buffer, contentType);

      // Update DB
      await sb.from('chapter_images')
        .update({ image_url: r2Url })
        .eq('id', img.id);

      stats.imagesDownloaded++;
      stats.imagesUploaded++;
      return { ok: true, size: buffer.length };
    }));

    // Log results
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const img = batch[j];
      if (r.status === 'fulfilled') {
        successCount++;
        if (r.value.skipped) {
          // Already exists
        } else if (r.value.dryRun) {
          // Dry run
        } else {
          process.stdout.write(`  ✅ Page ${img.number} (${(r.value.size / 1024).toFixed(0)}KB) `);
        }
      } else {
        stats.imagesFailed++;
        console.log(`\n  ❌ Page ${img.number} FAILED: ${r.reason?.message?.substring(0, 60)}`);
      }
    }
  }

  console.log('');
  await Promise.all(pages.map(p => p.close()));
  await context.close();

  // Update chapter thumbnail (use page 5 or middle page)
  if (successCount > 0 && !DRY_RUN) {
    const thumbPage = images.find(i => i.number === 5) || images[Math.floor(images.length / 2)];
    if (thumbPage) {
      const thumbUrl = `/api/r2/image/chapters/${chapter.id}/${thumbPage.number}.jpg`;
      if (chapter.thumbnail_url?.includes('gmbr.pro') || !chapter.thumbnail_url) {
        await sb.from('chapters')
          .update({ thumbnail_url: thumbUrl })
          .eq('id', chapter.id);
        console.log(`  🖼️  Thumbnail updated → page ${thumbPage.number}`);
      }
    }
  }

  stats.chaptersProcessed++;
  if (stats.chaptersProcessed % 10 === 0) printStats();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     🔄 Re-host gmbr.pro images to R2 (Playwright)       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Limit: ${LIMIT > 0 ? LIMIT : 'ALL'}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Manga filter: ${MANGA_FILTER || 'none'}`);
  console.log('');

  // Launch browser
  console.log('🌐 Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  console.log('✅ Browser ready\n');

  // Get chapters to process
  console.log('📋 Finding chapters with gmbr.pro images...');
  const chapters = await getChaptersToProcess();
  console.log(`Found ${chapters.length} chapters to process\n`);

  if (chapters.length === 0) {
    console.log('✅ Nothing to do — no chapters with gmbr.pro images found.');
    await browser.close();
    return;
  }

  // Process each chapter
  for (const chapter of chapters) {
    try {
      await processChapter(browser, chapter);
    } catch (e) {
      console.log(`\n❌ Chapter ${chapter.number} failed: ${e.message}`);
      stats.imagesFailed += chapter.gmbrImageCount;
    }
  }

  // Final stats
  printStats();
  const elapsed = ((Date.now() - stats.startTime) / 60).toFixed(1);
  console.log(`\n✅ Done in ${elapsed} minutes!`);
  console.log(`   ${stats.chaptersProcessed} chapters processed`);
  console.log(`   ${stats.imagesUploaded} images uploaded to R2`);
  console.log(`   ${stats.imagesSkipped} images already existed (skipped)`);
  console.log(`   ${stats.imagesFailed} images failed`);

  await browser.close();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});