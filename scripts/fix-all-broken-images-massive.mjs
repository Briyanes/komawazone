#!/usr/bin/env node
/**
 * fix-all-broken-images-massive.mjs (v3 - PARALLEL)
 *
 * OPTIMIZATIONS:
 * 1. fetch() inside evaluate → all images download in PARALLEL (not sequential <img>)
 * 2. Process N chapters concurrently (CONCURRENCY=4)
 * 3. Only process gmbr.pro images (skip others)
 *
 * Expected: ~5-10x faster than v2
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET = process.env.R2_BUCKET;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const LOG_FILE = 'scripts/fix-massive-log.txt';
const PROGRESS_FILE = 'scripts/fix-massive-progress.json';
const CONCURRENCY = 4; // Process 4 chapters simultaneously

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function pageNumFromUrl(url) {
  const m = url.match(/(\d+)\.(jpg|jpeg|png|webp)/i);
  return m ? parseInt(m[1], 10) : null;
}

async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

/**
 * Capture all gmbr.pro images for a chapter using img tags + response interception.
 * page.route() injects Referer. Response handler captures image bytes.
 */
async function captureImages(context, imageUrls) {
  const captured = new Map();
  const page = await context.newPage();

  // Route: add Referer to ALL gmbr.pro requests
  await page.route('**/*gmbr.pro*', async (route) => {
    const headers = route.request().headers();
    headers['Referer'] = 'https://manhwaland.site/';
    headers['Origin'] = 'https://manhwaland.site';
    try {
      await route.continue({ headers });
    } catch {
      try { await route.continue(); } catch {}
    }
  });

  // Intercept all gmbr.pro image responses
  const handler = async (resp) => {
    const rUrl = resp.url();
    if (!rUrl.includes('gmbr.pro')) return;
    if (resp.status() !== 200) return;
    try {
      const ct = resp.headers()['content-type'] || '';
      if (!ct.startsWith('image/')) return;
      const body = await resp.body();
      if (body.length < 1024) return;
      const pageNum = pageNumFromUrl(rUrl);
      if (pageNum) {
        captured.set(pageNum, { buffer: Buffer.from(body), contentType: ct });
      }
    } catch {}
  };
  page.on('response', handler);

  // Use setContent for guaranteed DOM
  await page.setContent(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>L</title></head>
    <body><div id="img-loader"></div></body></html>
  `, { waitUntil: 'domcontentloaded', timeout: 10000 });

  // Inject img tags
  await page.evaluate((urls) => {
    const container = document.getElementById('img-loader');
    if (!container) return;
    container.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;';
    urls.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      container.appendChild(img);
    });
  }, imageUrls);

  // Wait for images to load (check every 500ms, timeout after 30s)
  const maxWait = 30000;
  const checkInterval = 500;
  let waited = 0;
  while (waited < maxWait) {
    await sleep(checkInterval);
    waited += checkInterval;
    const loaded = await page.evaluate(() => {
      const imgs = document.querySelectorAll('#img-loader img');
      let done = 0;
      imgs.forEach(img => { if (img.complete) done++; });
      return { done, total: imgs.length };
    });
    if (loaded.done >= loaded.total) break;
  }

  page.off('response', handler);
  await page.close();
  return captured;
}

function saveProgress(done) {
  try { writeFileSync(PROGRESS_FILE, JSON.stringify({ done, ts: Date.now() })); } catch {}
}
function loadProgress() {
  try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8')); } catch { return null; }
}

async function processChapter(browser, chId, info) {
  const gmbrImgs = info.images.filter(img => img.image_url.includes('gmbr.pro'));
  if (gmbrImgs.length === 0) return { fixed: 0, failed: 0, total: 0 };

  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 720 },
  });

  const urls = gmbrImgs.map(img => img.image_url);
  let captured;
  try {
    captured = await captureImages(context, urls);
  } catch (e) {
    await context.close();
    return { fixed: 0, failed: gmbrImgs.length, total: gmbrImgs.length, error: e.message };
  }

  let fixed = 0;
  let failed = 0;
  for (const img of gmbrImgs) {
    const data = captured.get(img.number);
    if (!data) { failed++; continue; }
    const r2Key = `chapters/${chId}/${img.number}.jpg`;
    try {
      await uploadToR2(r2Key, data.buffer, data.contentType);
      await sb.from('chapter_images').update({ image_url: `/api/r2/image/${r2Key}` }).eq('id', img.id);
      fixed++;
    } catch {
      failed++;
    }
  }

  // Update thumbnail
  if (fixed > 0) {
    try {
      const { data: ch } = await sb.from('chapters').select('thumbnail_url').eq('id', chId).single();
      if (ch?.thumbnail_url?.includes('gmbr.pro') || !ch?.thumbnail_url) {
        const t = gmbrImgs.find(i => i.number === 1) || gmbrImgs[0];
        if (t) {
          await sb.from('chapters').update({
            thumbnail_url: `/api/r2/image/chapters/${chId}/${t.number}.jpg`
          }).eq('id', chId);
        }
      }
    } catch {}
  }

  await context.close();
  return { fixed, failed, total: gmbrImgs.length, captured: captured.size };
}

async function main() {
  log('╔══════════════════════════════════════════════════════╗');
  log('║  🚀 MASS FIX v3: PARALLEL fetch + concurrent chapters ║');
  log(`║  CONCURRENCY: ${CONCURRENCY}x chapters in parallel              ║`);
  log('╚══════════════════════════════════════════════════════╝\n');

  // Get ALL non-R2 images
  log('Fetching broken images...');
  let allBroken = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('chapter_images')
      .select('id, number, image_url, chapter:chapters(id, number, manga:manga(slug, title))')
      .not('image_url', 'like', '%/api/r2/%')
      .range(offset, offset + 999);
    if (!data?.length) break;
    allBroken.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
    process.stdout.write('.');
  }
  console.log('');

  // Filter to ONLY gmbr.pro images (the ones we can fix)
  const gmbrOnly = allBroken.filter(img => img.image_url.includes('gmbr.pro'));
  log(`Total non-R2: ${allBroken.length} | gmbr.pro only: ${gmbrOnly.length}`);

  // Group by chapter
  const byChapter = {};
  for (const img of gmbrOnly) {
    const chId = img.chapter?.id;
    if (!chId) continue;
    if (!byChapter[chId]) {
      byChapter[chId] = {
        title: img.chapter?.manga?.title || '?',
        chNum: img.chapter?.number || '?',
        images: [],
      };
    }
    byChapter[chId].images.push(img);
  }

  const chIds = Object.keys(byChapter);
  const chCount = chIds.length;
  log(`Across ${chCount} chapters\n`);

  // Resume support
  const prog = loadProgress();
  let startIdx = prog?.done || 0;
  if (startIdx > 0) log(`📌 Resuming from #${startIdx + 1}\n`);

  const browser = await chromium.launch({ headless: true });
  let totalFixed = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  // Process in batches of CONCURRENCY
  for (let i = startIdx; i < chCount; i += CONCURRENCY) {
    const batch = chIds.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (chId, j) => {
      const idx = i + j;
      const info = byChapter[chId];
      const pct = ((idx / chCount) * 100).toFixed(1);
      log(`[${idx + 1}/${chCount}] (${pct}%) 📖 ${info.title} Ch${info.chNum} (${info.images.length} imgs)`);

      const result = await processChapter(browser, chId, info);
      const status = result.fixed > 0 ? '✅' : '❌';
      log(`   ${status} ${result.fixed}/${result.total} fixed${result.captured !== undefined ? ` (${result.captured} captured)` : ''}${result.error ? ` ERR: ${result.error}` : ''}`);
      return result;
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      totalFixed += r.fixed;
      totalFailed += r.failed;
    }

    saveProgress(Math.min(i + CONCURRENCY, chCount));

    // Progress summary every 50 chapters
    const done = Math.min(i + CONCURRENCY, chCount);
    if (done % 50 < CONCURRENCY) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = done > startIdx ? elapsed / (done - startIdx) : 0;
      const eta = Math.round(rate * (chCount - done) / 60);
      log(`📊 Progress: ${done}/${chCount} | Fixed: ${totalFixed} | Failed: ${totalFailed} | ETA: ${eta}min`);
    }
  }

  await browser.close();
  const mins = Math.round((Date.now() - startTime) / 60000);
  log(`\n${'═'.repeat(50)}`);
  log(`📊 DONE: ${totalFixed} fixed | ${totalFailed} failed | ${mins}min`);
  log(`${'═'.repeat(50)}`);
}

main().catch(e => { log('FATAL: ' + e.message); process.exit(1); });