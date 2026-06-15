#!/usr/bin/env node
/**
 * Retry Failed Chapter Images — Re-scrape Edition
 *
 * Reads failed-chapters.jsonl, groups by unique chapter_id,
 * re-scrapes the chapter page to get FRESH image URLs (old CDN is dead),
 * then downloads & uploads to R2.
 *
 * Usage:
 *   node --env-file=.env.local scripts/retry-failed-images.mjs
 *
 * Options:
 *   --delay=3000     Delay between chapters (default: 3000ms)
 *   --limit=0        Max chapters to process (0 = all)
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { gotScraping } from 'got-scraping';
import { readFileSync, existsSync, appendFileSync } from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────
const CHAPTER_DELAY = parseInt(process.argv.find(a => a.startsWith('--delay='))?.split('=')[1] || '3000');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');
const IMAGE_BATCH = 3;
const IMAGE_DELAY = 500;

// Load env manually
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const R2_BUCKET = env.R2_BUCKET;
const R2_BASE = (env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

const DEAD_CDN_HOSTS = new Set([
  'cdn-go-wd.gmbr.pro', 'cdn-okto.gmbr.pro', 'gmbr.manhwaland.in',
  'gmbr.manhwaland.com', 'gmbr-in.gmbr.pro', 'go.gmbar.xyz', 'go.gmbar.pro',
]);

const SCRAPE_OPTS = {
  timeout: { request: 25000 },
  retry: { limit: 1, statusCodes: [429, 500, 502, 503, 504] },
  headerGeneratorOptions: {
    browsers: [{ name: 'chrome', minVersion: 112, maxVersion: 124 }],
    devices: ['desktop'],
    operatingSystems: ['macos'],
    locales: ['id-ID', 'en-US'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildR2Url(key) {
  return R2_BASE ? `${R2_BASE}/${key}` : `https://${R2_BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}

function getExtension(url, contentType) {
  const fromUrl = url.split('/').pop()?.split('?')[0]?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromUrl && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(fromUrl)) return fromUrl === 'jpeg' ? 'jpg' : fromUrl;
  return MIME_EXT[contentType] || 'jpg';
}

function isDeadCdn(url) {
  try { return DEAD_CDN_HOSTS.has(new URL(url).hostname); } catch { return false; }
}

function isBlockedPage(html) {
  return html.length < 2000 || html.includes('Just a moment') || html.includes('cf_chl_opt') || html.includes('Enable JavaScript and cookies to continue');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function logStillFailed(entry) {
  appendFileSync('scripts/still-failed-images.jsonl', JSON.stringify(entry) + '\n');
}

// ── Core Functions ────────────────────────────────────────────────────────────
async function fetchPageHtml(url) {
  try {
    const r = await gotScraping({ url, responseType: 'text', ...SCRAPE_OPTS, headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
    if (r.statusCode !== 200) return null;
    if (isBlockedPage(r.body)) return null;
    return r.body;
  } catch { return null; }
}

function parseChapterImages(html) {
  // Primary: ts-reader.run() JSON
  const tsReaderMatch = html.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\)/);
  if (tsReaderMatch) {
    try {
      const data = JSON.parse(tsReaderMatch[1]);
      const imgs = data?.sources?.[0]?.images ?? data?.resources?.[0]?.images;
      if (imgs) return imgs.filter(Boolean);
    } catch {}
  }

  const images = [];
  // Fallback: entry-content / reading-content div
  const contentRe = /<(?:div|section)[^>]+class="[^"]*(?:entry-content|reading-content|page-break)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
  let m;
  while ((m = contentRe.exec(html)) !== null) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
    let im;
    while ((im = imgRe.exec(m[1])) !== null) {
      const src = im[1].trim();
      if (src && !src.includes('data:') && !src.includes('loading.')) images.push(src);
    }
  }
  return images;
}

async function downloadImage(url) {
  try {
    const r = await gotScraping({
      url, responseType: 'buffer',
      timeout: { request: 20000 }, retry: { limit: 1 },
      headerGeneratorOptions: SCRAPE_OPTS.headerGeneratorOptions,
      headers: { Referer: 'https://04x.manhwaland.land/', Accept: 'image/*,*/*' },
    });
    if (r.statusCode !== 200 || r.body.length < 1000) return null;
    const ct = (r.headers['content-type'] || '').split(';')[0].trim();
    if (!ct.startsWith('image/')) return null;
    return { buffer: r.body, contentType: ct };
  } catch { return null; }
}

async function uploadToR2(buffer, key, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buffer,
    ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable',
  }));
  return buildR2Url(key);
}

// ── Build candidate chapter URLs from manga source_url ────────────────────────
function buildCandidateUrls(sourceUrl, chapterNumber) {
  const sourceParsed = new URL(sourceUrl);
  const pathParts = sourceParsed.pathname.replace(/\/$/, '').split('/');
  const slug = pathParts[pathParts.length - 1];
  const intNum = Math.floor(chapterNumber);
  const paddedNum = String(intNum).padStart(2, '0');

  if (intNum !== chapterNumber) {
    return [`${sourceParsed.origin}/${slug}-chapter-${chapterNumber}/`];
  } else if (intNum < 100) {
    return [
      `${sourceParsed.origin}/${slug}-chapter-${intNum}/`,
      `${sourceParsed.origin}/${slug}-chapter-${paddedNum}/`,
    ];
  }
  return [`${sourceParsed.origin}/${slug}-chapter-${intNum}/`];
}

// ── Process one chapter ───────────────────────────────────────────────────────
async function retryChapter(chapter, manga) {
  const candidateUrls = buildCandidateUrls(manga.source_url, chapter.number);

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
    return { success: 0, failed: 0, reason: 'page_fetch_failed' };
  }

  const imageUrls = parseChapterImages(chapterHtml);
  if (imageUrls.length === 0) {
    return { success: 0, failed: 0, reason: 'no_images_parsed' };
  }

  const imageRecords = [];
  let failed = 0;

  for (let i = 0; i < imageUrls.length; i += IMAGE_BATCH) {
    const batch = imageUrls.slice(i, i + IMAGE_BATCH);
    const results = await Promise.allSettled(
      batch.map(async (imgUrl, batchIdx) => {
        const pageIdx = i + batchIdx + 1;
        if (isDeadCdn(imgUrl)) return { page: pageIdx, status: 'dead_cdn' };
        const imageData = await downloadImage(imgUrl);
        if (!imageData) return { page: pageIdx, status: 'download_failed' };
        const ext = getExtension(imgUrl, imageData.contentType);
        const key = `chapters/${chapter.id}/${pageIdx}.${ext}`;
        const r2Url = await uploadToR2(imageData.buffer, key, imageData.contentType);
        return { page: pageIdx, url: r2Url, status: 'ok' };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.status === 'ok') {
          imageRecords.push({ chapter_id: chapter.id, number: r.value.page, image_url: r.value.url, width: 0, height: 0 });
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    }

    if (i + IMAGE_BATCH < imageUrls.length) await sleep(IMAGE_DELAY + Math.random() * 500);
  }

  // Upsert to DB
  if (imageRecords.length > 0) {
    const { error: insertErr } = await supabase
      .from('chapter_images')
      .upsert(imageRecords, { onConflict: 'chapter_id,number' });
    if (insertErr) {
      console.log(`      ⚠️  DB error: ${insertErr.message}`);
    }

    // Update thumbnail
    const thumb = imageRecords.length >= 5 ? imageRecords[4] : imageRecords[0];
    if (thumb?.image_url) {
      await supabase.from('chapters').update({ thumbnail_url: thumb.image_url }).eq('id', chapter.id);
    }
  }

  return { success: imageRecords.length, failed, totalImages: imageUrls.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const failedFile = 'scripts/failed-chapters.jsonl';
  if (!existsSync(failedFile)) {
    console.log('❌ scripts/failed-chapters.jsonl tidak ditemukan!');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════');
  console.log('  Retry Failed Images — Re-scrape Edition');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Delay: ${CHAPTER_DELAY}ms | Limit: ${LIMIT || 'all'}`);
  console.log('');

  // Read failed entries, get unique chapter_ids
  const lines = readFileSync(failedFile, 'utf8').split('\n').filter(l => l.trim());
  const entries = lines.map(l => JSON.parse(l));
  const uniqueChapterIds = [...new Set(entries.map(e => e.chapter_id))];

  console.log(`📊 Total failed images: ${entries.length}`);
  console.log(`📊 Unique chapters: ${uniqueChapterIds.length}`);
  console.log('');

  let chaptersToProcess = uniqueChapterIds;
  if (LIMIT > 0) {
    chaptersToProcess = chaptersToProcess.slice(0, LIMIT);
    console.log(`⚠️  Limited to ${LIMIT} chapters\n`);
  }

  let totalSuccess = 0;
  let totalFailed = 0;
  let chaptersRepaired = 0;
  let chaptersStillBroken = 0;
  const startTime = Date.now();

  for (let i = 0; i < chaptersToProcess.length; i++) {
    const chapterId = chaptersToProcess[i];

    // Fetch chapter info
    const { data: chapter } = await supabase
      .from('chapters')
      .select('id, number, manga_id')
      .eq('id', chapterId)
      .single();

    if (!chapter) {
      console.log(`  [${i + 1}/${chaptersToProcess.length}] Chapter ${chapterId.slice(0, 8)} not found`);
      continue;
    }

    // Fetch manga source_url
    const { data: manga } = await supabase
      .from('manga')
      .select('id, title, source_url')
      .eq('id', chapter.manga_id)
      .single();

    if (!manga?.source_url) {
      console.log(`  [${i + 1}/${chaptersToProcess.length}] No source_url for "${manga?.title || chapterId}"`);
      continue;
    }

    process.stdout.write(`  [${i + 1}/${chaptersToProcess.length}] "${manga.title.slice(0, 25)}" Ch.${chapter.number}... `);

    const result = await retryChapter(chapter, manga);

    if (result.success > 0) {
      chaptersRepaired++;
      totalSuccess += result.success;
      totalFailed += result.failed;
      console.log(`✅ ${result.success} images` + (result.failed > 0 ? ` (${result.failed} still failed)` : ''));
    } else {
      chaptersStillBroken++;
      const reason = result.reason || `all ${result.totalImages || 0} downloads failed`;
      console.log(`❌ ${reason}`);
    }

    if (CHAPTER_DELAY > 0 && i < chaptersToProcess.length - 1) {
      await sleep(CHAPTER_DELAY);
    }

    // Progress every 20 chapters
    if ((i + 1) % 20 === 0) {
      const elapsed = ((Date.now() - startTime) / 60).toFixed(0);
      const rate = ((i + 1) / (elapsed / 60)).toFixed(1);
      const remaining = Math.ceil((chaptersToProcess.length - i - 1) / rate / 60);
      console.log(`\n  📊 Progress: ${i + 1}/${chaptersToProcess.length} | ${rate} ch/min | ETA ~${remaining}h\n`);
    }
  }

  const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('\n═══════════════════════════════════════════════');
  console.log(`✅  Images recovered  : ${totalSuccess}`);
  console.log(`❌  Images still failed: ${totalFailed}`);
  console.log(`📚  Chapters repaired : ${chaptersRepaired}`);
  console.log(`💔  Chapters broken   : ${chaptersStillBroken}`);
  console.log(`⏱️  Waktu             : ${elapsedMin} menit`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(console.error);