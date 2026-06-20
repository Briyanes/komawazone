#!/usr/bin/env node
/**
 * download-with-proxies.mjs
 *
 * Pre-downloads ALL chapter images to R2 using Webshare proxy rotation.
 * 10 proxies → high concurrency → ~5x faster than single-IP script.
 *
 * Usage:
 *   node scripts/download-with-proxies.mjs [--limit N] [--resume]
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import fs from 'fs';
import path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const CHAPTER_CONCURRENCY = 8;
const IMAGE_CONCURRENCY   = 5;
const DELAY_MIN           = 200;
const DELAY_MAX           = 600;
const COOLDOWN_EVERY      = 100;
const COOLDOWN_DURATION   = 10_000;
const BATCH_SIZE          = 200;

const PROGRESS_FILE = path.resolve(process.cwd(), 'scripts/download-proxy-progress.json');
const LOG_FILE      = path.resolve(process.cwd(), 'scripts/download-proxy-progress.log');
const PROXY_FILE    = path.resolve(process.cwd(), 'docs/Webshare 10 proxies.txt');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// ─── Load Proxies ────────────────────────────────────────────────────────────

function loadProxies() {
  const text = fs.readFileSync(PROXY_FILE, 'utf-8');
  const proxies = [];
  for (const line of text.trim().split('\n')) {
    const parts = line.trim().split(':');
    if (parts.length === 4) {
      const [host, port, user, pass] = parts;
      proxies.push({
        url: `http://${user}:${pass}@${host}:${port}`,
        host, port: Number(port), user, pass,
        failCount: 0,
      });
    }
  }
  return proxies;
}

const PROXIES = loadProxies();
let proxyIndex = 0;

// Pre-create ProxyAgent dispatchers for each proxy
const DISPATCHERS = PROXIES.map(p => new ProxyAgent({ uri: p.url }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay() { return DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN); }
function getRandomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch { return { completed: [], failed: [], totalProcessed: 0, imagesDownloaded: 0 }; }
}

function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

// ─── Env ─────────────────────────────────────────────────────────────────────

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

const env = loadEnv();

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const BUCKET = env.R2_BUCKET || 'manga-zone';
const R2_PUBLIC_URL = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '') || '';
if (R2_PUBLIC_URL.includes('NEXT_PUBLIC') || R2_PUBLIC_URL.includes('=')) {
  console.error('❌ R2_PUBLIC_BASE_URL looks corrupted:', R2_PUBLIC_URL);
  console.error('   Check .env.local for missing newlines.');
  process.exit(1);
}

// ─── Proxy fetch ─────────────────────────────────────────────────────────────

async function fetchWithProxy(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const idx = proxyIndex % PROXIES.length;
    const proxy = PROXIES[idx];
    const dispatcher = DISPATCHERS[idx];
    proxyIndex++;

    try {
      const res = await undiciFetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        dispatcher,
        signal: AbortSignal.timeout(options.timeout || 25_000),
      });

      if (res.status === 429 || res.status === 503) {
        log(`  ⚠️  ${res.status} from ${proxy.host} — trying different proxy`);
        proxy.failCount++;
        await sleep(2_000);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      proxy.failCount++;
    }
  }
  throw lastError || new Error('All proxy attempts failed');
}

// ─── Scrape chapter images ───────────────────────────────────────────────────

async function scrapeChapterImageUrls(mangaSlug, chapterNumber, sourceOrigin) {
  const intNum = Math.floor(chapterNumber);
  const paddedNum = String(intNum).padStart(2, '0');

  const candidateUrls = intNum !== chapterNumber
    ? [`${sourceOrigin}/${mangaSlug}-chapter-${chapterNumber}/`]
    : intNum < 100
      ? [`${sourceOrigin}/${mangaSlug}-chapter-${intNum}/`, `${sourceOrigin}/${mangaSlug}-chapter-${paddedNum}/`]
      : [`${sourceOrigin}/${mangaSlug}-chapter-${intNum}/`];

  for (const url of candidateUrls) {
    try {
      const res = await fetchWithProxy(url, {
        headers: {
          'User-Agent': getRandomUA(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
          Referer: sourceOrigin + '/',
        },
      });

      if (!res.ok) continue;

      const html = await res.text();

      if (html.includes('cf-browser-verification') || html.includes('Just a moment') || html.length < 2000) {
        continue;
      }

      const urls = [];
      const readerareaIdx = html.indexOf('id="readerarea"');
      const section = readerareaIdx !== -1 ? html.slice(readerareaIdx, readerareaIdx + 80000) : html;

      // Primary: noscript lazy-load
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

      // Last resort: img src
      if (urls.length === 0) {
        const imgSrcRe = /<img[^>]+src=['"]([^'"]+)['"]/g;
        while ((m = imgSrcRe.exec(section)) !== null) {
          if (/^https?:\/\//i.test(m[1]) && /chapter|manga[-_.]images|upload/i.test(m[1])) {
            urls.push(m[1]);
          }
        }
      }

      if (urls.length > 0) return { urls, chapterUrl: url };
    } catch {
      // Try next URL
    }
  }

  return { urls: [], chapterUrl: null };
}

// ─── Download & upload single image ──────────────────────────────────────────

async function downloadAndUploadImage(imageUrl, folder) {
  try {
    const res = await fetchWithProxy(imageUrl, {
      headers: {
        'User-Agent': getRandomUA(),
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
        Referer: new URL(imageUrl).origin + '/',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site',
      },
    });

    if (!res.ok) return { url: imageUrl, r2Key: null, downloaded: false };

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return { url: imageUrl, r2Key: null, downloaded: false };

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
      return { url: imageUrl, r2Key: null, downloaded: false };
    }

    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
    const ext = extMap[contentType] || 'jpg';
    const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    const r2Url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `https://${BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
    return { url: r2Url, r2Key: key, downloaded: true };
  } catch {
    return { url: imageUrl, r2Key: null, downloaded: false };
  }
}

// ─── Process single chapter ──────────────────────────────────────────────────

async function processChapter(chapter, manga) {
  const chapterId = chapter.id;

  // Check existing images
  const { data: existing } = await sb.from('chapter_images').select('id').eq('chapter_id', chapterId).limit(1);
  if (existing && existing.length > 0) {
    if (!chapter.thumbnail_url) {
      const { data: imgs } = await sb.from('chapter_images')
        .select('image_url, number').eq('chapter_id', chapterId).order('number', { ascending: true });
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
    return { status: 'skipped', images: existing.length };
  }

  const sourceOrigin = manga.source_url ? new URL(manga.source_url).origin : 'https://04x.manhwaland.land';
  const { urls: sourceUrls } = await scrapeChapterImageUrls(manga.slug, chapter.number, sourceOrigin);

  if (sourceUrls.length === 0) {
    return { status: 'no_images', images: 0 };
  }

  // Download all images with IMAGE_CONCURRENCY parallel
  const r2Results = [];
  for (let i = 0; i < sourceUrls.length; i += IMAGE_CONCURRENCY) {
    const batch = sourceUrls.slice(i, i + IMAGE_CONCURRENCY);
    const results = await Promise.all(batch.map(u => downloadAndUploadImage(u, 'pages')));
    r2Results.push(...results);
    if (i + IMAGE_CONCURRENCY < sourceUrls.length) await sleep(randomDelay());
  }

  // Save to DB
  const imageRows = r2Results.map((r, i) => ({
    chapter_id: chapterId, image_url: r.url, number: i + 1,
  }));

  await sb.from('chapter_images').upsert(imageRows, { onConflict: 'chapter_id,number', ignoreDuplicates: true });

  // Set thumbnail to 5th image
  const thumbnailUrl = r2Results.length >= 5 ? r2Results[4].url : r2Results[r2Results.length - 1]?.url;
  if (thumbnailUrl) {
    await sb.from('chapters').update({ thumbnail_url: thumbnailUrl }).eq('id', chapterId);
  }

  const downloaded = r2Results.filter(r => r.downloaded).length;
  return { status: 'success', images: sourceUrls.length, downloaded };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;
  const isResume = args.includes('--resume');

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('🚀 download-with-proxies.mjs — PROXY MODE');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`  Proxies             : ${PROXIES.length} (Webshare)`);
  log(`  Chapter Concurrency : ${CHAPTER_CONCURRENCY}`);
  log(`  Image Concurrency   : ${IMAGE_CONCURRENCY}`);
  log(`  Delay Range         : ${DELAY_MIN}-${DELAY_MAX}ms`);
  log(`  Limit               : ${limit || 'ALL'}`);
  log(`  Resume              : ${isResume ? 'YES' : 'NO'}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Test proxies
  log('\n🧪 Testing proxies...');
  let workingProxies = 0;
  for (let i = 0; i < PROXIES.length; i++) {
    const p = PROXIES[i];
    const dispatcher = DISPATCHERS[i];
    try {
      const res = await undiciFetch('https://httpbin.org/ip', { dispatcher, signal: AbortSignal.timeout(10_000) });
      if (res.ok) { workingProxies++; log(`  ✅ ${p.host}:${p.port}`); }
      else { log(`  ❌ ${p.host}:${p.port} — HTTP ${res.status}`); }
    } catch {
      log(`  ❌ ${p.host}:${p.port} — timeout/error`);
    }
  }
  log(`📊 Working proxies: ${workingProxies}/${PROXIES.length}`);

  if (workingProxies === 0) {
    log('💥 No working proxies! Aborting.');
    process.exit(1);
  }

  // Load progress
  const progress = isResume ? loadProgress() : { completed: [], failed: [], totalProcessed: 0, imagesDownloaded: 0 };
  if (isResume) log(`📂 Resuming: ${progress.completed.length} completed, ${progress.failed.length} failed`);

  // Fetch all chapters without images (NULL thumbnail)
  log('\n📋 Fetching chapters that need images...');
  let allChapters = [];
  let offset = 0;

  while (true) {
    const { data, error } = await sb.from('chapters')
      .select('id, number, title, manga_id, thumbnail_url')
      .is('deleted_at', null)
      .is('thumbnail_url', null)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error || !data || data.length === 0) break;
    allChapters.push(...data);
    offset += BATCH_SIZE;
    if (data.length < BATCH_SIZE) break;
  }

  // Filter resume
  let chaptersToProcess = allChapters;
  if (isResume) {
    chaptersToProcess = allChapters.filter(ch => !progress.completed.includes(ch.id));
  }
  if (limit > 0) chaptersToProcess = chaptersToProcess.slice(0, limit);

  log(`📊 Found ${allChapters.length} chapters needing images`);
  log(`📊 To process: ${chaptersToProcess.length}`);

  if (chaptersToProcess.length === 0) {
    log('✅ All chapters already have images! Nothing to do.');
    return;
  }

  // Stats
  const stats = { success: 0, failed: 0, noImages: 0, skipped: 0, thumbFixed: 0, imagesDownloaded: 0 };

  // Process in chunks
  const CHUNK = 500;
  for (let i = 0; i < chaptersToProcess.length; i += CHUNK) {
    const chunk = chaptersToProcess.slice(i, i + CHUNK);
    log(`\n📦 Chunk ${Math.floor(i/CHUNK)+1}/${Math.ceil(chaptersToProcess.length/CHUNK)} (${chunk.length} chapters)`);

    for (let j = 0; j < chunk.length; j += CHAPTER_CONCURRENCY) {
      const batch = chunk.slice(j, j + CHAPTER_CONCURRENCY);

      const results = await Promise.all(batch.map(async (chapter) => {
        const { data: manga } = await sb.from('manga').select('slug, source_url').eq('id', chapter.manga_id).single();
        if (!manga) return { chapterId: chapter.id, status: 'no_manga' };

        try {
          const result = await processChapter(chapter, manga);
          return { chapterId: chapter.id, ...result };
        } catch (err) {
          return { chapterId: chapter.id, status: 'error', error: err.message };
        }
      }));

      for (const r of results) {
        progress.totalProcessed++;
        if (r.status === 'success') { stats.success++; stats.imagesDownloaded += r.downloaded || 0; progress.completed.push(r.chapterId); }
        else if (r.status === 'thumb_fixed') { stats.thumbFixed++; progress.completed.push(r.chapterId); }
        else if (r.status === 'skipped') { stats.skipped++; progress.completed.push(r.chapterId); }
        else if (r.status === 'no_images') { stats.noImages++; progress.failed.push(r.chapterId); }
        else { stats.failed++; progress.failed.push(r.chapterId); }
      }

      saveProgress(progress);

      const done = i + j + batch.length;
      const pct = ((done / chaptersToProcess.length) * 100).toFixed(1);
      log(`📊 ${done}/${chaptersToProcess.length} (${pct}%) | ✅${stats.success} 🖼️${stats.imagesDownloaded} ⚠️${stats.noImages} ❌${stats.failed}`);

      // Cooldown
      if (progress.totalProcessed % COOLDOWN_EVERY === 0 && done < chaptersToProcess.length) {
        log(`😴 Cooldown ${COOLDOWN_DURATION/1000}s...`);
        await sleep(COOLDOWN_DURATION);
      } else {
        await sleep(randomDelay());
      }
    }
  }

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('📊 FINAL SUMMARY');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`  Chapters Processed : ${progress.totalProcessed}`);
  log(`  Success            : ${stats.success}`);
  log(`  Thumbnail Fixed    : ${stats.thumbFixed}`);
  log(`  Skipped            : ${stats.skipped}`);
  log(`  No Images          : ${stats.noImages}`);
  log(`  Failed             : ${stats.failed}`);
  log(`  Images Downloaded  : ${stats.imagesDownloaded}`);
  log(`  Total Completed    : ${progress.completed.length}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  saveProgress(progress);
}

main().catch(err => { log(`💥 Fatal: ${err.message}`); console.error(err); process.exit(1); });