#!/usr/bin/env node
/**
 * migrate-gmbr-to-r2-direct.mjs
 *
 * Downloads gmbr.pro images DIRECTLY via Playwright page.goto (bypasses 403),
 * uploads to R2, and updates DB URLs.
 *
 * Usage:
 *   node scripts/migrate-gmbr-to-r2-direct.mjs               # Process ALL
 *   node scripts/migrate-gmbr-to-r2-direct.mjs --limit=10     # 10 images
 *   node scripts/migrate-gmbr-to-r2-direct.mjs --dry-run      # Preview
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// ─── Config ─────────────────────────────────────────────────────────────────

const LIMIT   = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const DRY_RUN = process.argv.includes('--dry-run');

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

/** Download image via Playwright (bypasses Cloudflare 403) */
async function downloadViaPlaywright(page, url) {
  try {
    const resp = await page.goto(url, { waitUntil: 'commit', timeout: 20000 });
    if (!resp || resp.status() !== 200) return null;

    const ct = resp.headers()['content-type'] || '';
    if (!ct.startsWith('image/')) return null;

    const body = await resp.body();
    if (body.length < 1024) return null;

    return { buffer: Buffer.from(body), contentType: ct };
  } catch {
    return null;
  }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

const stats = {
  total: 0, uploaded: 0, skipped: 0, failed: 0,
  bytesUploaded: 0, startTime: Date.now(),
};

function printStats() {
  const el = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const mb = (stats.bytesUploaded / 1024 / 1024).toFixed(1);
  const pct = stats.total > 0 ? ((stats.uploaded + stats.skipped + stats.failed) / stats.total * 100).toFixed(1) : 0;
  console.log(`\n📊 Progress: ${pct}% | ✅${stats.uploaded} up | ⏭️${stats.skipped} skip | ❌${stats.failed} fail | ${mb}MB | ${el}s\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🔄 Migrate gmbr.pro → R2 (Direct Playwright DL)   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Limit: ${LIMIT > 0 ? LIMIT : 'ALL'} | Dry: ${DRY_RUN}\n`);

  // Fetch all gmbr.pro images
  console.log('📋 Fetching gmbr.pro images from DB...');
  let allImages = [];
  let offset = 0;

  while (true) {
    const { data, error } = await sb.from('chapter_images')
      .select('id, chapter_id, number, image_url')
      .ilike('image_url', '%gmbr.pro%')
      .range(offset, offset + 999);

    if (error) throw new Error(`DB error: ${error.message}`);
    if (!data?.length) break;

    allImages.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
  }

  console.log(`  Found ${allImages.length} gmbr.pro images\n`);

  if (LIMIT > 0) allImages = allImages.slice(0, LIMIT);
  stats.total = allImages.length;

  if (DRY_RUN) {
    for (const img of allImages.slice(0, 10)) {
      console.log(`  [DRY-RUN] ch:${img.chapter_id} p${img.number} → ${img.image_url.substring(0, 70)}`);
    }
    console.log(`\n  ... and ${allImages.length - 10} more`);
    return;
  }

  // Launch browser
  console.log('🌐 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  console.log('✅ Ready\n');

  let batchCount = 0;

  for (const img of allImages) {
    const r2Key = `chapters/${img.chapter_id}/${img.number}.jpg`;
    const r2Url = `/api/r2/image/${r2Key}`;

    // Skip if already in R2
    if (await r2Exists(r2Key)) {
      await sb.from('chapter_images').update({ image_url: r2Url }).eq('id', img.id);
      stats.skipped++;
      batchCount++;
      continue;
    }

    // Download via Playwright
    const downloaded = await downloadViaPlaywright(page, img.image_url);

    if (!downloaded) {
      console.log(`❌ Failed: ${img.image_url.substring(0, 70)}`);
      stats.failed++;
      batchCount++;
      continue;
    }

    // Upload to R2
    try {
      stats.bytesUploaded += downloaded.buffer.length;
      await uploadToR2(r2Key, downloaded.buffer, downloaded.contentType);
      await sb.from('chapter_images').update({ image_url: r2Url }).eq('id', img.id);
      stats.uploaded++;

      process.stdout.write('✅');
    } catch (e) {
      console.log(`\n❌ Upload failed: ${e.message.substring(0, 60)}`);
      stats.failed++;
    }

    batchCount++;

    // Print stats every 50
    if (batchCount % 50 === 0) {
      printStats();
    }

    // Small delay to avoid rate limit
    if (batchCount % 10 === 0) {
      await sleep(500);
    }
  }

  printStats();
  const mins = ((Date.now() - stats.startTime) / 60000).toFixed(1);
  console.log(`\n✅ Done in ${mins} min!`);
  console.log(`   ${stats.uploaded} uploaded | ${stats.skipped} skipped | ${stats.failed} failed`);

  await page.close();
  await context.close();
  await browser.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });