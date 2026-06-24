#!/usr/bin/env node
/**
 * Backfill dead domain images by re-scraping from manhwaland source.
 *
 * CRITICAL: gmbr.pro/gmbar.xyz/uwakjawa.xyz have bot protection that blocks
 * server-side fetch() with 403. Only a REAL browser (Playwright) can download
 * these images. This script uses Playwright to:
 *   1. Navigate to each chapter page on manhwaland
 *   2. Intercept image responses from gmbr.pro CDN
 *   3. Scroll to trigger lazy loading (captures all pages)
 *   4. Upload captured buffers to R2
 *   5. Update chapter_images table with new R2 proxy URLs
 *
 * Usage:
 *   node scripts/backfill-dead-images-from-source.mjs              # Full run
 *   node scripts/backfill-dead-images-from-source.mjs --dry-run     # Preview only
 *   node scripts/backfill-dead-images-from-source.mjs --manga=SLUG  # Single manga
 *   node scripts/backfill-dead-images-from-source.mjs --limit=10    # Limit chapters
 *   node scripts/backfill-dead-images-from-source.mjs --chapter=UUID # Single chapter
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

const CHAPTER_DELAY = 1500;   // Delay between chapters (ms)
const MANGA_DELAY = 2000;     // Delay between manga (ms)
const SCROLL_STEPS = 15;      // Number of scroll steps to trigger lazy loading
const SCROLL_WAIT = 800;      // Wait between scrolls (ms)
const PAGE_TIMEOUT = 30000;   // Navigation timeout (ms)
const BROWSER_RESTART_INTERVAL = 20; // Restart browser every N chapters
const MAX_RETRIES = 2;        // Retry count per chapter on browser failure
const DB_QUERY_BATCH = 200;   // Smaller batches to avoid DB timeout
const DB_QUERY_RETRIES = 3;   // Retry count for DB queries

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MANGA_FILTER = args.find(a => a.startsWith('--manga='))?.split('=')[1];
const CHAPTER_FILTER = args.find(a => a.startsWith('--chapter='))?.split('=')[1];
const LIMIT_ARG = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);

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

// CDN domains we want to capture from chapter pages
const CDN_DOMAINS = [
  'gmbr.pro',
  'gmbar.xyz',
  'uwakjawa.xyz',
  'kambingjantan.cc',
  'manhwaland.in',
];

function isCdnImage(url) {
  return CDN_DOMAINS.some(d => url.includes(d)) &&
    /\.(jpg|jpeg|png|webp|gif|avif)/i.test(url) &&
    !url.includes('/covers/'); // Exclude cover images
}

/**
 * Sort image URLs by their embedded page number (001.jpg, 002.jpg, etc.)
 */
function sortByPageNumber(urls) {
  return [...urls].sort((a, b) => {
    const numA = parseInt(a.match(/(\d+)\.(jpg|jpeg|png|webp|gif|avif)/i)?.[1] || '0', 10);
    const numB = parseInt(b.match(/(\d+)\.(jpg|jpeg|png|webp|gif|avif)/i)?.[1] || '0', 10);
    return numA - numB;
  });
}

/**
 * Upload buffer to R2 with sequential page number
 */
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

// ─── Progress file ───
const PROGRESS_FILE = path.join(__dirname, '..', 'backfill-dead-progress.json');

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { completedChapters: [], failedChapters: [] };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * DB query with retry - smaller batches to avoid timeout
 */
async function dbQueryWithRetry(queryFn, label) {
  let lastError = null;
  for (let i = 0; i < DB_QUERY_RETRIES; i++) {
    try {
      const result = await queryFn();
      if (result.error) throw result.error;
      return result;
    } catch (e) {
      lastError = e;
      console.log(`  ⚠️  DB ${label} retry ${i + 1}/${DB_QUERY_RETRIES}: ${e.message.substring(0, 80)}`);
      await sleep(2000);
    }
  }
  return { data: null, error: lastError };
}

// ─── Browser lifecycle management ───
// State: holds browser, context that can be restarted on crash
let _browser = null;
let _context = null;
let _chapterCount = 0;
let _browserDead = false; // Flag set by 'disconnected' event

async function launchBrowser() {
  // Close existing if any
  await closeBrowser();

  _browserDead = false;
  _browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
    ],
  });

  // Listen for browser crash/disconnect
  _browser.on('disconnected', () => {
    _browserDead = true;
    console.log('   ⚠️  Browser disconnected/crashed');
  });

  _context = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'id-ID',
    extraHTTPHeaders: {
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  _chapterCount = 0;
}

async function closeBrowser() {
  try {
    if (_context) {
      await _context.close();
    }
  } catch {}
  try {
    if (_browser) {
      await _browser.close();
    }
  } catch {}
  _context = null;
  _browser = null;
  _browserDead = false;
}

/**
 * Check if browser is alive via flag set by disconnected event
 */
function isBrowserAlive() {
  if (!_browser || !_context || _browserDead) return false;
  return true;
}

/**
 * Ensure browser is alive, restart if needed
 */
async function ensureBrowser() {
  if (!isBrowserAlive()) {
    console.log('   🔄 Restarting browser (was dead)...');
    await launchBrowser();
    return;
  }

  // Restart browser every N chapters to prevent memory leak
  if (_chapterCount >= BROWSER_RESTART_INTERVAL) {
    console.log(`   🔄 Restarting browser (every ${BROWSER_RESTART_INTERVAL} chapters)...`);
    await launchBrowser();
  }
}

// ─── Playwright chapter scraper ───

/**
 * Scrape a single chapter with a FRESH page.
 * Creates a new page, scrapes, and closes it.
 * Returns array of { url, buffer, contentType }
 */
async function scrapeChapterImagesFresh(chapterUrl) {
  await ensureBrowser();

  // Create a FRESH page for each chapter
  const page = await _context.newPage();
  const capturedImages = new Map(); // url → { buffer, contentType }

  // Intercept responses to capture image buffers
  page.on('response', async (response) => {
    const url = response.url();
    if (isCdnImage(url) && response.status() === 200) {
      try {
        const buffer = await response.body();
        const contentType = response.headers()['content-type'] || 'image/jpeg';
        if (buffer.length > 0 && buffer.length < 15 * 1024 * 1024) {
          capturedImages.set(url, { buffer, contentType });
        }
      } catch {
        // Body may already be consumed or response redirected
      }
    }
  });

  try {
    // Navigate to chapter page
    await page.goto(chapterUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });

    // Wait a moment for Cloudflare/JS to execute
    await page.waitForTimeout(3000);

    // Scroll down gradually to trigger lazy loading of all images
    for (let i = 0; i < SCROLL_STEPS; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(SCROLL_WAIT);
    }

    // Scroll back to top and down once more to catch any stragglers
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    for (let i = 0; i < SCROLL_STEPS; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(400);
    }

    // Final wait for pending image downloads
    await page.waitForTimeout(2000);
  } finally {
    // ALWAYS close the page, even on error
    try {
      await page.close();
    } catch {}
    _chapterCount++;
  }

  // Convert to sorted array by URL page number, but use SEQUENTIAL index
  // for actual page number to avoid collisions across CDN domains
  const sortedUrls = sortByPageNumber([...capturedImages.keys()]);
  return sortedUrls.map((url) => {
    const data = capturedImages.get(url);
    return {
      url,
      buffer: data.buffer,
      contentType: data.contentType,
    };
  });
}

/**
 * Scrape with retry — restarts browser on failure
 */
async function scrapeWithRetry(chapterUrl) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const images = await scrapeChapterImagesFresh(chapterUrl);
      return images;
    } catch (e) {
      lastError = e;
      const msg = e.message.substring(0, 100);
      console.log(`      ⚠️  Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${msg}`);

      // If browser is dead, restart it for next attempt
      if (msg.includes('closed') || msg.includes('Target') || msg.includes('browser')) {
        console.log(`      🔄 Browser dead, restarting...`);
        await closeBrowser();
      }

      await sleep(3000); // Wait before retry
    }
  }

  throw lastError;
}

/**
 * Parse chapter number from URL slug segment.
 * Handles formats:
 *   -chapter-10       → 10
 *   -chapter-10.5     → 10.5  (dot format, older)
 *   -chapter-10-1     → 10.1  (dash format, manhwaland standard)
 *   -chapter-10-1-2   → 10.1  (variant, ignore trailing part)
 */
function parseChapterNumber(slug) {
  const parts = slug.split(/[-.]/);
  const major = parseInt(parts[0], 10);
  if (isNaN(major)) return null;

  if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
    return parseFloat(`${major}.${parts[1]}`);
  }
  return major;
}

/**
 * Scrape manga page to get chapter URLs using simple fetch (no bot protection on manga pages)
 */
async function fetchChapterUrls(mangaSourceUrl) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
  };

  const res = await fetch(mangaSourceUrl, {
    headers,
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Match chapter URLs: href=".../{slug}-chapter-{SLUG}/"
  // SLUG can be: 10, 10.5, 10-1, 10-1-2, etc.
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

  // Deduplicate by number — prefer SHORTEST URL (skip variants like -10-1-2)
  const byNumber = {};
  for (const c of chapters) {
    const existing = byNumber[c.number];
    if (!existing || c.url.length < existing.url.length) {
      byNumber[c.number] = c;
    }
  }
  return Object.values(byNumber);
}

// ─── Main ───
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🔄 Backfill Dead Images from Source (Playwright)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`  Browser restart: every ${BROWSER_RESTART_INTERVAL} chapters`);
  console.log(`  Retry per chapter: ${MAX_RETRIES}x`);
  console.log(`  DB batch size: ${DB_QUERY_BATCH}`);
  if (MANGA_FILTER) console.log(`  Manga filter: ${MANGA_FILTER}`);
  if (CHAPTER_FILTER) console.log(`  Chapter filter: ${CHAPTER_FILTER}`);
  if (LIMIT_ARG) console.log(`  Chapter limit: ${LIMIT_ARG}`);
  console.log();

  // 1. Get all chapters with dead images using KEYSET PAGINATION (cursor-based)
  // .range(offset) is O(n²) — PostgreSQL must skip `offset` rows, causing timeout
  // Keyset: WHERE id > cursor ORDER BY id LIMIT batch — O(1) per page always
  console.log('📊 Step 1: Finding chapters with dead images (keyset pagination)...');
  const byChapter = {};  // chapter_id → count of dead images
  let cursor = null;     // Last seen id for keyset pagination
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

    if (result.error) {
      console.error(`  ❌ Query failed after ${totalDead} images:`, result.error.message);
      break;
    }
    if (!result.data || result.data.length === 0) break;

    for (const img of result.data) {
      if (!byChapter[img.chapter_id]) byChapter[img.chapter_id] = 0;
      byChapter[img.chapter_id]++;
    }

    cursor = result.data[result.data.length - 1].id;
    totalDead += result.data.length;
    process.stdout.write(`\r  Found ${totalDead} dead images...`);

    if (result.data.length < DB_QUERY_BATCH) break; // No more rows
  }
  console.log(`\n  Found ${totalDead} dead images total across ${Object.keys(byChapter).length} chapters`);

  const chapterIds = Object.keys(byChapter);

  // 2. Load chapter + manga info
  console.log('\n📊 Step 2: Loading chapter & manga info...');
  const allChapters = [];
  for (let i = 0; i < chapterIds.length; i += 50) {
    const batch = chapterIds.slice(i, i + 50);
    const result = await dbQueryWithRetry(async () => {
      return await sb.from('chapters')
        .select('id, title, source_url, manga_id, number')
        .in('id', batch);
    }, `chapters @${i}`);
    if (result.data) allChapters.push(...result.data);
  }

  const mangaIds = [...new Set(allChapters.map(c => c.manga_id))];
  const allManga = [];
  for (let i = 0; i < mangaIds.length; i += 50) {
    const batch = mangaIds.slice(i, i + 50);
    const result = await dbQueryWithRetry(async () => {
      return await sb.from('manga')
        .select('id, title, slug, source_url, content_rating')
        .in('id', batch);
    }, `manga @${i}`);
    if (result.data) allManga.push(...result.data);
  }

  const mangaMap = {};
  allManga.forEach(m => mangaMap[m.id] = m);

  // Filter by manga slug if specified
  if (MANGA_FILTER) {
    const filteredManga = allManga.filter(m => m.slug === MANGA_FILTER);
    if (filteredManga.length === 0) {
      console.error(`❌ Manga "${MANGA_FILTER}" not found`);
      process.exit(1);
    }
    const allowedIds = new Set(filteredManga.map(m => m.id));
    const before = allChapters.length;
    const filtered = allChapters.filter(c => allowedIds.has(c.manga_id));
    console.log(`  Filtered to ${filtered.length}/${before} chapters for "${MANGA_FILTER}"`);
    allChapters.length = 0;
    allChapters.push(...filtered);
  }

  // Filter by chapter ID if specified
  if (CHAPTER_FILTER) {
    const filtered = allChapters.filter(c => c.id === CHAPTER_FILTER);
    if (filtered.length === 0) {
      console.error(`❌ Chapter "${CHAPTER_FILTER}" not found in dead image list`);
      process.exit(1);
    }
    console.log(`  Filtered to 1 chapter: ${CHAPTER_FILTER}`);
    allChapters.length = 0;
    allChapters.push(...filtered);
  }

  // Apply limit
  if (LIMIT_ARG > 0 && allChapters.length > LIMIT_ARG) {
    console.log(`  Limiting to ${LIMIT_ARG} chapters`);
    allChapters.length = LIMIT_ARG;
  }

  // Group chapters by manga
  const chaptersByManga = {};
  allChapters.forEach(c => {
    if (!chaptersByManga[c.manga_id]) chaptersByManga[c.manga_id] = [];
    chaptersByManga[c.manga_id].push(c);
  });

  console.log(`  ${allChapters.length} chapters across ${Object.keys(chaptersByManga).length} manga\n`);

  if (DRY_RUN) {
    console.log('  ⚠️  DRY RUN - listing what would be processed:\n');
    for (const [mangaId, chapters] of Object.entries(chaptersByManga)) {
      const manga = mangaMap[mangaId];
      if (!manga) continue;
      console.log(`  📖 ${manga.title.substring(0, 50)} (${chapters.length} chapters)`);
      for (const ch of chapters) {
        const deadCount = byChapter[ch.id] || 0;
        console.log(`     Ch ${ch.number}: ${deadCount} dead images`);
      }
    }
    console.log('\n  Run without --dry-run to execute.');
    return;
  }

  // 3. Launch Playwright browser
  console.log('🌐 Launching Playwright browser...\n');
  await launchBrowser();

  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalImagesFixed = 0;
  const progress = loadProgress();

  try {
    for (const [mangaId, chapters] of Object.entries(chaptersByManga)) {
      const manga = mangaMap[mangaId];
      if (!manga || !manga.source_url) {
        console.log(`⚠️  Skipping manga ${mangaId} - no source_url`);
        continue;
      }

      console.log(`\n📖 ${manga.title.substring(0, 50)}`);
      console.log(`   Source: ${manga.source_url}`);
      console.log(`   Chapters to fix: ${chapters.length}`);

      // Fetch chapter URLs from manga source page (simple fetch works)
      let sourceChapters = [];
      try {
        sourceChapters = await fetchChapterUrls(manga.source_url);
        console.log(`   Found ${sourceChapters.length} chapters on source`);
        if (sourceChapters.length === 0) {
          console.log(`   ⚠️  No chapter URLs found - skipping`);
          await sleep(MANGA_DELAY);
          continue;
        }
      } catch (e) {
        console.log(`   ❌ Failed to fetch manga page: ${e.message}`);
        await sleep(MANGA_DELAY);
        continue;
      }

      // Process each chapter
      for (const ch of chapters) {
        if (progress.completedChapters.includes(ch.id)) {
          console.log(`   Ch ${ch.number}: already done ✓`);
          continue;
        }

        const deadCount = byChapter[ch.id] || 0;
        console.log(`\n   Ch ${ch.number}: ${deadCount} dead images`);

        // Find matching source chapter URL
        const sourceCh = sourceChapters.find(sc => sc.number === ch.number) ||
          sourceChapters.find(sc => Math.abs(sc.number - parseFloat(ch.number)) < 0.01);

        if (!sourceCh) {
          console.log(`      ⚠️  No matching source chapter for #${ch.number}`);
          progress.failedChapters.push(ch.id);
          saveProgress(progress);
          totalFailed++;
          continue;
        }

        // Scrape chapter images via Playwright with retry
        let capturedImages = [];
        try {
          console.log(`      🌐 Scraping: ${sourceCh.url}`);
          capturedImages = await scrapeWithRetry(sourceCh.url);
          console.log(`      📸 Captured ${capturedImages.length} images`);

          if (capturedImages.length === 0) {
            console.log(`      ⚠️  No CDN images captured`);
            progress.failedChapters.push(ch.id);
            saveProgress(progress);
            totalFailed++;
            totalProcessed++;
            await sleep(CHAPTER_DELAY);
            continue;
          }
        } catch (e) {
          console.log(`      ❌ All retries exhausted: ${e.message.substring(0, 80)}`);
          progress.failedChapters.push(ch.id);
          saveProgress(progress);
          totalFailed++;
          totalProcessed++;
          await sleep(CHAPTER_DELAY);
          continue;
        }

        // STRATEGY: Replace ALL images for this chapter.
        // Use SEQUENTIAL numbering (1, 2, 3, ...) instead of extracting page
        // number from URL. This avoids dedup collisions when the same page
        // number appears across different CDN domains.
        const newImageRecords = [];
        for (let i = 0; i < capturedImages.length; i++) {
          const img = capturedImages[i];
          const pageNumber = i + 1; // Sequential: 1, 2, 3, ...

          try {
            const r2Url = await uploadToR2(img.buffer, img.contentType, ch.id, pageNumber);
            newImageRecords.push({
              chapter_id: ch.id,
              image_url: r2Url,
              number: pageNumber,
            });
          } catch (e) {
            console.log(`      ❌ Image ${pageNumber} upload failed: ${e.message.substring(0, 60)}`);
          }
        }

        let fixed = 0;
        if (newImageRecords.length > 0) {
          // Delete all existing images first, then insert fresh
          const { error: delError } = await sb.from('chapter_images')
            .delete()
            .eq('chapter_id', ch.id);

          if (delError) {
            console.log(`      ⚠️  Delete failed: ${delError.message}`);
          }

          const { error: insError } = await sb.from('chapter_images')
            .insert(newImageRecords);

          if (insError) {
            console.log(`      ⚠️  Insert failed: ${insError.message}`);
          } else {
            fixed = newImageRecords.length;
            totalImagesFixed += fixed;
          }
        }

        console.log(`      ✅ Replaced with ${fixed}/${capturedImages.length} fresh R2 images`);
        progress.completedChapters.push(ch.id);
        saveProgress(progress);
        totalSuccess++;
        totalProcessed++;

        await sleep(CHAPTER_DELAY);
      }

      await sleep(MANGA_DELAY);
    }
  } finally {
    await closeBrowser();
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  📊 BACKFILL COMPLETE');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Chapters processed: ${totalProcessed}`);
  console.log(`  Chapters succeeded: ${totalSuccess}`);
  console.log(`  Chapters failed:    ${totalFailed}`);
  console.log(`  Images fixed:       ${totalImagesFixed}`);
  console.log(`  Progress saved:     ${PROGRESS_FILE}`);
  console.log();

  // Clean up progress file if everything succeeded
  if (totalProcessed > 0 && totalFailed === 0) {
    try { fs.unlinkSync(PROGRESS_FILE); } catch {}
    console.log('  ✨ All chapters fixed — progress file cleaned up');
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});