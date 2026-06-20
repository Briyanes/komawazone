#!/usr/bin/env node
/**
 * download-all-chapter-images.mjs
 *
 * Pre-downloads ALL chapter images to R2 storage and sets thumbnails.
 *
 * Anti-down strategy (7 layers of source server protection):
 *   1. Low concurrency: 2 chapters × 2 images = 4 parallel downloads max
 *   2. Random delay: 500-1500ms between each image download
 *   3. Cooldown: 30s pause every 50 chapters
 *   4. Auto-backoff: 5 min pause on HTTP 429/503
 *   5. Rate limit: ~4 images/sec = ~14,400 images/hour
 *   6. Rotating User-Agent per request
 *   7. Resume capability via JSON progress file
 *
 * Usage:
 *   node scripts/download-all-chapter-images.mjs [--limit N] [--resume]
 *
 * Flags:
 *   --limit N    Process at most N chapters (for testing)
 *   --resume     Resume from last saved progress (skip completed chapters)
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const CHAPTER_CONCURRENCY = 2;     // 2 chapters processed in parallel
const IMAGE_CONCURRENCY = 2;       // 2 images downloaded in parallel per chapter
const DELAY_MIN = 500;             // 500ms min delay between images
const DELAY_MAX = 1500;            // 1500ms max delay between images
const COOLDOWN_EVERY = 50;         // Cooldown every N chapters
const COOLDOWN_DURATION = 30_000;  // 30 seconds cooldown
const BACKOFF_DURATION = 300_000;  // 5 minutes backoff on 429/503
const BATCH_SIZE = 100;            // Chapters to fetch from DB per batch

const PROGRESS_FILE = path.resolve(process.cwd(), 'scripts/download-all-images-progress.json');
const LOG_FILE = path.resolve(process.cwd(), 'scripts/download-all-images-progress.log');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
  return DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
}

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { completed: [], failed: [], lastOffset: 0, totalProcessed: 0 };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Env loading ─────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const envText = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of envText.split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

// ─── DB & R2 setup ───────────────────────────────────────────────────────────

const env = loadEnv();

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.R2_BUCKET || 'manga-zone';
const R2_PUBLIC_URL = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '') || '';
if (R2_PUBLIC_URL.includes('NEXT_PUBLIC') || R2_PUBLIC_URL.includes('=')) {
  console.error('❌ R2_PUBLIC_BASE_URL looks corrupted:', R2_PUBLIC_URL);
  console.error('   Check .env.local for missing newlines.');
  process.exit(1);
}

// ─── Core functions ──────────────────────────────────────────────────────────

/**
 * Scrape chapter page to get image URLs from source server.
 * Tries multiple URL formats (plain, zero-padded).
 */
async function scrapeChapterImageUrls(mangaSlug, chapterNumber, sourceOrigin) {
  const intNum = Math.floor(chapterNumber);
  const paddedNum = String(intNum).padStart(2, '0');

  const candidateUrls = intNum !== chapterNumber
    ? [`${sourceOrigin}/${mangaSlug}-chapter-${chapterNumber}/`]
    : intNum < 100
      ? [
          `${sourceOrigin}/${mangaSlug}-chapter-${intNum}/`,
          `${sourceOrigin}/${mangaSlug}-chapter-${paddedNum}/`,
        ]
      : [`${sourceOrigin}/${mangaSlug}-chapter-${intNum}/`];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': getRandomUA(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
          Referer: sourceOrigin + '/',
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (res.status === 429 || res.status === 503) {
        log(`⚠️  Rate limited (${res.status}) scraping ${url}, backing off...`);
        await sleep(BACKOFF_DURATION);
        continue;
      }

      if (!res.ok) continue;

      const html = await res.text();

      // Check for CloudFlare block
      if (
        html.includes('cf-browser-verification') ||
        html.includes('Just a moment') ||
        html.includes('Checking if the site connection is secure') ||
        html.length < 2000
      ) {
        log(`⛔ Blocked page detected for ${url}`);
        continue;
      }

      // Parse image URLs (same logic as parseChapterImages)
      const urls = [];
      const readerareaIdx = html.indexOf('id="readerarea"');
      const section =
        readerareaIdx !== -1
          ? html.slice(readerareaIdx, readerareaIdx + 80000)
          : html;

      // Primary: noscript lazy-load fallback
      const noscriptRe = /<noscript>([\s\S]*?)<\/noscript>/g;
      let m;
      while ((m = noscriptRe.exec(section)) !== null) {
        const srcRe = /src=['"]([^'"]+)['"]/g;
        let s;
        while ((s = srcRe.exec(m[1])) !== null) {
          if (/^https?:\/\//i.test(s[1])) urls.push(s[1]);
        }
      }

      // Fallback: data-src
      if (urls.length === 0) {
        const dataSrcRe = /data-src=['"]([^'"]+)['"]/g;
        while ((m = dataSrcRe.exec(section)) !== null) {
          if (/^https?:\/\//i.test(m[1])) urls.push(m[1]);
        }
      }

      // Last resort: plain img src
      if (urls.length === 0) {
        const imgSrcRe = /<img[^>]+src=['"]([^'"]+)['"]/g;
        while ((m = imgSrcRe.exec(section)) !== null) {
          if (/^https?:\/\//i.test(m[1]) && /chapter|manga[-_.]images|upload/i.test(m[1])) {
            urls.push(m[1]);
          }
        }
      }

      if (urls.length > 0) return { urls, chapterUrl: url };
    } catch (err) {
      // Try next candidate URL
    }

    await sleep(randomDelay());
  }

  return { urls: [], chapterUrl: null };
}

/**
 * Download a single image and upload to R2.
 * Returns the R2 public URL, or original URL on failure.
 */
async function downloadAndUploadImage(imageUrl, folder, fileNameHint) {
  try {
    // Download image with rotating UA
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': getRandomUA(),
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
        Referer: new URL(imageUrl).origin + '/',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 429 || res.status === 503) {
      log(`⚠️  Rate limited downloading image, backing off...`);
      await sleep(BACKOFF_DURATION);
      return { url: imageUrl, r2Key: null, downloaded: false };
    }

    if (!res.ok) {
      return { url: imageUrl, r2Key: null, downloaded: false };
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return { url: imageUrl, r2Key: null, downloaded: false };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
      return { url: imageUrl, r2Key: null, downloaded: false };
    }

    // Determine extension
    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
    };
    const ext = extMap[contentType] || 'jpg';

    // Upload to R2
    const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const r2Url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `https://${BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    return { url: r2Url, r2Key: key, downloaded: true };
  } catch (err) {
    return { url: imageUrl, r2Key: null, downloaded: false };
  }
}

/**
 * Process a single chapter: scrape → download all → save to DB → set thumbnail.
 */
async function processChapter(chapter, manga) {
  const chapterId = chapter.id;
  const chapterNum = chapter.number;
  const mangaSlug = manga.slug;

  // Determine source origin
  const sourceOrigin = manga.source_url
    ? new URL(manga.source_url).origin
    : 'https://04x.manhwaland.land';

  // Step 1: Check if chapter already has images (skip if resume mode)
  const { data: existingImages } = await sb
    .from('chapter_images')
    .select('id')
    .eq('chapter_id', chapterId)
    .limit(1);

  if (existingImages && existingImages.length > 0) {
    // Already has images — just fix thumbnail if NULL
    if (!chapter.thumbnail_url) {
      const { data: imgs } = await sb
        .from('chapter_images')
        .select('image_url, number')
        .eq('chapter_id', chapterId)
        .order('number', { ascending: true });

      if (imgs && imgs.length >= 5) {
        await sb.from('chapters').update({ thumbnail_url: imgs[4].image_url }).eq('id', chapterId);
        return { status: 'thumb_fixed', images: imgs.length };
      } else if (imgs && imgs.length > 0) {
        // Thumbnail: 5th page (index 4) by ORIGINAL order, fallback to LAST image
        const thumbIdx = imgs.length >= 5 ? 4 : imgs.length - 1;
        await sb.from('chapters').update({ thumbnail_url: imgs[thumbIdx].image_url }).eq('id', chapterId);
        return { status: 'thumb_fixed', images: imgs.length };
      }
    }
    return { status: 'skipped', images: existingImages.length };
  }

  // Step 2: Scrape image URLs from source
  const { urls: sourceUrls, chapterUrl } = await scrapeChapterImageUrls(mangaSlug, chapterNum, sourceOrigin);

  if (sourceUrls.length === 0) {
    log(`  ❌ No images found for Ch ${chapterNum} (${mangaSlug})`);
    return { status: 'no_images', images: 0 };
  }

  // Step 3: Download all images to R2 (sequentially with delay for anti-down)
  const folder = 'pages';
  const fileNameHint = `${mangaSlug}-ch${chapterNum}`;
  const r2Results = [];

  for (let i = 0; i < sourceUrls.length; i += IMAGE_CONCURRENCY) {
    const batch = sourceUrls.slice(i, i + IMAGE_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((url) => downloadAndUploadImage(url, folder, fileNameHint))
    );
    r2Results.push(...batchResults);

    // Random delay between image batches
    if (i + IMAGE_CONCURRENCY < sourceUrls.length) {
      await sleep(randomDelay());
    }
  }

  // Step 4: Save to chapter_images table
  const imageRows = r2Results.map((r, i) => ({
    chapter_id: chapterId,
    image_url: r.url,
    number: i + 1,
  }));

  const { error: insertError } = await sb
    .from('chapter_images')
    .upsert(imageRows, { onConflict: 'chapter_id,number', ignoreDuplicates: true });

  if (insertError) {
    log(`  ⚠️  Insert error for Ch ${chapterNum}: ${insertError.message}`);
  }

  // Step 5: Set thumbnail to 5th image (index 4)
  const thumbnailUrl =
    r2Results.length >= 5 ? r2Results[4].url : r2Results[r2Results.length - 1]?.url;

  if (thumbnailUrl) {
    await sb.from('chapters').update({ thumbnail_url: thumbnailUrl }).eq('id', chapterId);
  }

  const downloaded = r2Results.filter((r) => r.downloaded).length;
  log(`  ✅ Ch ${chapterNum} (${mangaSlug}): ${downloaded}/${sourceUrls.length} images downloaded, thumbnail set`);

  return { status: 'success', images: sourceUrls.length, downloaded };
}

/**
 * Process chapters in parallel with concurrency limit.
 */
async function processBatch(chapters, progress, isResume) {
  const results = [];

  for (let i = 0; i < chapters.length; i += CHAPTER_CONCURRENCY) {
    const batch = chapters.slice(i, i + CHAPTER_CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (chapter) => {
        // Fetch manga info for this chapter
        const { data: manga } = await sb
          .from('manga')
          .select('slug, source_url')
          .eq('id', chapter.manga_id)
          .single();

        if (!manga) {
          log(`  ⚠️  Manga not found for chapter ${chapter.id}`);
          return { chapterId: chapter.id, status: 'no_manga' };
        }

        try {
          const result = await processChapter(chapter, manga);
          return { chapterId: chapter.id, ...result };
        } catch (err) {
          log(`  ❌ Error processing Ch ${chapter.number}: ${err.message}`);
          return { chapterId: chapter.id, status: 'error', error: err.message };
        }
      })
    );

    results.push(...batchResults);

    // Update progress
    for (const r of batchResults) {
      progress.totalProcessed++;
      if (r.status === 'success' || r.status === 'thumb_fixed' || r.status === 'skipped') {
        if (!progress.completed.includes(r.chapterId)) {
          progress.completed.push(r.chapterId);
        }
      } else if (r.status === 'error' || r.status === 'no_images') {
        if (!progress.failed.includes(r.chapterId)) {
          progress.failed.push(r.chapterId);
        }
      }
    }

    // Save progress periodically
    saveProgress(progress);

    // Log progress
    const total = chapters.length;
    const done = i + batch.length;
    log(`📊 Progress: ${done}/${total} chapters in this batch | Total: ${progress.totalProcessed} | Completed: ${progress.completed.length} | Failed: ${progress.failed.length}`);

    // Cooldown every COOLDOWN_EVERY chapters
    if (progress.totalProcessed % COOLDOWN_EVERY === 0 && done < total) {
      log(`😴 Cooldown: pausing ${COOLDOWN_DURATION / 1000}s after ${COOLDOWN_EVERY} chapters...`);
      await sleep(COOLDOWN_DURATION);
    } else {
      // Small delay between chapter batches
      await sleep(randomDelay());
    }
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;
  const isResume = args.includes('--resume');

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('🎬 download-all-chapter-images.mjs');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`  Chapter Concurrency : ${CHAPTER_CONCURRENCY}`);
  log(`  Image Concurrency   : ${IMAGE_CONCURRENCY}`);
  log(`  Delay Range         : ${DELAY_MIN}-${DELAY_MAX}ms`);
  log(`  Cooldown            : Every ${COOLDOWN_EVERY} chapters → ${COOLDOWN_DURATION / 1000}s`);
  log(`  Backoff on 429/503  : ${BACKOFF_DURATION / 1000}s`);
  log(`  Limit               : ${limit || 'ALL'}`);
  log(`  Resume              : ${isResume ? 'YES' : 'NO'}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Load progress
  const progress = isResume ? loadProgress() : { completed: [], failed: [], lastOffset: 0, totalProcessed: 0 };
  if (isResume) {
    log(`📂 Resuming: ${progress.completed.length} already completed, ${progress.failed.length} previously failed`);
  }

  // Fetch chapters that need images (NULL thumbnail OR no chapter_images)
  log('\n📋 Fetching chapters that need images...');

  let allChapters = [];
  let offset = 0;

  while (true) {
    const query = sb
      .from('chapters')
      .select('id, number, title, manga_id, thumbnail_url')
      .is('deleted_at', null)
      .order('number', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    // If resume mode, exclude completed chapters
    if (isResume && progress.completed.length > 0) {
      // Can't use .notIn directly — filter in JS
    }

    const { data, error } = await query;

    if (error) {
      log(`❌ DB error: ${error.message}`);
      break;
    }

    if (!data || data.length === 0) break;

    allChapters.push(...data);
    offset += BATCH_SIZE;

    if (data.length < BATCH_SIZE) break;
  }

  // Filter: chapters with NULL thumbnail
  let chaptersToProcess = allChapters.filter((ch) => !ch.thumbnail_url);

  // Filter: in resume mode, skip completed
  if (isResume) {
    chaptersToProcess = chaptersToProcess.filter(
      (ch) => !progress.completed.includes(ch.id)
    );
  }

  // Apply limit if set
  if (limit > 0) {
    chaptersToProcess = chaptersToProcess.slice(0, limit);
  }

  log(`📊 Found ${allChapters.length} total chapters`);
  log(`📊 Chapters to process: ${chaptersToProcess.length}`);
  log('');

  if (chaptersToProcess.length === 0) {
    log('✅ All chapters already have images/thumbnails! Nothing to do.');
    return;
  }

  // Process in batches
  const stats = { success: 0, failed: 0, noImages: 0, skipped: 0, thumbFixed: 0, imagesDownloaded: 0 };

  // Process in chunks of 500 for memory management
  const CHUNK = 500;
  for (let i = 0; i < chaptersToProcess.length; i += CHUNK) {
    const chunk = chaptersToProcess.slice(i, i + CHUNK);
    log(`\n📦 Processing chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(chaptersToProcess.length / CHUNK)} (${chunk.length} chapters)`);

    const results = await processBatch(chunk, progress, isResume);

    for (const r of results) {
      if (r.status === 'success') {
        stats.success++;
        stats.imagesDownloaded += r.downloaded || 0;
      } else if (r.status === 'thumb_fixed') {
        stats.thumbFixed++;
      } else if (r.status === 'skipped') {
        stats.skipped++;
      } else if (r.status === 'no_images') {
        stats.noImages++;
      } else {
        stats.failed++;
      }
    }

    // Save progress after each chunk
    saveProgress(progress);

    log(`\n📊 Running totals: Success=${stats.success}, ThumbFixed=${stats.thumbFixed}, NoImages=${stats.noImages}, Failed=${stats.failed}, ImagesDL=${stats.imagesDownloaded}`);
  }

  // Final summary
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('📊 FINAL SUMMARY');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`  Chapters Processed : ${progress.totalProcessed}`);
  log(`  Success (new DL)   : ${stats.success}`);
  log(`  Thumbnail Fixed    : ${stats.thumbFixed}`);
  log(`  Skipped (already)  : ${stats.skipped}`);
  log(`  No Images on Source: ${stats.noImages}`);
  log(`  Failed             : ${stats.failed}`);
  log(`  Images Downloaded  : ${stats.imagesDownloaded}`);
  log(`  Total Completed    : ${progress.completed.length}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  saveProgress(progress);
}

main().catch((err) => {
  log(`💥 Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});