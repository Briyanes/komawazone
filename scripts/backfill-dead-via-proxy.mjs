#!/usr/bin/env node
/**
 * BACKFILL DEAD IMAGES VIA PROXY — 50x faster than Playwright approach.
 *
 * Instead of rendering pages with a browser, this downloads each image URL
 * directly using the Webshare proxy pool (same method that successfully
 * downloads cover images). This is massively faster:
 *
 *   Playwright: ~4.7 chapters/min (browser render + scroll + lazy load)
 *   Proxy:      ~50 images/sec   (direct HTTP download through proxy)
 *
 * For 602K images:
 *   Playwright: ~17 days
 *   Proxy:      ~3-5 hours
 *
 * Usage:
 *   node scripts/backfill-dead-via-proxy.mjs              # Full run
 *   node scripts/backfill-dead-via-proxy.mjs --dry-run    # Preview counts
 *   node scripts/backfill-dead-via-proxy.mjs --limit=1000 # Limit images
 *   node scripts/backfill-dead-via-proxy.mjs --workers=30 # Concurrency
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ProxyAgent, request as undiciRequest } from 'undici';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

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

const DEFAULT_TIMEOUT = 20000;
const DB_BATCH = 500;
const DB_MAX_RETRIES = 3;
const PROXY_COOLDOWN_MS = 30_000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT_ARG = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const NUM_WORKERS = parseInt(args.find(a => a.startsWith('--workers='))?.split('=')[1] || '30', 10);

// ─── Init ───
if (!SUPABASE_URL || !SUPABASE_KEY || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Proxy Pool ───
const PROXY_LIST_RAW = process.env.PROXY_LIST?.trim() || [
  '31.59.20.176:6754:ozfcoksy:862ttfhg7gcb',
  '92.113.242.158:6742:ozfcoksy:862ttfhg7gcb',
  '23.95.150.145:6114:ozfcoksy:862ttfhg7gcb',
  '38.154.203.95:5863:ozfcoksy:862ttfhg7gcb',
  '198.105.121.200:6462:ozfcoksy:862ttfhg7gcb',
  '64.137.96.74:6641:ozfcoksy:862ttfhg7gcb',
  '38.154.185.97:6370:ozfcoksy:862ttfhg7gcb',
  '142.111.67.146:5611:ozfcoksy:862ttfhg7gcb',
  '191.96.254.138:6185:ozfcoksy:862ttfhg7gcb',
  '2.57.20.2:6983:ozfcoksy:862ttfhg7gcb',
].join(',');

const proxyPool = [];
for (const token of PROXY_LIST_RAW.split(/[,\n]+/)) {
  const parts = token.trim().split(':');
  if (parts.length < 4) continue;
  const [host, portStr, username, ...rest] = parts;
  const password = rest.join(':');
  const port = parseInt(portStr, 10);
  if (host && Number.isFinite(port) && username && password) {
    proxyPool.push({ host, port, username, password });
  }
}

const badUntil = new Map();
let rrIndex = 0;

function pickProxy() {
  if (proxyPool.length === 0) return null;
  const now = Date.now();
  for (let i = 0; i < proxyPool.length; i++) {
    const candidate = proxyPool[rrIndex % proxyPool.length];
    rrIndex++;
    if ((badUntil.get(candidate.host) ?? 0) <= now) return candidate;
  }
  // All on cooldown — use oldest
  const oldest = [...badUntil.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
  if (oldest) {
    badUntil.delete(oldest);
    return proxyPool.find(p => p.host === oldest) ?? null;
  }
  return null;
}

function markProxyBad(host) {
  badUntil.set(host, Date.now() + PROXY_COOLDOWN_MS);
}

// ─── Download through proxy ───
function buildHeaders(url) {
  let origin = 'https://04x.manhwaland.land/';
  try { origin = new URL(url).origin + '/'; } catch {}
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
    'Referer': origin,
    'sec-fetch-dest': 'image',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'cross-site',
  };
}

function upgradeToHttps(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return url;
  } catch { return url; }
}

async function downloadViaProxy(url, maxRetries = 3) {
  const fetchUrl = upgradeToHttps(url);
  const headers = buildHeaders(url);
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const proxy = pickProxy();
    if (!proxy) {
      // No proxy available — try direct as last resort
      try {
        const res = await fetch(fetchUrl, {
          headers,
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
        });
        if (res.ok) {
          const ct = res.headers.get('content-type') || 'image/jpeg';
          if (!ct.startsWith('image/')) throw new Error(`Bad CT: ${ct}`);
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length === 0 || buf.length > MAX_IMAGE_SIZE) throw new Error('Bad size');
          return { buffer: buf, contentType: ct };
        }
      } catch (e) { lastError = e; }
      await sleep(1000);
      continue;
    }

    const dispatcher = new ProxyAgent(`http://${proxy.username}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`);

    try {
      const res = await undiciRequest(fetchUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
        dispatcher,
      });

      if (res.statusCode === 403 || res.statusCode === 429 || res.statusCode === 503) {
        markProxyBad(proxy.host);
        lastError = new Error(`HTTP ${res.statusCode} via ${proxy.host}`);
        try { await res.body.dump(); } catch {}
        await sleep(500);
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        markProxyBad(proxy.host);
        lastError = new Error(`HTTP ${res.statusCode} via ${proxy.host}`);
        try { await res.body.dump(); } catch {}
        continue;
      }

      const chunks = [];
      for await (const chunk of res.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length === 0 || buffer.length > MAX_IMAGE_SIZE) {
        throw new Error(`Bad size: ${buffer.length}`);
      }

      const ct = res.headers['content-type'];
      const contentType = Array.isArray(ct) ? ct[0] : ct || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        // Some CDNs return text/plain for images — check buffer magic bytes
        if (buffer.length > 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
          return { buffer, contentType: 'image/jpeg' };
        }
        if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50) {
          return { buffer, contentType: 'image/png' };
        }
        if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF') {
          return { buffer, contentType: 'image/webp' };
        }
        throw new Error(`Bad CT: ${contentType}`);
      }

      return { buffer, contentType };
    } catch (err) {
      markProxyBad(proxy.host);
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error('Download failed');
}

// ─── Upload to R2 ───
async function uploadToR2(buffer, contentType, chapterId, imageId) {
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  // Use the image ID as the key to ensure uniqueness
  const key = `chapters/${chapterId}/${imageId}.${ext}`;

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return `/api/r2/image/${key}`;
}

// ─── DB helpers ───
async function dbWithRetry(fn, label) {
  for (let i = 0; i < DB_MAX_RETRIES; i++) {
    try {
      const result = await fn();
      if (result.error) throw result.error;
      return result;
    } catch (e) {
      if (i < DB_MAX_RETRIES - 1) {
        console.error(`  ⚠️ DB retry (${label}): ${e.message.substring(0, 80)}`);
        await sleep(2000);
      } else throw e;
    }
  }
}

// ─── Main ───
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🚀 BACKFILL DEAD IMAGES VIA PROXY (No Playwright!)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Mode:       ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Workers:    ${NUM_WORKERS} concurrent downloads`);
  console.log(`  Proxies:    ${proxyPool.length} Webshare IPs`);
  console.log(`  Limit:      ${LIMIT_ARG || 'ALL'}`);
  console.log('');

  // Step 1: Fetch all dead images (keyset pagination)
  console.log('📊 Step 1: Fetching dead images from database...');
  const allDeadImages = [];
  let cursor = 0;

  while (true) {
    const result = await dbWithRetry(async () => {
      let q = sb.from('chapter_images')
        .select('id, chapter_id, image_url, number')
        .or('image_url.ilike.%gmbr.pro%,image_url.ilike.%gmbar.xyz%,image_url.ilike.%uwakjawa.xyz%')
        .order('id', { ascending: true })
        .limit(DB_BATCH);
      if (cursor > 0) q = q.gt('id', cursor);
      return await q;
    }, `fetch @${allDeadImages.length}`);

    if (!result.data || result.data.length === 0) break;

    allDeadImages.push(...result.data);
    cursor = result.data[result.data.length - 1].id;
    process.stdout.write(`\r  Fetched ${allDeadImages.length.toLocaleString()} dead images...`);

    if (result.data.length < DB_BATCH) break;
    // Early exit if we only need a subset (for --limit testing)
    if (LIMIT_ARG > 0 && allDeadImages.length >= LIMIT_ARG) {
      allDeadImages.length = LIMIT_ARG;
      break;
    }
  }

  console.log(`\n  Total dead images: ${allDeadImages.length.toLocaleString()}`);

  if (allDeadImages.length === 0) {
    console.log('\n  ✅ No dead images found! Everything is already on R2.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n  ⚠️ DRY RUN — no changes made.');
    console.log(`  Would download ${allDeadImages.length.toLocaleString()} images via proxy.`);
    return;
  }

  const toProcess = LIMIT_ARG > 0 ? allDeadImages.slice(0, LIMIT_ARG) : allDeadImages;
  console.log(`  Processing: ${toProcess.length.toLocaleString()} images`);

  // Step 2: Process with worker pool
  console.log(`\n🚀 Step 2: Downloading via proxy (${NUM_WORKERS} workers)...\n`);

  const stats = {
    success: 0,
    failed: 0,
    startTime: Date.now(),
    lastPrint: Date.now(),
  };

  let queueIndex = 0;

  async function workerLoop(workerId) {
    while (queueIndex < toProcess.length) {
      const idx = queueIndex++;
      if (idx >= toProcess.length) break;

      const img = toProcess[idx];
      const r2Url = `/api/r2/image/chapters/${img.chapter_id}/${img.id}`;

      // Skip if already on R2 (double-check)
      if (img.image_url.startsWith('/api/r2/image/')) continue;

      try {
        // Download via proxy
        const { buffer, contentType } = await downloadViaProxy(img.image_url);

        // Upload to R2
        const newUrl = await uploadToR2(buffer, contentType, img.chapter_id, img.id);

        // Update database
        await dbWithRetry(async () => {
          return await sb.from('chapter_images')
            .update({ image_url: newUrl })
            .eq('id', img.id);
        }, `update img ${img.id}`);

        stats.success++;
      } catch (err) {
        stats.failed++;
        // Log errors periodically, not per-image
        if (stats.failed % 100 === 0) {
          console.error(`  ⚠️ Worker ${workerId}: ${stats.failed} failures so far. Last: ${err.message.substring(0, 80)}`);
        }
      }

      // Progress print every 3 seconds
      if (Date.now() - stats.lastPrint > 3000) {
        stats.lastPrint = Date.now();
        const done = stats.success + stats.failed;
        const elapsed = (Date.now() - stats.startTime) / 1000;
        const rate = (done / elapsed).toFixed(1);
        const remaining = toProcess.length - done;
        const etaMin = rate > 0 ? (remaining / rate / 60).toFixed(0) : '?';
        const pct = ((done / toProcess.length) * 100).toFixed(1);
        console.log(`  📊 [W${workerId}] ${done.toLocaleString()}/${toProcess.length.toLocaleString()} (${pct}%) | ✅${stats.success.toLocaleString()} ❌${stats.failed} | ${rate} img/s | ETA: ${etaMin}min`);
      }
    }
  }

  // Launch workers
  const workers = [];
  for (let i = 0; i < NUM_WORKERS; i++) {
    workers.push(workerLoop(i));
  }
  await Promise.all(workers);

  // Summary
  const elapsedMin = ((Date.now() - stats.startTime) / 60000).toFixed(1);
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  📊 BACKFILL COMPLETE (Via Proxy)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Images fixed:    ${stats.success.toLocaleString()}`);
  console.log(`  Images failed:   ${stats.failed.toLocaleString()}`);
  console.log(`  Time elapsed:    ${elapsedMin} min`);
  console.log(`  Speed:           ${(stats.success / Math.max(0.1, parseFloat(elapsedMin)) / 60).toFixed(1)} img/sec`);
  console.log(`  Success rate:    ${((stats.success / (stats.success + stats.failed)) * 100).toFixed(1)}%`);
  console.log('');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});