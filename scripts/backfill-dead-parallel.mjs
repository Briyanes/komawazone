#!/usr/bin/env node
/**
 * PARALLEL Backfill Dead Images — 5x faster than single-browser version.
 *
 * Runs N independent browser workers in parallel, each processing chapters
 * from DIFFERENT manga simultaneously. This overlaps the slow scrolling/waiting
 * phase across multiple chapters, reducing effective time per chapter by ~5x.
 *
 * Usage:
 *   node scripts/backfill-dead-parallel.mjs                  # Full run (5 workers)
 *   node scripts/backfill-dead-parallel.mjs --workers=3      # Custom parallelism
 *   node scripts/backfill-dead-parallel.mjs --dry-run        # Preview only
 *   node scripts/backfill-dead-parallel.mjs --manga=SLUG     # Single manga
 *   node scripts/backfill-dead-parallel.mjs --limit=100      # Limit chapters
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// ─── Config ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

const CHAPTER_DELAY = 500;      // Reduced delay (parallel processing compensates)
const MANGA_DELAY = 1000;       // Reduced delay between manga
const SCROLL_STEPS = 12;        // Slightly fewer scroll steps
const SCROLL_WAIT = 600;        // Faster scroll wait
const PAGE_TIMEOUT = 25000;     // Slightly shorter timeout
const BROWSER_RESTART_INTERVAL = 15; // Restart browser every N chapters
const MAX_RETRIES = 2;
const DB_QUERY_BATCH = 1000;  // Increased from 200 → 1000 (5x fewer API calls)
const DB_QUERY_RETRIES = 3;
const UPLOAD_CONCURRENCY = 5;   // Upload images in parallel batches

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MANGA_FILTER = args.find(a => a.startsWith('--manga='))?.split('=')[1];
const LIMIT_ARG = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const NUM_WORKERS = parseInt(args.find(a => a.startsWith('--workers='))?.split('=')[1] || '5', 10);
const MAX_IMAGES = parseInt(args.find(a => a.startsWith('--max-images='))?.split('=')[1] || '0', 10);

// ─── Init ───
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase env vars');
  process.exit(1);
}
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('❌ Missing R2 env vars');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CDN_DOMAINS = [
  'gmbr.pro', 'gmbar.xyz', 'uwakjawa.xyz', 'kambingjantan.cc', 'manhwaland.in',
];

function isCdnImage(url) {
  return CDN_DOMAINS.some(d => url.includes(d)) &&
    /\.(jpg|jpeg|png|webp|gif|avif)/i.test(url) &&
    !url.includes('/covers/');
}

function sortByPageNumber(urls) {
  return [...urls].sort((a, b) => {
    const numA = parseInt(a.match(/(\d+)\.(jpg|jpeg|png|webp|gif|avif)/i)?.[1] || '0', 10);
    const numB = parseInt(b.match(/(\d+)\.(jpg|jpeg|png|webp|gif|avif)/i)?.[1] || '0', 10);
    return numA - numB;
  });
}

async function uploadToR2(buffer, contentType, chapterId, pageNumber) {
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const key = `chapters/${chapterId}/${pageNumber}.${ext}`;

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return `/api/r2/image/${key}`;
}

// ─── Shared Progress (atomic write) ───
const PROGRESS_FILE = path.join(__dirname, '..', 'backfill-dead-progress.json');
const progressLock = { writing: false };

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { completedChapters: [], failedChapters: [], totalImagesUploaded: 0, lastUpdated: null };
  }
}

async function saveProgress(progress) {
  // Simple spin-lock to prevent concurrent writes
  while (progressLock.writing) await sleep(50);
  progressLock.writing = true;
  try {
    progress.lastUpdated = new Date().toISOString();
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } finally {
    progressLock.writing = false;
  }
}

// ─── DB query with retry ───
async function dbQueryWithRetry(queryFn, label) {
  let lastError = null;
  for (let i = 0; i < DB_QUERY_RETRIES; i++) {
    try {
      const result = await queryFn();
      if (result.error) throw result.error;
      return result;
    } catch (e) {
      lastError = e;
      await sleep(2000);
    }
  }
  return { data: null, error: lastError };
}

// ─── Browser Worker Class ───
class BrowserWorker {
  constructor(id) {
    this.id = id;
    this.browser = null;
    this.context = null;
    this.chapterCount = 0;
    this.dead = false;
  }

  async launch() {
    await this.close();
    this.dead = false;
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions'],
    });

    this.browser.on('disconnected', () => {
      this.dead = true;
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'id-ID',
      extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' },
    });
    this.chapterCount = 0;
  }

  async close() {
    try { if (this.context) await this.context.close(); } catch {}
    try { if (this.browser) await this.browser.close(); } catch {}
    this.context = null;
    this.browser = null;
    this.dead = false;
  }

  isAlive() {
    return this.browser && this.context && !this.dead;
  }

  async ensureAlive() {
    if (!this.isAlive()) {
      await this.launch();
      return;
    }
    if (this.chapterCount >= BROWSER_RESTART_INTERVAL) {
      await this.launch();
    }
  }

  async scrapeChapter(chapterUrl) {
    await this.ensureAlive();
    const page = await this.context.newPage();
    const capturedImages = new Map();

    page.on('response', async (response) => {
      const url = response.url();
      if (isCdnImage(url) && response.status() === 200) {
        try {
          const buffer = await response.body();
          const contentType = response.headers()['content-type'] || 'image/jpeg';
          if (buffer.length > 0 && buffer.length < 15 * 1024 * 1024) {
            capturedImages.set(url, { buffer, contentType });
          }
        } catch {}
      }
    });

    try {
      await page.goto(chapterUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
      await page.waitForTimeout(2500);

      // Scroll to trigger lazy loading
      for (let i = 0; i < SCROLL_STEPS; i++) {
        await page.evaluate(() => window.scrollBy(0, 700));
        await page.waitForTimeout(SCROLL_WAIT);
      }

      // Quick second pass
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      for (let i = 0; i < SCROLL_STEPS; i++) {
        await page.evaluate(() => window.scrollBy(0, 900));
        await page.waitForTimeout(300);
      }

      await page.waitForTimeout(1500);
    } finally {
      try { await page.close(); } catch {}
      this.chapterCount++;
    }

    const sortedUrls = sortByPageNumber([...capturedImages.keys()]);
    return sortedUrls.map(url => {
      const data = capturedImages.get(url);
      return { url, buffer: data.buffer, contentType: data.contentType };
    });
  }

  async scrapeWithRetry(chapterUrl) {
    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.scrapeChapter(chapterUrl);
      } catch (e) {
        lastError = e;
        if (e.message.includes('closed') || e.message.includes('Target') || e.message.includes('browser')) {
          await this.close();
        }
        await sleep(2000);
      }
    }
    throw lastError;
  }
}

// ─── Helpers ───
function parseChapterNumber(slug) {
  const parts = slug.split(/[-.]/);
  const major = parseInt(parts[0], 10);
  if (isNaN(major)) return null;
  if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
    return parseFloat(`${major}.${parts[1]}`);
  }
  return major;
}

async function fetchChapterUrls(mangaSourceUrl) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
  };

  const res = await fetch(mangaSourceUrl, { headers, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const chapters = [];
  const regex = /href="(https?:\/\/[^"]*-chapter-([^"\/]+))\/?"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1];
    const slug = match[2];
    const num = parseChapterNumber(slug);
    if (num === null) continue;
    chapters.push({ url, number: num });
  }

  const byNumber = {};
  for (const c of chapters) {
    const existing = byNumber[c.number];
    if (!existing || c.url.length < existing.url.length) {
      byNumber[c.number] = c;
    }
  }
  return Object.values(byNumber);
}

/**
 * Upload images in parallel batches
 */
async function uploadImagesParallel(capturedImages, chapterId) {
  const results = [];

  for (let i = 0; i < capturedImages.length; i += UPLOAD_CONCURRENCY) {
    const batch = capturedImages.slice(i, i + UPLOAD_CONCURRENCY);
    const uploadPromises = batch.map(async (img, batchIdx) => {
      const pageNumber = i + batchIdx + 1;
      try {
        const r2Url = await uploadToR2(img.buffer, img.contentType, chapterId, pageNumber);
        return { chapter_id: chapterId, image_url: r2Url, number: pageNumber };
      } catch {
        return null;
      }
    });

    const batchResults = await Promise.all(uploadPromises);
    results.push(...batchResults.filter(r => r !== null));
  }

  return results;
}

// ─── Process single chapter ───
async function processChapter(worker, ch, deadCount, manga, sourceChapters, progress, stats) {
  if (progress.completedChapters.includes(ch.id)) {
    return 'skipped';
  }

  // Find matching source chapter URL
  const sourceCh = sourceChapters.find(sc => sc.number === ch.number) ||
    sourceChapters.find(sc => Math.abs(sc.number - parseFloat(ch.number)) < 0.01);

  if (!sourceCh) {
    progress.failedChapters.push(ch.id);
    await saveProgress(progress);
    stats.failed++;
    return 'no_source';
  }

  // Scrape
  let capturedImages = [];
  try {
    capturedImages = await worker.scrapeWithRetry(sourceCh.url);
    if (capturedImages.length === 0) {
      progress.failedChapters.push(ch.id);
      await saveProgress(progress);
      stats.failed++;
      return 'no_images';
    }
  } catch (e) {
    progress.failedChapters.push(ch.id);
    await saveProgress(progress);
    stats.failed++;
    return 'scrape_error';
  }

  // Upload in parallel
  const newImageRecords = await uploadImagesParallel(capturedImages, ch.id);

  if (newImageRecords.length > 0) {
    // Delete existing, insert fresh
    await sb.from('chapter_images').delete().eq('chapter_id', ch.id);
    const { error: insError } = await sb.from('chapter_images').insert(newImageRecords);

    if (!insError) {
      stats.imagesFixed += newImageRecords.length;
      progress.totalImagesUploaded = (progress.totalImagesUploaded || 0) + newImageRecords.length;

      // Update thumbnail to 5th image
      const thumbRecord = newImageRecords.length >= 5 ? newImageRecords[4] : newImageRecords[newImageRecords.length - 1];
      if (thumbRecord) {
        await sb.from('chapters').update({ thumbnail_url: thumbRecord.image_url }).eq('id', ch.id);
      }
    }
  }

  progress.completedChapters.push(ch.id);
  await saveProgress(progress);
  stats.success++;
  return 'success';
}

// ─── Main ───
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🚀 PARALLEL Backfill Dead Images');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Workers: ${NUM_WORKERS} parallel browsers`);
  console.log(`  Upload concurrency: ${UPLOAD_CONCURRENCY} per batch`);
  if (MANGA_FILTER) console.log(`  Manga filter: ${MANGA_FILTER}`);
  if (LIMIT_ARG) console.log(`  Chapter limit: ${LIMIT_ARG}`);
  if (MAX_IMAGES > 0) console.log(`  Max images/batch: ${MAX_IMAGES.toLocaleString()}`);
  console.log();

  // 1. Find chapters with dead images (keyset pagination)
  console.log('📊 Step 1: Finding chapters with dead images...');
  const byChapter = {};
  let cursor = null;
  let totalDead = 0;

  while (true) {
    const result = await dbQueryWithRetry(async () => {
      let q = sb.from('chapter_images')
        .select('id, chapter_id')
        .not('image_url', 'like', '/api/r2/image/%')
        .order('id', { ascending: true })
        .limit(DB_QUERY_BATCH);
      if (cursor) q = q.gt('id', cursor);
      return await q;
    }, `dead images @${totalDead}`);

    if (result.error || !result.data || result.data.length === 0) break;

    for (const img of result.data) {
      byChapter[img.chapter_id] = (byChapter[img.chapter_id] || 0) + 1;
    }
    cursor = result.data[result.data.length - 1].id;
    totalDead += result.data.length;
    process.stdout.write(`\r  Found ${totalDead} dead images across ${Object.keys(byChapter).length} chapters...`);

    if (result.data.length < DB_QUERY_BATCH) break;

    // Early exit: if we have enough chapters for this batch, stop scanning
    if (MAX_IMAGES > 0) {
      const estimatedChaptersNeeded = Math.ceil(MAX_IMAGES / 10) + 200; // ~10 imgs/chapter + buffer
      if (Object.keys(byChapter).length >= estimatedChaptersNeeded) {
        console.log(`\n  ⚡ Early exit: ${Object.keys(byChapter).length} chapters found (> ${estimatedChaptersNeeded} needed for ${MAX_IMAGES} imgs)`);
        break;
      }
    }
  }
  console.log(`\n  Found ${totalDead.toLocaleString()} dead images across ${Object.keys(byChapter).length} chapters`);

  // 2. Load chapter + manga info
  console.log('\n📊 Step 2: Loading chapter & manga info...');
  const chapterIds = Object.keys(byChapter);
  const allChapters = [];
  for (let i = 0; i < chapterIds.length; i += 50) {
    const batch = chapterIds.slice(i, i + 50);
    const result = await dbQueryWithRetry(async () => {
      return await sb.from('chapters').select('id, title, source_url, manga_id, number').in('id', batch);
    }, `chapters @${i}`);
    if (result.data) allChapters.push(...result.data);
  }

  const mangaIds = [...new Set(allChapters.map(c => c.manga_id))];
  const allManga = [];
  for (let i = 0; i < mangaIds.length; i += 50) {
    const batch = mangaIds.slice(i, i + 50);
    const result = await dbQueryWithRetry(async () => {
      return await sb.from('manga').select('id, title, slug, source_url, content_rating').in('id', batch);
    }, `manga @${i}`);
    if (result.data) allManga.push(...result.data);
  }

  const mangaMap = {};
  allManga.forEach(m => mangaMap[m.id] = m);

  // Filter
  let filteredChapters = allChapters;
  if (MANGA_FILTER) {
    const allowedIds = new Set(allManga.filter(m => m.slug === MANGA_FILTER).map(m => m.id));
    filteredChapters = allChapters.filter(c => allowedIds.has(c.manga_id));
  }
  if (LIMIT_ARG > 0) {
    filteredChapters = filteredChapters.slice(0, LIMIT_ARG);
  }

  // Group by manga
  const chaptersByManga = {};
  filteredChapters.forEach(c => {
    if (!chaptersByManga[c.manga_id]) chaptersByManga[c.manga_id] = [];
    chaptersByManga[c.manga_id].push(c);
  });

  console.log(`  ${filteredChapters.length} chapters across ${Object.keys(chaptersByManga).length} manga\n`);

  if (DRY_RUN) {
    console.log('  ⚠️  DRY RUN:\n');
    for (const [mangaId, chapters] of Object.entries(chaptersByManga)) {
      const manga = mangaMap[mangaId];
      if (!manga) continue;
      console.log(`  📖 ${manga.title.substring(0, 50)} (${chapters.length} chapters)`);
    }
    return;
  }

  // 3. Pre-fetch all source chapter URLs for all manga (in parallel)
  console.log('🌐 Pre-fetching chapter URLs from source sites...\n');
  const mangaSourceChapters = {}; // manga_id → sourceChapters[]
  const mangaList = Object.entries(chaptersByManga);

  // Fetch in batches of 10 to avoid overwhelming
  for (let i = 0; i < mangaList.length; i += 10) {
    const batch = mangaList.slice(i, i + 10);
    const fetchPromises = batch.map(async ([mangaId, _chapters]) => {
      const manga = mangaMap[mangaId];
      if (!manga || !manga.source_url) return;
      try {
        const sc = await fetchChapterUrls(manga.source_url);
        mangaSourceChapters[mangaId] = sc;
      } catch (e) {
        console.log(`  ⚠️  Failed to fetch ${manga?.title?.substring(0, 30)}: ${e.message.substring(0, 60)}`);
      }
    });
    await Promise.all(fetchPromises);
    process.stdout.write(`\r  Fetched ${Math.min(i + 10, mangaList.length)}/${mangaList.length} manga pages...`);
  }
  console.log('\n');

  // 4. Create work queue: flatten all chapters into a queue
  const workQueue = [];
  for (const [mangaId, chapters] of mangaList) {
    const manga = mangaMap[mangaId];
    const sourceChapters = mangaSourceChapters[mangaId] || [];
    for (const ch of chapters) {
      workQueue.push({ chapter: ch, manga, sourceChapters, deadCount: byChapter[ch.id] || 0 });
    }
  }

  console.log(`📋 Work queue: ${workQueue.length} chapters`);
  console.log(`🚀 Launching ${NUM_WORKERS} parallel workers...\n`);

  // 5. Launch workers and process queue in parallel
  const workers = [];
  for (let i = 0; i < NUM_WORKERS; i++) {
    const w = new BrowserWorker(i);
    await w.launch();
    workers.push(w);
  }

  const progress = loadProgress();
  const stats = { success: 0, failed: 0, imagesFixed: 0, total: workQueue.length };
  let queueIndex = 0;
  const startTime = Date.now();

  async function workerLoop(worker) {
    while (queueIndex < workQueue.length) {
      // Stop if we've hit the image limit for this batch
      if (MAX_IMAGES > 0 && stats.imagesFixed >= MAX_IMAGES) {
        console.log(`  [W${worker.id}] 🛑 Image limit reached (${MAX_IMAGES.toLocaleString()}) — stopping batch`);
        return;
      }

      const idx = queueIndex++;
      const item = workQueue[idx];
      if (!item) break;

      const { chapter: ch, manga, sourceChapters, deadCount } = item;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (stats.success / Math.max(1, elapsed / 60)).toFixed(1);
      const imgInfo = MAX_IMAGES > 0 ? ` | ${stats.imagesFixed}/${MAX_IMAGES} imgs` : '';
      console.log(`  [W${worker.id}] Ch ${ch.number} (${manga.title.substring(0, 25)}...) [${deadCount} dead] | ${stats.success}✓ ${stats.failed}✗ | ${rate} ch/min${imgInfo}`);

      const result = await processChapter(worker, ch, deadCount, manga, sourceChapters, progress, stats);

      if (result === 'success') {
        console.log(`  [W${worker.id}]   ✅ Fixed (${stats.imagesFixed} images total)`);
      } else if (result === 'skipped') {
        // Already done, no log needed
      } else {
        console.log(`  [W${worker.id}]   ⚠️  ${result}`);
      }

      await sleep(CHAPTER_DELAY);
    }
  }

  // Run all workers in parallel
  await Promise.all(workers.map(w => workerLoop(w)));

  // Cleanup
  await Promise.all(workers.map(w => w.close()));

  // Summary
  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  📊 PARALLEL BACKFILL COMPLETE');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Workers used:      ${NUM_WORKERS}`);
  console.log(`  Chapters done:     ${stats.success}`);
  console.log(`  Chapters failed:   ${stats.failed}`);
  console.log(`  Images uploaded:   ${stats.imagesUploaded || stats.imagesFixed}`);
  console.log(`  Time elapsed:      ${elapsedMin} min`);
  console.log(`  Speed:             ${(stats.success / Math.max(0.1, parseFloat(elapsedMin))).toFixed(1)} ch/min`);
  console.log();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});