#!/usr/bin/env node
/**
 * migrate-gmbr-to-r2-direct.mjs (v4 — STREAMING)
 *
 * Strategy:
 * 1. Get chapter_ids (paginated 200/page)
 * 2. Process in CHAPTER BATCHES of 50:
 *    - Fetch images for 50 chapters (1 query via .in)
 *    - Download+Upload with N workers (page.goto method)
 *    - Flush DB updates
 *    - Next batch
 *
 * Usage:
 *   node scripts/migrate-gmbr-to-r2-direct.mjs               # Process ALL
 *   node scripts/migrate-gmbr-to-r2-direct.mjs --limit=50    # 50 images
 *   node scripts/migrate-gmbr-to-r2-direct.mjs --workers=4   # 4 browser pages
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { writeFileSync, appendFileSync, existsSync } from 'fs';

dotenv.config({ path: '.env.local' });

// ─── Config ─────────────────────────────────────────────────────────────────

const LIMIT    = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const WORKERS  = parseInt(process.argv.find(a => a.startsWith('--workers='))?.split('=')[1] || '2', 10);
const DRY_RUN  = process.argv.includes('--dry-run');
const LOG_FILE = 'scripts/fix-massive-log.txt';
const CHAPTER_BATCH = 50; // chapters per batch query

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

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `/api/r2/image/${key}`;
}

async function downloadViaPage(page, url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await sleep(1000 * attempt); // backoff
      const resp = await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
      if (!resp || resp.status() !== 200) continue;
      const ct = resp.headers()['content-type'] || '';
      if (!ct.startsWith('image/')) continue;
      const body = await resp.body();
      if (body.length < 1024) continue;
      return { buffer: Buffer.from(body), contentType: ct };
    } catch {
      if (attempt === retries) return null;
    }
  }
  return null;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

const stats = {
  total: 0, uploaded: 0, failed: 0,
  bytesUploaded: 0, startTime: Date.now(),
  dbUpdatesPending: [],
};

function printProgress(force = false) {
  const done = stats.uploaded + stats.failed;
  if (!force && done % 50 !== 0) return;
  const el = (Date.now() - stats.startTime) / 1000;
  const rate = done > 0 ? (done / el).toFixed(1) : '0';
  const mb = (stats.bytesUploaded / 1024 / 1024).toFixed(0);
  const pct = stats.total > 0 ? (done / stats.total * 100).toFixed(1) : 0;
  const eta = done > 0 ? ((stats.total - done) / (done / el) / 3600).toFixed(1) : '?';
  log(`📊 ${pct}% (${done}/${stats.total}) | ✅${stats.uploaded} ❌${stats.failed} | ${rate} img/s | ${mb}MB | ETA: ${eta}h`);
}

// ─── Process batch ──────────────────────────────────────────────────────────

async function processBatch(pages, images) {
  if (images.length === 0) return;

  let idx = 0;

  async function worker(page) {
    while (idx < images.length) {
      const img = images[idx++];
      if (!img) break;

      const r2Key = `chapters/${img.chapter_id}/${img.number}.jpg`;
      const r2Url = `/api/r2/image/${r2Key}`;

      const downloaded = await downloadViaPage(page, img.image_url);

      if (!downloaded) {
        stats.failed++;
        printProgress();
        continue;
      }

      try {
        stats.bytesUploaded += downloaded.buffer.length;
        await uploadToR2(r2Key, downloaded.buffer, downloaded.contentType);
        stats.uploaded++;
        stats.dbUpdatesPending.push({ id: img.id, url: r2Url });
      } catch {
        stats.failed++;
      }
      printProgress();
      // Small delay between downloads to avoid CF rate-limit
      await sleep(200);
    }
  }

  await Promise.all(pages.map(p => worker(p)));
}

async function flushDbUpdates() {
  if (stats.dbUpdatesPending.length === 0) return;
  const updates = [...stats.dbUpdatesPending];
  stats.dbUpdatesPending = [];

  for (const u of updates) {
    try {
      await sb.from('chapter_images').update({ image_url: u.url }).eq('id', u.id);
    } catch {}
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🚀 Migrate gmbr.pro → R2 (STREAMING v4)           ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Workers: ${WORKERS} | Limit: ${LIMIT > 0 ? LIMIT : 'ALL'} | Dry: ${DRY_RUN}\n`);

  if (!existsSync(LOG_FILE)) writeFileSync(LOG_FILE, '');

  // Step 1: Get ALL chapter_ids with gmbr.pro images (with retry for timeouts)
  log('📋 Step 1: Finding chapters with gmbr.pro images...');
  const seenChIds = new Set();
  let off = 0;
  const PAGE_SIZE = 100;

  while (true) {
    let data = null, error = null;
    // Retry up to 3 times on timeout
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await sb.from('chapter_images')
        .select('chapter_id')
        .like('image_url', '%gmbr.pro%')
        .range(off, off + PAGE_SIZE - 1);
      data = result.data;
      error = result.error;
      if (!error) break;
      log(`⚠️ Query retry ${attempt + 1}/3 at offset ${off}: ${error.message}`);
      await sleep(2000 * (attempt + 1));
    }

    if (error) { log(`⚠️ Query failed at offset ${off} after retries, continuing with what we have`); break; }
    if (!data?.length) break;

    for (const row of data) seenChIds.add(row.chapter_id);
    off += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  const allChIds = [...seenChIds];
  log(`  Found ${allChIds.length} chapters`);

  // Calculate total images estimate (for ETA)
  // We'll know exact total as we process
  stats.total = LIMIT > 0 ? LIMIT : 74317; // estimate from audit

  if (DRY_RUN) {
    log('  [DRY-RUN] Would process chapters in batches of 50');
    return;
  }

  // Launch browser FIRST (before step 2, so it's ready)
  log('🌐 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 720 },
  });

  const pages = [];
  for (let i = 0; i < WORKERS; i++) {
    pages.push(await context.newPage());
  }
  log(`✅ ${WORKERS} browser pages ready`);

  // Step 2: Process in CHAPTER BATCHES
  log(`⚡ Processing ${allChIds.length} chapters in batches of ${CHAPTER_BATCH}...`);
  let imagesProcessed = 0;

  for (let batchStart = 0; batchStart < allChIds.length; batchStart += CHAPTER_BATCH) {
    const batchChIds = allChIds.slice(batchStart, batchStart + CHAPTER_BATCH);

    // Fetch images for this batch of chapters (1 query)
    const { data: batchImages, error } = await sb.from('chapter_images')
      .select('id, chapter_id, number, image_url')
      .in('chapter_id', batchChIds)
      .like('image_url', '%gmbr.pro%')
      .limit(10000);

    if (error) {
      log(`⚠️ Batch error at chapters ${batchStart}: ${error.message}`);
      continue;
    }

    if (!batchImages?.length) continue;

    // Check limit
    let toProcess = batchImages;
    if (LIMIT > 0 && imagesProcessed + batchImages.length > LIMIT) {
      toProcess = batchImages.slice(0, LIMIT - imagesProcessed);
    }

    // Process this batch
    await processBatch(pages, toProcess);
    imagesProcessed += toProcess.length;

    // Flush DB after each chapter batch
    await flushDbUpdates();

    log(`📦 Batch ${Math.floor(batchStart / CHAPTER_BATCH) + 1}/${Math.ceil(allChIds.length / CHAPTER_BATCH)} done | ${imagesProcessed} images processed`);

    if (LIMIT > 0 && imagesProcessed >= LIMIT) break;
  }

  // Final flush
  await flushDbUpdates();

  const mins = ((Date.now() - stats.startTime) / 60000).toFixed(1);
  const mb = (stats.bytesUploaded / 1024 / 1024).toFixed(0);
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`✅ DONE in ${mins} min!`);
  log(`   📤 Uploaded: ${stats.uploaded.toLocaleString()} (${mb}MB)`);
  log(`   ❌ Failed: ${stats.failed.toLocaleString()}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const p of pages) await p.close();
  await context.close();
  await browser.close();
}

main().catch(e => { log('Fatal: ' + e.message); process.exit(1); });