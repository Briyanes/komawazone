#!/usr/bin/env node
/**
 * download-to-r2-massive.mjs
 *
 * Massive parallel downloader: downloads ALL chapter images from external CDNs
 * (gmbr.pro, manhwaland, etc.) to Cloudflare R2, then updates DB to point to R2.
 *
 * Usage:
 *   PROXY_LIST="host:port:user:pass,..." node scripts/download-to-r2-massive.mjs
 *
 * Features:
 *   - Reads PROXY_LIST from .env.local or environment
 *   - Downloads images NOT already in R2 (skip existing)
 *   - High concurrency with proxy rotation (up to 30 parallel)
 *   - Auto-retry with backoff
 *   - Resume support (tracks progress in file)
 *   - Progress reporting every 100 images
 *   - Estimated time remaining
 *
 * Expected: ~106,000 images → ~1-2 hours with 100 proxies
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { ProxyAgent, request as undiciRequest } from 'undici';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ────────────────────────────────────────────────────────
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;
const USE_PROXY = !!process.env.PROXY_LIST;
const PROGRESS_FILE = path.join(__dirname, 'download-progress.json');

// ─── Load .env.local ───────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    console.log('✅ Loaded .env.local');
  }
}
loadEnv();

// ─── Validate env ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

const missing = [];
if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID');
if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
if (!R2_BUCKET) missing.push('R2_BUCKET');
if (missing.length > 0) {
  console.error(`❌ Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// ─── Supabase client ───────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── R2 client ─────────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ─── Proxy pool ────────────────────────────────────────────────────
let proxyPool = [];
let rrIndex = 0;
const badUntil = new Map();

function parseProxyList(raw) {
  const entries = [];
  for (const token of raw.split(/[,\n]+/)) {
    const parts = token.trim().split(':');
    if (parts.length < 4) continue;
    const [host, portStr, username, ...rest] = parts;
    const password = rest.join(':');
    const port = parseInt(portStr, 10);
    if (host && Number.isFinite(port) && username && password) {
      entries.push({ host, port, username, password });
    }
  }
  return entries;
}

function initProxyPool() {
  if (!USE_PROXY) {
    console.log('⚠️  No PROXY_LIST found — running in DIRECT mode (no proxy)');
    console.log('   Concurrency reduced to avoid IP ban. For faster migration, add proxies.');
    return;
  }
  const raw = process.env.PROXY_LIST.trim();
  proxyPool = parseProxyList(raw);
  console.log(`📡 Proxy pool: ${proxyPool.length} proxies loaded`);
  if (proxyPool.length === 0) {
    console.error('❌ No valid proxies found in PROXY_LIST!');
    process.exit(1);
  }
}

function pickProxy() {
  const now = Date.now();
  for (let i = 0; i < proxyPool.length; i++) {
    const candidate = proxyPool[rrIndex % proxyPool.length];
    rrIndex++;
    if ((badUntil.get(candidate.host) ?? 0) <= now) {
      return candidate;
    }
  }
  // All on cooldown — force use oldest expired
  const oldest = [...badUntil.entries()].sort((a, b) => a[1] - b[1])[0];
  if (oldest) {
    badUntil.delete(oldest[0]);
    return proxyPool.find(p => p.host === oldest[0]) ?? proxyPool[0];
  }
  return proxyPool[0];
}

function markProxyBad(host) {
  badUntil.set(host, Date.now() + 60_000);
}

// ─── Helpers ───────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isExternalUrl(url) {
  if (!url) return false;
  if (url.startsWith('/api/r2/image/')) return false;
  if (url.includes('.r2.cloudflarestorage.com')) return false;
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  return false;
}

function upgradeToHttps(url) {
  return url.replace(/^http:\/\//, 'https://');
}

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

// ─── Download via proxy ────────────────────────────────────────────
async function downloadImage(url) {
  const fetchUrl = upgradeToHttps(url);
  const headers = buildHeaders(fetchUrl);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const proxy = pickProxy();
    const dispatcher = new ProxyAgent(
      `http://${proxy.username}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`
    );

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await undiciRequest(fetchUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
        dispatcher,
      });

      clearTimeout(timer);

      if (res.statusCode === 403 || res.statusCode === 429 || res.statusCode === 503) {
        markProxyBad(proxy.host);
        try { await res.body.dump(); } catch {}
        await sleep(2000 * (attempt + 1));
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        markProxyBad(proxy.host);
        try { await res.body.dump(); } catch {}
        continue;
      }

      const chunks = [];
      for await (const chunk of res.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length === 0) throw new Error('Empty response');

      const ct = res.headers['content-type'];
      const contentType = Array.isArray(ct) ? ct[0] : (ct || 'image/jpeg');

      return { buffer, contentType };
    } catch (err) {
      markProxyBad(proxy.host);
      if (attempt < MAX_RETRIES - 1) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  throw new Error(`Failed after ${MAX_RETRIES} retries`);
}

// ─── Upload to R2 ──────────────────────────────────────────────────
async function uploadToR2(buffer, contentType, key) {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

// ─── Check if R2 object exists ─────────────────────────────────────
async function r2ObjectExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ─── Progress tracking ─────────────────────────────────────────────
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { lastOffset: 0, downloaded: 0, failed: 0, skipped: 0, startTime: Date.now() };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🚀 MASSIVE R2 MIGRATION — Chapter Images → Cloudflare R2');
  console.log('═══════════════════════════════════════════════════════════\n');

  initProxyPool();

  // Get total count of external images
  const { count: totalCount } = await supabase
    .from('chapter_images')
    .select('*', { count: 'exact', head: true });

  // Get count of already-migrated (R2) images
  const { count: r2Count } = await supabase
    .from('chapter_images')
    .select('*', { count: 'exact', head: true })
    .like('url', '/api/r2/image/%');

  const externalCount = (totalCount ?? 0) - (r2Count ?? 0);

  console.log(`📊 Total chapter_images: ${totalCount?.toLocaleString() ?? '?'}`);
  console.log(`✅ Already in R2:       ${r2Count?.toLocaleString() ?? '?'}`);
  console.log(`⬇️  Need download:       ${externalCount.toLocaleString()}`);
  console.log(`⚡ Concurrency:         ${CONCURRENCY}`);
  console.log('');

  if (externalCount === 0) {
    console.log('✅ All images already in R2! Nothing to do.');
    return;
  }

  // Fetch all external image URLs in batches
  const BATCH_SIZE = 1000;
  const progress = loadProgress();

  console.log(`📥 Fetching ${externalCount.toLocaleString()} external image URLs...\n`);

  let allRows = [];
  let offset = 0;

  while (offset < (totalCount ?? 0)) {
    const { data, error } = await supabase
      .from('chapter_images')
      .select('id, chapter_id, url')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('id');

    if (error) {
      console.error('Error fetching batch:', error.message);
      break;
    }

    if (!data || data.length === 0) break;

    // Filter only external URLs
    const externalRows = data.filter(r => isExternalUrl(r.url));
    allRows = allRows.concat(externalRows);

    offset += BATCH_SIZE;

    if (data.length < BATCH_SIZE) break;
  }

  console.log(`📋 Found ${allRows.length.toLocaleString()} images to download\n`);

  // Process in concurrent batches
  let processed = 0;
  let downloaded = progress.downloaded;
  let failed = progress.failed;
  let skipped = progress.skipped;
  const startTime = Date.now();

  async function processRow(row) {
    try {
      // Generate R2 key: pages/{chapter_id}/{image_id}.jpg
      const ext = row.url.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
      const r2Key = `pages/${row.chapter_id}/${row.id}.${safeExt}`;

      // Skip if already exists in R2
      const exists = await r2ObjectExists(r2Key);
      if (exists) {
        // Just update the URL in DB
        const r2Url = `/api/r2/image/${r2Key}`;
        await supabase.from('chapter_images').update({ url: r2Url }).eq('id', row.id);
        skipped++;
        return { status: 'skipped' };
      }

      // Download via proxy
      const { buffer, contentType } = await downloadImage(row.url);

      // Upload to R2
      await uploadToR2(buffer, contentType, r2Key);

      // Update DB with R2 URL
      const r2Url = `/api/r2/image/${r2Key}`;
      await supabase.from('chapter_images').update({ url: r2Url }).eq('id', row.id);

      downloaded++;
      return { status: 'downloaded' };
    } catch (err) {
      failed++;
      return { status: 'failed', error: err.message };
    }
  }

  // Concurrent processing
  for (let i = 0; i < allRows.length; i += CONCURRENCY) {
    const batch = allRows.slice(i, i + CONCURRENCY);
    const promises = batch.map(row => processRow(row).catch(() => ({ status: 'failed' })));
    const results = await Promise.all(promises);

    processed += batch.length;

    // Progress report
    if (processed % 100 < CONCURRENCY || processed === allRows.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (allRows.length - processed) / rate;
      const remainingMin = Math.floor(remaining / 60);
      const remainingSec = Math.floor(remaining % 60);

      process.stdout.write(
        `\r✅ ${downloaded.toLocaleString()} downloaded | ⏭️  ${skipped.toLocaleString()} skipped | ❌ ${failed.toLocaleString()} failed | ` +
        `📊 ${processed.toLocaleString()}/${allRows.length.toLocaleString()} (${(processed/allRows.length*100).toFixed(1)}%) | ` +
        `⚡ ${rate.toFixed(1)}/s | ⏱️  ETA: ${remainingMin}m ${remainingSec}s  `
      );
    }

    // Save progress every 500 items
    if (processed % 500 < CONCURRENCY) {
      saveProgress({ lastOffset: i + CONCURRENCY, downloaded, failed, skipped, startTime });
    }
  }

  // Final report
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ MIGRATION COMPLETE!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📥 Downloaded:  ${downloaded.toLocaleString()}`);
  console.log(`  ⏭️  Skipped:     ${skipped.toLocaleString()} (already in R2)`);
  console.log(`  ❌ Failed:      ${failed.toLocaleString()}`);
  console.log(`  ⏱️  Total time:  ${Math.floor((Date.now() - startTime) / 60000)}m ${Math.floor(((Date.now() - startTime) % 60000) / 1000)}s`);
  console.log('');

  // Verify
  const { count: finalR2 } = await supabase
    .from('chapter_images')
    .select('*', { count: 'exact', head: true })
    .like('url', '/api/r2/image/%');

  console.log(`📊 Final R2 images: ${finalR2?.toLocaleString() ?? '?'}/${totalCount?.toLocaleString()}`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} images failed. Re-run the script to retry.`);
  }

  saveProgress({ lastOffset: allRows.length, downloaded, failed, skipped, startTime });
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});