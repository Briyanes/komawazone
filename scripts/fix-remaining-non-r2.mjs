#!/usr/bin/env node
/**
 * fix-remaining-non-r2.mjs
 *
 * Handles ALL remaining non-R2 images:
 * 1. gmbr.pro (retry failed — api-l + img-uwak subdomains)
 * 2. gmbar.xyz (try via domain swap + direct)
 * 3. uwakjawa.xyz (try domain swap to gmbar.xyz first, then mark dead)
 *
 * Strategy: browser-based download with smart URL fallbacks
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { appendFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

// ─── Config ─────────────────────────────────────────────────────────────────

const WORKERS  = parseInt(process.argv.find(a => a.startsWith('--workers='))?.split('=')[1] || '3', 10);
const LIMIT    = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const LOG_FILE = 'scripts/fix-remaining-log.txt';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
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

function getAlternativeUrls(originalUrl) {
  const alternatives = [originalUrl];
  
  // If uwakjawa.xyz → try gmbar.xyz swap (same storage backend)
  if (originalUrl.includes('uwakjawa.xyz')) {
    alternatives.push(originalUrl.replace('go.uwakjawa.xyz', 'go.gmbar.xyz'));
    alternatives.push(originalUrl.replace('uwakjawa.xyz', 'gmbar.xyz'));
  }
  
  // If gmbar.xyz → try uwakjawa swap
  if (originalUrl.includes('gmbar.xyz')) {
    alternatives.push(originalUrl.replace('go.gmbar.xyz', 'go.uwakjawa.xyz'));
  }
  
  return [...new Set(alternatives)];
}

async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `/api/r2/image/${key}`;
}

async function downloadWithRetries(page, url, retries = 3) {
  const urls = getAlternativeUrls(url);
  
  for (const tryUrl of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) await sleep(1500 * attempt);
        const resp = await page.goto(tryUrl, { waitUntil: 'commit', timeout: 20000 });
        if (!resp || resp.status() !== 200) continue;
        const ct = resp.headers()['content-type'] || '';
        if (!ct.startsWith('image/')) continue;
        const body = await resp.body();
        if (body.length < 2048) continue; // Skip tiny images (< 2KB = likely error page)
        return { buffer: Buffer.from(body), contentType: ct, usedUrl: tryUrl };
      } catch {
        if (attempt === retries) break;
      }
    }
  }
  return null;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

const stats = {
  total: 0, uploaded: 0, failed: 0, swapped: 0,
  bytesUploaded: 0, startTime: Date.now(),
  dbUpdates: [],
};

function printProgress(force = false) {
  const done = stats.uploaded + stats.failed;
  if (!force && done % 25 !== 0) return;
  const el = (Date.now() - stats.startTime) / 1000;
  const rate = done > 0 ? (done / el).toFixed(1) : '0';
  const mb = (stats.bytesUploaded / 1024 / 1024).toFixed(0);
  const pct = stats.total > 0 ? (done / stats.total * 100).toFixed(1) : 0;
  log(`📊 ${pct}% (${done}/${stats.total}) | ✅${stats.uploaded} ❌${stats.failed} 🔄${stats.swapped} | ${rate} img/s | ${mb}MB`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🔧 Fix ALL Remaining non-R2 Images                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Workers: ${WORKERS} | Limit: ${LIMIT > 0 ? LIMIT : 'ALL'}\n`);

  // Step 1: Collect ALL non-R2 image IDs
  log('📋 Step 1: Collecting all non-R2 images...');
  
  const allImages = [];
  const filters = ['gmbr.pro', 'gmbar.xyz', 'uwakjawa.xyz'];
  
  for (const filter of filters) {
    let offset = 0;
    while (true) {
      let data = null, error = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await sb.from('chapter_images')
          .select('id, chapter_id, number, image_url')
          .like('image_url', `%${filter}%`)
          .range(offset, offset + 999);
        data = result.data;
        error = result.error;
        if (!error) break;
        await sleep(2000 * (attempt + 1));
      }
      if (error) { log(`⚠️ Query failed for ${filter}: ${error.message}`); break; }
      if (!data?.length) break;
      
      for (const row of data) {
        // Skip if already collected (dedup by id)
        if (!allImages.find(i => i.id === row.id)) {
          allImages.push({ ...row, source: filter });
        }
      }
      offset += 1000;
      if (data.length < 1000) break;
    }
    log(`  ${filter}: collected`);
  }
  
  stats.total = LIMIT > 0 ? Math.min(LIMIT, allImages.length) : allImages.length;
  log(`📊 Total non-R2 images to process: ${allImages.length} (processing: ${stats.total})`);

  // Step 2: Launch browser
  log('🌐 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: { 'Referer': 'https://www.google.com/' },
  });
  
  const pages = [];
  for (let i = 0; i < WORKERS; i++) {
    pages.push(await context.newPage());
  }
  log(`✅ ${WORKERS} browser pages ready`);

  // Step 3: Process in batches
  const imagesToProcess = LIMIT > 0 ? allImages.slice(0, LIMIT) : allImages;
  const BATCH_SIZE = 100;
  
  for (let batchStart = 0; batchStart < imagesToProcess.length; batchStart += BATCH_SIZE) {
    const batch = imagesToProcess.slice(batchStart, batchStart + BATCH_SIZE);
    
    let idx = 0;
    
    async function worker(page) {
      while (idx < batch.length) {
        const img = batch[idx++];
        if (!img) break;
        
        const r2Key = `chapters/${img.chapter_id}/${img.number}.jpg`;
        const r2Url = `/api/r2/image/${r2Key}`;
        
        const downloaded = await downloadWithRetries(page, img.image_url);
        
        if (!downloaded) {
          stats.failed++;
        } else {
          try {
            stats.bytesUploaded += downloaded.buffer.length;
            await uploadToR2(r2Key, downloaded.buffer, downloaded.contentType);
            stats.uploaded++;
            if (downloaded.usedUrl !== img.image_url) stats.swapped++;
            stats.dbUpdates.push({ id: img.id, url: r2Url });
          } catch {
            stats.failed++;
          }
        }
        printProgress();
        await sleep(150);
      }
    }
    
    await Promise.all(pages.map(p => worker(p)));
    
    // Flush DB updates
    for (const u of stats.dbUpdates) {
      try { await sb.from('chapter_images').update({ image_url: u.url }).eq('id', u.id); } catch {}
    }
    stats.dbUpdates = [];
    
    log(`📦 Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(imagesToProcess.length / BATCH_SIZE)} done`);
  }

  // Final stats
  const mins = ((Date.now() - stats.startTime) / 60000).toFixed(1);
  const mb = (stats.bytesUploaded / 1024 / 1024).toFixed(0);
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`✅ DONE in ${mins} min!`);
  log(`   📤 Uploaded: ${stats.uploaded.toLocaleString()} (${mb}MB)`);
  log(`   🔄 Domain swapped: ${stats.swapped}`);
  log(`   ❌ Failed (dead): ${stats.failed.toLocaleString()}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const p of pages) await p.close();
  await context.close();
  await browser.close();
}

main().catch(e => { log('Fatal: ' + e.message); process.exit(1); });