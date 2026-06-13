#!/usr/bin/env node
/**
 * Chapter Download Pipeline
 * ──────────────────────────
 * Download chapters & chapter images for manga yang belum punya chapter.
 * Menggunakan got-scraping untuk bypass Cloudflare.
 *
 * Usage:
 *   node scripts/download-chapters.mjs                              # semua manga tanpa chapter
 *   node scripts/download-chapters.mjs --manga=SLUG                 # manga spesifik by slug
 *   node scripts/download-chapters.mjs --manga-id=UUID              # manga spesifik by id
 *   node scripts/download-chapters.mjs --images-only                # hanya download images untuk chapter yang sudah ada
 *   node scripts/download-chapters.mjs --limit=10                   # hanya 10 manga
 *   node scripts/download-chapters.mjs --dry-run                    # preview tanpa upload
 *   node scripts/download-chapters.mjs --resume                     # lanjutkan dari progress terakhir
 *   node scripts/download-chapters.mjs --concurrency=2              # 2 manga paralel
 *   node scripts/download-chapters.mjs --skip-with-images           # skip manga yang sudah punya images di R2
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Progress & Failure files ──────────────────────────────────────────────────
const PROGRESS_FILE = path.join(__dirname, '.chapter-download-progress.json');
const FAILURES_FILE = path.join(__dirname, 'failed-chapters.jsonl');

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
const MANGA_SLUG    = args['manga'] ?? null;
const MANGA_ID      = args['manga-id'] ?? null;
const IMAGES_ONLY   = args['images-only'] === true || args['images-only'] === 'true';
const DRY_RUN       = args['dry-run'] === true || args['dry-run'] === 'true';
const RESUME        = args['resume'] === true || args['resume'] === 'true';
const LIMIT         = args['limit'] ? parseInt(args['limit']) : null;
const CONCURRENCY   = Math.min(parseInt(args['concurrency'] ?? '1'), 5);
const SKIP_WITH_IMG = args['skip-with-images'] === true || args['skip-with-images'] === 'true';
const DELAY_BETWEEN = parseInt(args['delay'] ?? '2000');  // ms between manga

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
  return url.includes('.r2.cloudflarestorage.com');
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

// ── Image helpers ─────────────────────────────────────────────────────────────
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

const DEAD_CDN_HOSTS = new Set([
  'cdn-go-wd.gmbr.pro',
  'cdn-okto.gmbr.pro',
  'gmbr.manhwaland.in',
  'gmbr.manhwaland.com',
  'gmbr-in.gmbr.pro',
]);

function getExtension(url, contentType) {
  const fromUrl = url.split('/').pop()?.split('?')[0]?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromUrl && fromUrl.length >= 2 && fromUrl.length <= 5) return fromUrl;
  return MIME_EXT[contentType] ?? 'jpg';
}

function isDeadCdn(url) {
  try {
    return DEAD_CDN_HOSTS.has(new URL(url).hostname);
  } catch { return true; }
}

async function downloadImage(url, gotScraping) {
  if (isDeadCdn(url)) return null;
  try {
    const response = await gotScraping({
      url,
      responseType: 'buffer',
      timeout: { request: 20_000 },
      retry: { limit: 1, statusCodes: [429, 500, 502, 503, 504] },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 112, maxVersion: 124 }],
        devices: ['desktop'],
        operatingSystems: ['macos'],
        locales: ['id-ID', 'en-US'],
      },
      headers: {
        'Referer': (() => { try { return new URL(url).origin + '/'; } catch { return undefined; } })(),
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (response.statusCode !== 200) return null;
    const contentType = (response.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
    if (!contentType.startsWith('image/')) return null;
    return { buffer: response.body, contentType };
  } catch {
    return null;
  }
}

// ── Scraper functions ─────────────────────────────────────────────────────────

function isBlockedPage(html) {
  return html.length < 2000 || html.includes('Just a moment') || html.includes('cf_chl_opt')
    || html.includes('Enable JavaScript and cookies to continue');
}

function normalizeIndonesianDate(raw) {
  return raw
    .replace(/Januari/i, 'January').replace(/Februari/i, 'February')
    .replace(/Maret/i, 'March').replace(/Mei/i, 'May')
    .replace(/Juni/i, 'June').replace(/Juli/i, 'July')
    .replace(/Agustus/i, 'August').replace(/Oktober/i, 'October')
    .replace(/Desember/i, 'December');
}

/**
 * Scrape chapter list from manga HTML page
 */
function parseChapterList(html) {
  const chapters = [];

  // Primary: eplister / chapterlist format
  if (html.includes('id="chapterlist"') || html.includes('class="eplister"')) {
    const liRe = /<li[^>]+data-num="(\d+(?:\.\d+)?)"[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRe.exec(html)) !== null) {
      const dataNum = parseFloat(liMatch[1]);
      const block = liMatch[2];

      const aMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
      if (!aMatch) continue;
      const url = aMatch[1].trim();

      const numMatch = block.match(/<span[^>]+class="chapternum"[^>]*>\s*(?:Chapter\s*)?(\d+(?:\.\d+)?)/i);
      const number = numMatch ? parseFloat(numMatch[1]) : dataNum;

      const titleMatch = block.match(/<span[^>]+class="chapternum"[^>]*>([^<]+)/i);
      const title = titleMatch ? titleMatch[1].trim() : `Chapter ${number}`;

      const dateRaw = block.match(/<span[^>]+class="chapterdate"[^>]*>([^<]+)/i)?.[1]?.trim() ?? null;
      let releasedAt = null;
      if (dateRaw) {
        try { releasedAt = new Date(normalizeIndonesianDate(dateRaw)).toISOString(); } catch {}
      }

      chapters.push({ number, title, url, releasedAt });
    }
    if (chapters.length > 0) return chapters.sort((a, b) => a.number - b.number);
  }

  // Fallback: Madara wp-manga-chapter format
  const liRe = /<li[^>]+class="[^"]*wp-manga-chapter[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRe.exec(html)) !== null) {
    const block = liMatch[1];
    const aMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    if (!aMatch) continue;

    const url = aMatch[1].trim();
    const rawTitle = aMatch[2].replace(/<[^>]+>/g, '').trim();

    const numFromUrl = url.match(/chapter[-_](\d+(?:\.\d+)?)/i);
    const numFromTitle = rawTitle.match(/chapter\s*(\d+(?:\.\d+)?)/i) ?? rawTitle.match(/^(\d+(?:\.\d+)?)/);
    const numStr = numFromUrl?.[1] ?? numFromTitle?.[1];
    const number = numStr ? parseFloat(numStr) : null;
    if (number === null) continue;

    const dateRaw = block.match(/<i[^>]*>([^<]+)<\/i>/i)?.[1]?.trim() ?? null;
    let releasedAt = null;
    if (dateRaw) {
      try { releasedAt = new Date(normalizeIndonesianDate(dateRaw)).toISOString(); } catch {}
    }

    chapters.push({ number, title: rawTitle, url, releasedAt });
  }

  return chapters.sort((a, b) => a.number - b.number);
}

/**
 * Scrape chapter images from a chapter page URL
 */
function parseChapterImages(html) {
  const images = [];

  // Primary: ts-reader.run() JSON in script tag
  const tsReaderMatch = html.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\)/);
  if (tsReaderMatch) {
    try {
      const data = JSON.parse(tsReaderMatch[1]);
      // Try both 'sources' and 'resources' keys (different theme versions)
      const imgs = data?.sources?.[0]?.images ?? data?.resources?.[0]?.images;
      if (imgs) {
        return imgs.filter(Boolean);
      }
    } catch {}
  }

  // Fallback: entry-content / reading-content div images
  const contentRe = /<(?:div|section)[^>]+class="[^"]*(?:entry-content|reading-content|page-break)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
  let contentMatch;
  while ((contentMatch = contentRe.exec(html)) !== null) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
    let imgMatch;
    while ((imgMatch = imgRe.exec(contentMatch[1])) !== null) {
      const src = imgMatch[1].trim();
      if (src && !src.includes('data:') && !src.includes('loading.')) {
        images.push(src);
      }
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

  // Fallback 3: any img with "page" in class or data attribute
  if (images.length === 0) {
    const pageImgRe = /<img[^>]+(?:class="[^"]*page[^"]*"|data-page)[^>]+src=["']([^"']+)["']/gi;
    let m;
    while ((m = pageImgRe.exec(html)) !== null) {
      const src = m[1].trim();
      if (src && !src.includes('data:')) images.push(src);
    }
  }

  return images;
}

// ── Sleep helper ──────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('📖  Chapter Download Pipeline');
  console.log('══════════════════════════════════════');
  console.log(`   Concurrency  : ${CONCURRENCY} manga`);
  console.log(`   Dry run      : ${DRY_RUN}`);
  console.log(`   Resume       : ${RESUME}`);
  console.log(`   Images only  : ${IMAGES_ONLY}`);
  console.log(`   Delay        : ${DELAY_BETWEEN}ms between manga`);
  if (MANGA_SLUG) console.log(`   Manga slug   : ${MANGA_SLUG}`);
  if (MANGA_ID) console.log(`   Manga ID     : ${MANGA_ID}`);
  if (LIMIT) console.log(`   Limit        : ${LIMIT}`);
  console.log('');

  // ── Import got-scraping ────────────────────────────────────────────────────
  let gotScraping;
  try {
    const mod = await import('got-scraping');
    gotScraping = mod.gotScraping;
  } catch {
    console.error('❌ got-scraping tidak terinstall. Jalankan: npm install got-scraping --save-dev');
    process.exit(1);
  }

  // ── Load resume progress ──────────────────────────────────────────────────
  let savedProgress = loadProgress();
  let lastProcessedMangaId = null;

  if (RESUME && savedProgress?.lastProcessedMangaId) {
    lastProcessedMangaId = savedProgress.lastProcessedMangaId;
    console.log(`📂 Resume dari manga ID: ${lastProcessedMangaId}`);
    console.log(`   Manga diproses: ${savedProgress.mangaProcessed ?? 0}`);
    console.log(`   Chapter dibuat: ${savedProgress.chaptersCreated ?? 0}`);
    console.log(`   Images diupload: ${savedProgress.imagesUploaded ?? 0}`);
    console.log('');
  }

  // ── Build manga query ─────────────────────────────────────────────────────
  let mangaQuery = supabase
    .from('manga')
    .select('id, slug, title, source_url')
    .is('deleted_at', null)
    .not('source_url', 'is', null)
    .order('id');

  if (MANGA_SLUG) {
    mangaQuery = mangaQuery.eq('slug', MANGA_SLUG);
  } else if (MANGA_ID) {
    mangaQuery = mangaQuery.eq('id', MANGA_ID);
  } else if (!IMAGES_ONLY) {
    // Default: manga yang belum punya chapter
    // We'll filter after fetching since Supabase doesn't have a "has no related rows" filter
    mangaQuery = mangaQuery.limit(LIMIT ?? 500);
  } else {
    mangaQuery = mangaQuery.limit(LIMIT ?? 500);
  }

  if (RESUME && lastProcessedMangaId) {
    mangaQuery = mangaQuery.gt('id', lastProcessedMangaId);
  }

  const { data: mangaList, error: mangaErr } = await mangaQuery;
  if (mangaErr) {
    console.error('❌ Gagal query manga:', mangaErr.message);
    process.exit(1);
  }

  if (!mangaList?.length) {
    console.log('📭  Tidak ada manga untuk diproses.');
    return;
  }

  console.log(`📊 Manga ditemukan: ${mangaList.length}`);
  console.log('');

  // ── Stats ──────────────────────────────────────────────────────────────────
  let stats = savedProgress ?? {
    mangaProcessed: 0,
    chaptersCreated: 0,
    imagesUploaded: 0,
    imagesFailed: 0,
    skipped: 0,
    failed: 0,
    lastProcessedMangaId: null,
  };

  // Reset stats if not resuming
  if (!RESUME) {
    stats = { mangaProcessed: 0, chaptersCreated: 0, imagesUploaded: 0, imagesFailed: 0, skipped: 0, failed: 0, lastProcessedMangaId: null };
  }

  // ── Process each manga ────────────────────────────────────────────────────
  for (const manga of mangaList) {
    stats.mangaProcessed++;
    const progressLabel = `[${stats.mangaProcessed}/${mangaList.length}]`;
    console.log(`${progressLabel} 📕 ${manga.title?.slice(0, 50) || manga.slug}`);
    console.log(`          Source: ${manga.source_url?.slice(0, 70)}`);

    try {
      // ── IMAGES_ONLY mode: just download images for existing chapters ──────
      if (IMAGES_ONLY) {
        await processExistingChapterImages(manga, gotScraping, stats, progressLabel);
        stats.lastProcessedMangaId = manga.id;
        saveProgress(stats);
        await sleep(DELAY_BETWEEN);
        continue;
      }

      // ── Check if manga already has chapters ──────────────────────────────
      const { data: existingChapters } = await supabase
        .from('chapters')
        .select('id, number')
        .eq('manga_id', manga.id)
        .is('deleted_at', null);

      if (existingChapters && existingChapters.length > 0) {
        if (SKIP_WITH_IMG) {
          // Check if images are already in R2
          const { data: chapterImages } = await supabase
            .from('chapter_images')
            .select('image_url')
            .in('chapter_id', existingChapters.map(c => c.id));

          const r2Count = chapterImages?.filter(ci => isR2Url(ci.image_url)).length ?? 0;
          if (r2Count > 0) {
            console.log(`          ⏭️  Sudah punya ${existingChapters.length} chapters, ${r2Count} images di R2 — skip`);
            stats.skipped++;
            stats.lastProcessedMangaId = manga.id;
            saveProgress(stats);
            continue;
          }
        }

        // Manga has chapters but maybe no images — download images
        console.log(`          📋 Sudah punya ${existingChapters.length} chapters — download images...`);
        await downloadImagesForChapters(manga, existingChapters, gotScraping, stats, progressLabel);
        stats.lastProcessedMangaId = manga.id;
        saveProgress(stats);
        await sleep(DELAY_BETWEEN);
        continue;
      }

      // ── Step 1: Scrape manga page to get chapter list ────────────────────
      console.log(`          🔍 Scraping chapter list...`);
      const mangaHtml = await fetchPageHtml(manga.source_url, gotScraping);
      if (!mangaHtml) {
        stats.failed++;
        console.log(`          ❌ Gagal fetch manga page`);
        logFailure({ manga_id: manga.id, title: manga.title, phase: 'fetch_manga_page', error: 'Failed to fetch' });
        stats.lastProcessedMangaId = manga.id;
        saveProgress(stats);
        await sleep(DELAY_BETWEEN);
        continue;
      }

      const chapterList = parseChapterList(mangaHtml);
      if (chapterList.length === 0) {
        console.log(`          ⚠️  Tidak ada chapter ditemukan`);
        stats.skipped++;
        stats.lastProcessedMangaId = manga.id;
        saveProgress(stats);
        await sleep(DELAY_BETWEEN);
        continue;
      }

      console.log(`          📋 Ditemukan ${chapterList.length} chapters`);

      if (DRY_RUN) {
        console.log(`          🔍 [DRY] Akan membuat ${chapterList.length} chapters`);
        chapterList.slice(0, 5).forEach(ch => console.log(`              Ch.${ch.number}: ${ch.title?.slice(0, 40)}`));
        if (chapterList.length > 5) console.log(`              ...dan ${chapterList.length - 5} lagi`);
        stats.skipped++;
        stats.lastProcessedMangaId = manga.id;
        saveProgress(stats);
        await sleep(DELAY_BETWEEN);
        continue;
      }

      // ── Step 2: Insert chapters into DB ──────────────────────────────────
      const insertedChapters = [];
      for (const ch of chapterList) {
        const { data: inserted, error: insertErr } = await supabase
          .from('chapters')
          .insert({
            manga_id: manga.id,
            number: ch.number,
            title: ch.title || `Chapter ${ch.number}`,
            release_date: ch.releasedAt ?? new Date().toISOString(),
          })
          .select('id, number')
          .single();

        if (insertErr) {
          console.log(`          ⚠️  Ch.${ch.number} insert gagal: ${insertErr.message}`);
          logFailure({ manga_id: manga.id, chapter_number: ch.number, phase: 'insert_chapter', error: insertErr.message });
        } else if (inserted) {
          insertedChapters.push({ ...inserted, url: ch.url });
          stats.chaptersCreated++;
        }
      }

      console.log(`          ✅ ${insertedChapters.length} chapters dibuat`);

      // ── Step 3: Download images for each chapter ─────────────────────────
      await downloadImagesForChapters(manga, insertedChapters, gotScraping, stats, progressLabel);

      stats.lastProcessedMangaId = manga.id;
      saveProgress(stats);

      // Delay between manga
      await sleep(DELAY_BETWEEN);

    } catch (err) {
      stats.failed++;
      console.error(`          ❌ Error: ${err.message}`);
      logFailure({ manga_id: manga.id, title: manga.title, phase: 'processing', error: err.message });
      stats.lastProcessedMangaId = manga.id;
      saveProgress(stats);
      await sleep(DELAY_BETWEEN);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('══════════════════════════════════════');
  console.log(`📕  Manga diproses  : ${stats.mangaProcessed}`);
  console.log(`📋  Chapter dibuat  : ${stats.chaptersCreated}`);
  console.log(`🖼️   Images upload   : ${stats.imagesUploaded}`);
  console.log(`⏭️   Dilewati        : ${stats.skipped}`);
  console.log(`❌  Gagal           : ${stats.failed}`);
  if (stats.imagesFailed > 0) {
    console.log(`⚠️   Images gagal    : ${stats.imagesFailed}`);
  }
  if (DRY_RUN) console.log('\n⚠️  Dry run — tidak ada yang benar-benar dibuat.');
  if (stats.failed > 0 || stats.imagesFailed > 0) {
    console.log(`\n💡  Detail kegagalan disimpan di: ${FAILURES_FILE}`);
  }
  console.log('');
}

// ── Helper: Fetch HTML page with got-scraping ─────────────────────────────────
async function fetchPageHtml(url, gotScraping) {
  try {
    const response = await gotScraping({
      url,
      responseType: 'text',
      timeout: { request: 25_000 },
      retry: { limit: 1, statusCodes: [429, 500, 502, 503, 504] },
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
    if (isBlockedPage(response.body)) return null;
    return response.body;
  } catch {
    return null;
  }
}

// ── Helper: Download images for existing chapters ─────────────────────────────
async function processExistingChapterImages(manga, gotScraping, stats, progressLabel) {
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, number')
    .eq('manga_id', manga.id)
    .is('deleted_at', null)
    .order('number');

  if (!chapters?.length) {
    console.log(`          ⚠️  Tidak ada chapter`);
    return;
  }

  // Filter chapters that need images
  const chaptersNeedingImages = [];
  for (const ch of chapters) {
    const { data: existingImages } = await supabase
      .from('chapter_images')
      .select('id')
      .eq('chapter_id', ch.id)
      .limit(1);

    if (!existingImages?.length) {
      chaptersNeedingImages.push(ch);
    }
  }

  if (chaptersNeedingImages.length === 0) {
    console.log(`          ⏭️  Semua ${chapters.length} chapters sudah punya images`);
    stats.skipped++;
    return;
  }

  console.log(`          📥 ${chaptersNeedingImages.length}/${chapters.length} chapters butuh images`);
  await downloadImagesForChapters(manga, chaptersNeedingImages, gotScraping, stats, progressLabel);
}

// ── Helper: Download & upload images for a list of chapters ──────────────────
async function downloadImagesForChapters(manga, chapters, gotScraping, stats, progressLabel) {
  // We need chapter URLs to scrape images. For newly created chapters from parseChapterList,
  // the URL is attached. For existing chapters, we need to derive the URL from source_url.
  for (const chapter of chapters) {
    try {
      // Derive chapter URL from manga source_url + chapter number
      // Some sources zero-pad single digits (chapter-02, chapter-09) — try multiple formats
      let candidateUrls = [];
      if (chapter.url) {
        candidateUrls = [chapter.url];
      } else {
        const sourceParsed = new URL(manga.source_url);
        const pathParts = sourceParsed.pathname.replace(/\/$/, '').split('/');
        const slug = pathParts[pathParts.length - 1];
        const intNum = Math.floor(chapter.number);
        const paddedNum = String(intNum).padStart(2, '0');
        if (intNum !== chapter.number) {
          // Decimal chapters (e.g. 10.5): only try exact number
          candidateUrls = [`${sourceParsed.origin}/${slug}-chapter-${chapter.number}/`];
        } else if (intNum < 100) {
          // Integer chapters under 100: try plain, then zero-padded
          candidateUrls = [
            `${sourceParsed.origin}/${slug}-chapter-${intNum}/`,
            `${sourceParsed.origin}/${slug}-chapter-${paddedNum}/`,
          ];
        } else {
          candidateUrls = [`${sourceParsed.origin}/${slug}-chapter-${intNum}/`];
        }
      }

      // Try each candidate URL until we find images
      let chapterHtml = null;
      let workingUrl = null;
      for (const tryUrl of candidateUrls) {
        chapterHtml = await fetchPageHtml(tryUrl, gotScraping);
        if (chapterHtml && parseChapterImages(chapterHtml).length > 0) {
          workingUrl = tryUrl;
          break;
        }
      }

      if (!chapterHtml || !workingUrl) {
        stats.imagesFailed++;
        logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'fetch_chapter_page', error: 'Failed to fetch chapter page', urls: candidateUrls });
        continue;
      }

      const imageUrls = parseChapterImages(chapterHtml);
      if (imageUrls.length === 0) {
        stats.imagesFailed++;
        logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'parse_images', error: 'No images found', url: workingUrl });
        continue;
      }

      console.log(`          Ch.${chapter.number}: ${imageUrls.length} images from ${workingUrl.slice(0, 60)}...`);

      if (DRY_RUN) {
        stats.imagesUploaded += imageUrls.length;
        continue;
      }

      // Download & upload images in batches of 3
      const BATCH = 3;
      const imageRecords = [];
      for (let i = 0; i < imageUrls.length; i += BATCH) {
        const batch = imageUrls.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(async (imgUrl, batchIdx) => {
            const pageIdx = i + batchIdx + 1;

            // Skip dead CDN
            if (isDeadCdn(imgUrl)) {
              return { page: pageIdx, url: imgUrl, status: 'dead_cdn' };
            }

            const imageData = await downloadImage(imgUrl, gotScraping);
            if (!imageData) {
              return { page: pageIdx, url: imgUrl, status: 'download_failed' };
            }

            const ext = getExtension(imgUrl, imageData.contentType);
            const key = `chapters/${chapter.id}/${pageIdx}.${ext}`;
            const r2Url = await uploadToR2(imageData.buffer, key, imageData.contentType);

            return { page: pageIdx, url: r2Url, status: 'ok' };
          })
        );

        for (const r of results) {
          if (r.status === 'fulfilled') {
            const result = r.value;
            if (result.status === 'ok') {
              imageRecords.push({ chapter_id: chapter.id, number: result.page, image_url: result.url, width: 0, height: 0 });
              stats.imagesUploaded++;
            } else {
              stats.imagesFailed++;
              logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, page: result.page, phase: result.status, url: result.url });
            }
          } else {
            stats.imagesFailed++;
          }
        }

        // Delay between image batches
        if (i + BATCH < imageUrls.length) {
          await sleep(500 + Math.random() * 500);
        }
      }

      // Insert chapter_images records (upsert to handle duplicates)
      if (imageRecords.length > 0) {
        const { error: insertErr } = await supabase
          .from('chapter_images')
          .upsert(imageRecords, { onConflict: 'chapter_id,number' });

        if (insertErr) {
          console.log(`          ⚠️  Ch.${chapter.number}: gagal insert ${imageRecords.length} image records: ${insertErr.message}`);
          logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'insert_images', error: insertErr.message });
        } else {
          console.log(`          ✅ Ch.${chapter.number}: ${imageRecords.length} images uploaded & saved`);
        }

        // Update chapter thumbnail — use 5th image (index 4), fallback to 1st
        const thumbRecord = imageRecords.length >= 5
          ? imageRecords[4]
          : imageRecords[0];
        if (thumbRecord?.image_url) {
          await supabase
            .from('chapters')
            .update({ thumbnail_url: thumbRecord.image_url })
            .eq('id', chapter.id);
        }
      }

      // Delay between chapters
      await sleep(1000 + Math.random() * 1000);

    } catch (err) {
      console.error(`          ❌ Ch.${chapter.number} error: ${err.message}`);
      logFailure({ manga_id: manga.id, chapter_id: chapter.id, chapter_number: chapter.number, phase: 'chapter_processing', error: err.message });
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});