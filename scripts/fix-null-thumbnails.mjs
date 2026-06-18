#!/usr/bin/env node
/**
 * Fix chapters with NULL thumbnails (0 images downloaded)
 * ──────────────────────────────────────────────────────────────────────
 * Downloads images from source and uploads to R2.
 * Updates thumbnail to 5th image as per convention.
 *
 * Usage:
 *   node scripts/fix-null-thumbnails.mjs --manga=SLUG    # fix all chapters of a manga
 *   node scripts/fix-null-thumbnails.mjs --all            # fix ALL NULL thumbnail chapters
 *   node scripts/fix-null-thumbnails.mjs --all --limit=500  # limit to 500 chapters
 *   node scripts/fix-null-thumbnails.mjs --dry-run        # preview only
 */

import { readFileSync, appendFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const env = loadEnv(envPath);
Object.assign(process.env, env);

const FAILURES_FILE = path.join(__dirname, 'failed-null-thumbnails.jsonl');
function logFailure(entry) {
  appendFileSync(FAILURES_FILE, JSON.stringify(entry) + '\n');
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
const MANGA_SLUG = args['manga'] ?? null;
const FIX_ALL    = args['all'] === true || args['all'] === 'true';
const DRY_RUN    = args['dry-run'] === true || args['dry-run'] === 'true';
const LIMIT      = args['limit'] ? parseInt(args['limit']) : null;

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

// ── Helpers ───────────────────────────────────────────────────────────────────
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

const DEAD_CDN_HOSTS = new Set([
  'cdn-go-wd.gmbr.pro',
  'cdn-okto.gmbr.pro',
  'gmbr.manhwaland.in',
  'gmbr.manhwaland.com',
  'gmbr-in.gmbr.pro',
  'api-l.gmbr.pro',
  'gmbr.pro',
  'go.gmbar.xyz',
  'go.gmbar.pro',
  'go.uwakjawa.xyz',
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

async function downloadImage(url, gotScraping) {
  if (isDeadCdn(url)) return null;
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

// ── Scraper ───────────────────────────────────────────────────────────────────
function isBlockedPage(html) {
  return html.length < 2000 || html.includes('Just a moment') || html.includes('cf_chl_opt')
    || html.includes('Enable JavaScript and cookies to continue');
}

async function fetchPageHtml(url, gotScraping) {
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
      if (isBlockedPage(response.body)) return null;
      return response.body;
    }, 30_000, `fetchPageHtml(${url.slice(0, 50)})`);
    return html;
  } catch {
    return null;
  }
}

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

  // Fallback 3: any img with "page"
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('🔧  Fix NULL Thumbnail Chapters');
  console.log('════════════════════════════════════════');
  if (MANGA_SLUG) console.log(`   Manga slug  : ${MANGA_SLUG}`);
  if (FIX_ALL)    console.log(`   Mode        : ALL NULL thumbnail chapters`);
  if (LIMIT)      console.log(`   Limit       : ${LIMIT} chapters`);
  console.log(`   Dry run     : ${DRY_RUN}`);
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

  // ── Find affected chapters (NULL thumbnail) ────────────────────────────────
  let chapters = [];

  if (MANGA_SLUG) {
    // Get manga ID first
    const { data: manga, error: mangaErr } = await supabase
      .from('manga')
      .select('id, title, source_url')
      .eq('slug', MANGA_SLUG)
      .maybeSingle();
    if (mangaErr || !manga) {
      console.error('❌ Manga tidak ditemukan:', mangaErr?.message ?? 'not found');
      process.exit(1);
    }

    // Paginated fetch of NULL thumbnail chapters for this manga
    const PAGE_SIZE = 1000;
    let page = 0;
    while (true) {
      let query = supabase
        .from('chapters')
        .select('id, number, manga_id, thumbnail_url')
        .eq('manga_id', manga.id)
        .is('thumbnail_url', null)
        .is('deleted_at', null)
        .order('number')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, error } = await query;
      if (error) {
        console.error('❌ Query error:', error.message);
        process.exit(1);
      }
      if (!data?.length) break;
      chapters.push(...data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }
  } else if (FIX_ALL) {
    // Paginated fetch of ALL NULL thumbnail chapters
    const PAGE_SIZE = 1000;
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('chapters')
        .select('id, number, manga_id, thumbnail_url')
        .is('thumbnail_url', null)
        .is('deleted_at', null)
        .order('number')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) {
        console.error('❌ Query error:', error.message);
        process.exit(1);
      }
      if (!data?.length) break;
      chapters.push(...data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    // Apply limit
    if (LIMIT && chapters.length > LIMIT) {
      chapters = chapters.slice(0, LIMIT);
    }
  } else {
    console.error('❌ Gunakan --manga=SLUG atau --all');
    process.exit(1);
  }

  console.log(`📊 Found ${chapters.length} chapters with NULL thumbnails`);
  console.log('');

  if (chapters.length === 0) {
    console.log('✅ No NULL thumbnail chapters to fix!');
    return;
  }

  let fixed = 0;
  let failed = 0;

  // Cache manga data to avoid repeated queries
  const mangaCache = new Map();

  for (const chapter of chapters) {
    // Get manga source_url (from cache or DB)
    let manga = mangaCache.get(chapter.manga_id);
    if (!manga) {
      const { data: m } = await supabase
        .from('manga')
        .select('slug, title, source_url')
        .eq('id', chapter.manga_id)
        .maybeSingle();
      if (m) mangaCache.set(chapter.manga_id, m);
      manga = m;
    }

    if (!manga?.source_url) {
      console.log(`  Ch.${chapter.number}: ❌ No source_url (${manga?.title?.slice(0, 30) || chapter.manga_id})`);
      failed++;
      continue;
    }

    console.log(`  Ch.${chapter.number}: ${manga.title?.slice(0, 40) || manga.slug}`);

    if (DRY_RUN) {
      console.log(`    [DRY] Would download images from source`);
      continue;
    }

    // Step 1: Derive chapter URL from source_url
    const sourceParsed = new URL(manga.source_url);
    const pathParts = sourceParsed.pathname.replace(/\/$/, '').split('/');
    const slug = pathParts[pathParts.length - 1];
    const intNum = Math.floor(chapter.number);
    const paddedNum = String(intNum).padStart(2, '0');

    let candidateUrls = [];
    if (intNum !== chapter.number) {
      candidateUrls = [`${sourceParsed.origin}/${slug}-chapter-${chapter.number}/`];
    } else if (intNum < 100) {
      candidateUrls = [
        `${sourceParsed.origin}/${slug}-chapter-${intNum}/`,
        `${sourceParsed.origin}/${slug}-chapter-${paddedNum}/`,
      ];
    } else {
      candidateUrls = [`${sourceParsed.origin}/${slug}-chapter-${intNum}/`];
    }

    // Step 2: Fetch chapter page and parse images
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
      console.log(`    ❌ Failed to fetch chapter page`);
      logFailure({ chapter_id: chapter.id, chapter_number: chapter.number, manga_slug: manga.slug, phase: 'fetch_chapter_page', urls: candidateUrls });
      failed++;
      continue;
    }

    const imageUrls = parseChapterImages(chapterHtml);
    if (imageUrls.length === 0) {
      console.log(`    ❌ No images found on chapter page`);
      logFailure({ chapter_id: chapter.id, chapter_number: chapter.number, manga_slug: manga.slug, phase: 'parse_images', url: workingUrl });
      failed++;
      continue;
    }

    console.log(`    📄 ${imageUrls.length} images from ${workingUrl.slice(0, 60)}...`);

    // Step 3: Download & upload images in batches of 3
    const BATCH = 3;
    const imageRecords = [];
    for (let i = 0; i < imageUrls.length; i += BATCH) {
      const batch = imageUrls.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (imgUrl, batchIdx) => {
          const pageIdx = i + batchIdx + 1;

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
          } else {
            logFailure({ chapter_id: chapter.id, chapter_number: chapter.number, page: result.page, phase: result.status, url: result.url });
          }
        }
      }

      if (i + BATCH < imageUrls.length) {
        await sleep(500 + Math.random() * 500);
      }
    }

    // Step 4: Insert new images
    if (imageRecords.length > 0) {
      const { error: insertErr } = await supabase
        .from('chapter_images')
        .upsert(imageRecords, { onConflict: 'chapter_id,number' });

      if (insertErr) {
        console.log(`    ⚠️  Insert images failed: ${insertErr.message}`);
        logFailure({ chapter_id: chapter.id, chapter_number: chapter.number, phase: 'insert_images', error: insertErr.message });
      }

      // Update thumbnail — 5th image (index 4), fallback to 1st
      const sortedRecords = imageRecords.slice().sort((a, b) => a.number - b.number);
      const thumbRecord = sortedRecords.length >= 5
        ? sortedRecords[4]
        : sortedRecords[0];
      if (thumbRecord?.image_url) {
        await supabase
          .from('chapters')
          .update({ thumbnail_url: thumbRecord.image_url })
          .eq('id', chapter.id);
        console.log(`    ✅ ${imageRecords.length} images → R2, thumbnail = image #${thumbRecord.number}`);
        fixed++;
      }
    } else {
      console.log(`    ❌ All image downloads failed`);
      logFailure({ chapter_id: chapter.id, chapter_number: chapter.number, phase: 'all_downloads_failed' });
      failed++;
    }

    await sleep(1000 + Math.random() * 1000);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log('══════════════════════════════════════');
  console.log(`✅  Fixed   : ${fixed}`);
  console.log(`❌  Failed  : ${failed}`);
  console.log(`📊  Total   : ${chapters.length}`);
  if (failed > 0) {
    console.log(`\n💡  Detail kegagalan: ${FAILURES_FILE}`);
  }
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});