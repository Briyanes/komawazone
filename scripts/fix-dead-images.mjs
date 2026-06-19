#!/usr/bin/env node
/**
 * fix-dead-images.mjs
 * ─────────────────────
 * Re-download chapter images from dead CDN (gmbr.pro) → scrape source → upload to R2.
 *
 * Usage:
 *   node scripts/fix-dead-images.mjs --manga=hanas-demons-of-lust   # single manga
 *   node scripts/fix-dead-images.mjs --all                           # all manga
 *   node scripts/fix-dead-images.mjs --manga=hanas-demons-of-lust --dry-run
 *   node scripts/fix-dead-images.mjs --all --resume                  # resume after interruption
 *   node scripts/fix-dead-images.mjs --all --concurrency=3           # 3 chapters in parallel
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Progress & Failure files ──────────────────────────────────────────────────
const PROGRESS_FILE = path.join(__dirname, '.fix-dead-images-progress.json');
const FAILURES_FILE = path.join(__dirname, 'fix-dead-images-failures.jsonl');

function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function logFailure(entry) {
  appendFileSync(FAILURES_FILE, JSON.stringify(entry) + '\n');
}

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const envPath = path.join(__dirname, '..', '.env.local');
let env;
try {
  env = loadEnv(envPath);
  Object.assign(process.env, env);
} catch {
  console.error('❌ Tidak bisa baca .env.local');
  process.exit(1);
}

// ── Validate env ─────────────────────────────────────────────────────────────
const required = [
  'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
];
const missing = required.filter(k => !env[k]);
if (missing.length) {
  console.error('❌ Missing env vars:', missing.join(', '));
  process.exit(1);
}

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);
const MANGA_SLUG  = args['manga'] ?? null;
const ALL         = args['all'] === true || args['all'] === 'true';
const DRY_RUN     = args['dry-run'] === true || args['dry-run'] === 'true';
const RESUME      = args['resume'] === true || args['resume'] === 'true';
const CONCURRENCY = Math.min(parseInt(args['concurrency'] ?? '2'), 5);

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BASE   = (env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
const R2_BUCKET = env.R2_BUCKET;

function buildR2Url(key) {
  if (R2_BASE) return `${R2_BASE}/${key}`;
  return `https://${R2_BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}

function isR2Url(url) {
  if (!url) return false;
  if (R2_BASE && url.startsWith(R2_BASE)) return true;
  return url.includes('.r2.cloudflarestorage.com') || url.includes('.r2.dev');
}

// ── R2 upload ─────────────────────────────────────────────────────────────────
async function uploadToR2(buffer, key, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return buildR2Url(key);
}

// ── Dead CDN detection ────────────────────────────────────────────────────────
const DEAD_CDN_PATTERNS = [
  'gmbr.pro',
  'gmbar.xyz',
  'gmbar.pro',
  'uwakjawa.xyz',
  'manhwaland.in/gmbr',
  'manhwaland.com/gmbr',
];

function isDeadCdn(url) {
  if (!url) return true;
  if (isR2Url(url)) return false;
  return DEAD_CDN_PATTERNS.some(p => url.includes(p));
}

// ── Image helpers ─────────────────────────────────────────────────────────────
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

function getExtension(url, contentType) {
  const fromUrl = url.split('/').pop()?.split('?')[0]?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromUrl && fromUrl.length >= 2 && fromUrl.length <= 5) return fromUrl;
  return MIME_EXT[contentType] ?? 'jpg';
}

// ── Timeout wrapper ────────────────────────────────────────────────────────────
function withTimeout(promiseFactory, maxMs, label = 'request') {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`⏱️ ${label} timed out after ${maxMs}ms`));
    }, maxMs);
    promiseFactory(controller.signal)
      .then(v => { clearTimeout(timer); resolve(v); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── got-scraping helpers ──────────────────────────────────────────────────────
let gotScraping;

async function fetchPageHtml(url) {
  try {
    const html = await withTimeout(async (signal) => {
      const response = await gotScraping({
        url,
        responseType: 'text',
        timeout: { request: 20_000 },
        retry: { limit: 0 },
        signal,
        headerGeneratorOptions: {
          browsers: [{ name: 'chrome', minVersion: 112, maxVersion: 124 }],
          devices: ['desktop'],
          operatingSystems: ['macos'],
          locales: ['id-ID', 'en-US'],
        },
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (response.statusCode !== 200) return null;
      // Cloudflare check
      if (response.body.length < 2000 || response.body.includes('Just a moment') || response.body.includes('cf_chl_opt')) return null;
      return response.body;
    }, 30_000, `fetchPageHtml(${url.slice(0, 50)})`);
    return html;
  } catch {
    return null;
  }
}

async function downloadImage(url) {
  try {
    return await withTimeout(async (signal) => {
      const response = await gotScraping({
        url,
        responseType: 'buffer',
        timeout: { request: 15_000 },
        retry: { limit: 0 },
        signal,
        headerGeneratorOptions: {
          browsers: [{ name: 'chrome', minVersion: 112, maxVersion: 124 }],
          devices: ['desktop'],
          operatingSystems: ['macos'],
          locales: ['id-ID', 'en-US'],
        },
        headers: {
          'Referer': 'https://04x.manhwaland.land/',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      if (response.statusCode !== 200) return null;
      const contentType = (response.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
      if (!contentType.startsWith('image/')) return null;
      return { buffer: response.body, contentType };
    }, 25_000, `downloadImage(${url.slice(0, 50)})`);
  } catch {
    return null;
  }
}

// ── Parse chapter images from HTML ────────────────────────────────────────────
function parseChapterImages(html) {
  const images = [];

  // Primary: ts-reader.run() JSON
  const tsReaderMatch = html.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\)/);
  if (tsReaderMatch) {
    try {
      const data = JSON.parse(tsReaderMatch[1]);
      const imgs = data?.sources?.[0]?.images ?? data?.resources?.[0]?.images;
      if (imgs) return imgs.filter(Boolean);
    } catch {}
  }

  // Fallback: reading-content / entry-content div images
  const contentRe = /<(?:div|section)[^>]+class="[^"]*(?:entry-content|reading-content|page-break)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
  let contentMatch;
  while ((contentMatch = contentRe.exec(html)) !== null) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
    let imgMatch;
    while ((imgMatch = imgRe.exec(contentMatch[1])) !== null) {
      const src = imgMatch[1].trim();
      if (src && !src.includes('data:') && !src.includes('loading.')) images.push(src);
    }
  }

  // Fallback 2: wp-manga-reader
  if (images.length === 0) {
    const wpRe = /class="[^"]*wp-manga-reader[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let wpMatch;
    while ((wpMatch = wpRe.exec(html)) !== null) {
      const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
      let imgMatch;
      while ((imgMatch = imgRe.exec(wpMatch[1])) !== null) {
        const src = imgMatch[1].trim();
        if (src && !src.includes('data:')) images.push(src);
      }
    }
  }

  return images;
}

// ── Get chapter URL from manga source + chapter number ────────────────────────
function getChapterUrl(sourceUrl, chapterNumber) {
  const sourceParsed = new URL(sourceUrl);
  const pathParts = sourceParsed.pathname.replace(/\/$/, '').split('/');
  const slug = pathParts[pathParts.length - 1];
  const intNum = Math.floor(chapterNumber);
  const paddedNum = String(intNum).padStart(2, '0');

  if (intNum !== chapterNumber) {
    return [`${sourceParsed.origin}/${slug}-chapter-${chapterNumber}/`];
  }
  if (intNum < 100) {
    return [
      `${sourceParsed.origin}/${slug}-chapter-${intNum}/`,
      `${sourceParsed.origin}/${slug}-chapter-${paddedNum}/`,
    ];
  }
  return [`${sourceParsed.origin}/${slug}-chapter-${intNum}/`];
}

// ── Find affected chapters ────────────────────────────────────────────────────
async function findAffectedChapters(mangaId) {
  // Get all chapters for manga
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, number')
    .eq('manga_id', mangaId)
    .is('deleted_at', null)
    .order('number', { ascending: true });

  if (!chapters?.length) return [];

  const affected = [];
  for (const ch of chapters) {
    // Check if this chapter has any dead CDN images
    const { data: images } = await supabase
      .from('chapter_images')
      .select('id, image_url')
      .eq('chapter_id', ch.id)
      .limit(1);

    const firstImg = images?.[0]?.image_url;
    if (!firstImg || isDeadCdn(firstImg)) {
      affected.push(ch);
    }
  }
  return affected;
}

// ── Process one chapter ───────────────────────────────────────────────────────
async function fixChapter(manga, chapter, stats) {
  const tag = `Ch.${chapter.number}`;

  try {
    // ── Step 1: Scrape chapter page ──────────────────────────────────────────
    const candidateUrls = getChapterUrl(manga.source_url, chapter.number);

    let chapterHtml = null;
    let workingUrl = null;
    for (const tryUrl of candidateUrls) {
      chapterHtml = await fetchPageHtml(tryUrl);
      if (chapterHtml && parseChapterImages(chapterHtml).length > 0) {
        workingUrl = tryUrl;
        break;
      }
    }

    if (!chapterHtml || !workingUrl) {
      console.log(`    ❌ ${tag}: gagal fetch chapter page`);
      logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'fetch_page', urls: candidateUrls });
      stats.failed++;
      return;
    }

    const imageUrls = parseChapterImages(chapterHtml);
    if (imageUrls.length === 0) {
      console.log(`    ❌ ${tag}: tidak ada gambar ditemukan`);
      logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'parse_images', url: workingUrl });
      stats.failed++;
      return;
    }

    console.log(`    📄 ${tag}: ${imageUrls.length} gambar dari ${workingUrl.slice(0, 60)}...`);

    if (DRY_RUN) {
      console.log(`    🔍 [DRY] Akan download ${imageUrls.length} gambar`);
      stats.fixed++;
      return;
    }

    // ── Step 2: Delete old dead images from DB ───────────────────────────────
    const { error: delErr } = await supabase
      .from('chapter_images')
      .delete()
      .eq('chapter_id', chapter.id);

    if (delErr) {
      console.log(`    ⚠️  ${tag}: gagal hapus gambar lama: ${delErr.message}`);
    }

    // ── Step 3: Download & upload images ─────────────────────────────────────
    const BATCH = 3;
    const imageRecords = [];
    let downloaded = 0;
    let failedDl = 0;

    for (let i = 0; i < imageUrls.length; i += BATCH) {
      const batch = imageUrls.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (imgUrl, batchIdx) => {
          const pageIdx = i + batchIdx + 1;

          const imageData = await downloadImage(imgUrl);
          if (!imageData) {
            return { page: pageIdx, status: 'failed', url: imgUrl };
          }

          const ext = getExtension(imgUrl, imageData.contentType);
          const key = `chapters/${chapter.id}/${pageIdx}.${ext}`;
          const r2Url = await uploadToR2(imageData.buffer, key, imageData.contentType);

          return { page: pageIdx, status: 'ok', url: r2Url };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const result = r.value;
          if (result.status === 'ok') {
            imageRecords.push({
              chapter_id: chapter.id,
              number: result.page,
              image_url: result.url,
              width: 0,
              height: 0,
            });
            downloaded++;
            stats.imagesUploaded++;
          } else {
            failedDl++;
            stats.imagesFailed++;
            logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, page: result.page, phase: 'download', url: result.url });
          }
        } else {
          failedDl++;
          stats.imagesFailed++;
        }
      }

      // Delay between batches
      if (i + BATCH < imageUrls.length) {
        await sleep(400 + Math.random() * 300);
      }
    }

    // ── Step 4: Insert new image records ─────────────────────────────────────
    if (imageRecords.length > 0) {
      const sorted = imageRecords.slice().sort((a, b) => a.number - b.number);

      const { error: insertErr } = await supabase
        .from('chapter_images')
        .upsert(sorted, { onConflict: 'chapter_id,number' });

      if (insertErr) {
        console.log(`    ⚠️  ${tag}: gagal insert ${sorted.length} records: ${insertErr.message}`);
        logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'insert', error: insertErr.message });
      }

      // ── Step 5: Update thumbnail (5th image, fallback 1st) ───────────────
      const thumbRecord = sorted.length >= 5 ? sorted[4] : sorted[0];
      if (thumbRecord?.image_url) {
        await supabase
          .from('chapters')
          .update({ thumbnail_url: thumbRecord.image_url })
          .eq('id', chapter.id);
      }

      console.log(`    ✅ ${tag}: ${downloaded}/${imageUrls.length} uploaded${failedDl > 0 ? ` (${failedDl} failed)` : ''}`);
      stats.fixed++;
    } else {
      console.log(`    ❌ ${tag}: semua ${imageUrls.length} download gagal`);
      logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'all_failed' });
      stats.failed++;
    }

    // Delay between chapters
    await sleep(800 + Math.random() * 700);

  } catch (err) {
    console.error(`    ❌ ${tag} error: ${err.message}`);
    logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'error', error: err.message });
    stats.failed++;
  }
}

// ── Process chapters in parallel ──────────────────────────────────────────────
async function processChaptersParallel(manga, chapters, stats) {
  const queue = [...chapters];
  const workers = [];

  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const ch = queue.shift();
        if (!ch) break;
        await fixChapter(manga, ch, stats);
        stats.processed++;
        saveProgress(stats);
      }
    })());
  }

  await Promise.all(workers);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('🔧  Fix Dead CDN Images → Re-scrape → Upload to R2');
  console.log('════════════════════════════════════════════════════');
  console.log(`   Mode         : ${MANGA_SLUG ? `Single: ${MANGA_SLUG}` : ALL ? 'ALL manga' : '(no mode)'}`);
  console.log(`   Dry run      : ${DRY_RUN}`);
  console.log(`   Concurrency  : ${CONCURRENCY} chapters paralel`);
  console.log(`   Resume       : ${RESUME}`);
  console.log('');

  if (!MANGA_SLUG && !ALL) {
    console.error('❌ Gunakan --manga=SLUG atau --all');
    process.exit(1);
  }

  // ── Import got-scraping ────────────────────────────────────────────────────
  try {
    const mod = await import('got-scraping');
    gotScraping = mod.gotScraping;
  } catch {
    console.error('❌ got-scraping tidak terinstall. Jalankan: npm install got-scraping');
    process.exit(1);
  }

  // ── Build manga list ────────────────────────────────────────────────────────
  let mangaList = [];

  if (MANGA_SLUG) {
    const { data, error } = await supabase
      .from('manga')
      .select('id, slug, title, source_url')
      .eq('slug', MANGA_SLUG)
      .is('deleted_at', null)
      .single();
    if (error || !data) {
      console.error(`❌ Manga "${MANGA_SLUG}" tidak ditemukan`);
      process.exit(1);
    }
    mangaList = [data];
  } else {
    // ALL mode — paginate
    const PAGE_SIZE = 500;
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('manga')
        .select('id, slug, title, source_url')
        .is('deleted_at', null)
        .not('source_url', 'is', null)
        .order('title')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) { console.error('❌', error.message); break; }
      if (!data?.length) break;
      mangaList.push(...data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }
  }

  console.log(`📚 ${mangaList.length} manga untuk dicek\n`);

  // ── Resume support ──────────────────────────────────────────────────────────
  let savedProgress = RESUME ? loadProgress() : null;

  // ── Stats ───────────────────────────────────────────────────────────────────
  let stats = savedProgress ?? {
    processed: 0,
    fixed: 0,
    failed: 0,
    skipped: 0,
    imagesUploaded: 0,
    imagesFailed: 0,
    lastMangaSlug: null,
  };

  if (!RESUME) {
    stats = { processed: 0, fixed: 0, failed: 0, skipped: 0, imagesUploaded: 0, imagesFailed: 0, lastMangaSlug: null };
  }

  // ── Process each manga ──────────────────────────────────────────────────────
  for (const manga of mangaList) {
    // Skip if resuming
    if (RESUME && savedProgress?.lastMangaSlug && manga.slug !== savedProgress.lastMangaSlug) {
      // Find position — skip already processed
      continue;
    }
    if (RESUME && savedProgress?.lastMangaSlug === manga.slug) {
      savedProgress.lastMangaSlug = null; // Process this one, then continue normally
    }

    console.log(`\n📕 ${manga.title?.slice(0, 60) || manga.slug}`);
    console.log(`   Source: ${manga.source_url?.slice(0, 70)}`);

    // Find chapters with dead CDN images
    const affectedChapters = await findAffectedChapters(manga.id);

    if (affectedChapters.length === 0) {
      console.log(`   ⏭️  Semua chapter sudah OK (R2)`);
      stats.skipped++;
      stats.lastMangaSlug = manga.slug;
      saveProgress(stats);
      continue;
    }

    console.log(`   🔧 ${affectedChapters.length} chapter butuh re-download\n`);

    await processChaptersParallel(manga, affectedChapters, stats);

    stats.lastMangaSlug = manga.slug;
    saveProgress(stats);

    // Delay between manga
    await sleep(1500);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════');
  console.log(`📊  RINGKASAN`);
  console.log(`   Chapter diproses : ${stats.processed}`);
  console.log(`   Chapter fixed    : ${stats.fixed}`);
  console.log(`   Chapter gagal    : ${stats.failed}`);
  console.log(`   Manga di-skip    : ${stats.skipped}`);
  console.log(`   Gambar upload    : ${stats.imagesUploaded}`);
  console.log(`   Gambar gagal     : ${stats.imagesFailed}`);
  if (DRY_RUN) console.log(`\n⚠️  DRY RUN — tidak ada yang benar-benar diubah.`);
  if (stats.failed > 0 || stats.imagesFailed > 0) {
    console.log(`\n💡  Detail: ${FAILURES_FILE}`);
  }
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});