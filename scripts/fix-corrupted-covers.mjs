#!/usr/bin/env node
/**
 * Fix Corrupted Covers — Find R2 cover files that are too small (corrupted/empty)
 * and re-download them from alternative sources.
 *
 * The original CDN (gmbr.pro) often returns 49-byte error responses.
 * We try manhwaland.cc's own CDN as fallback.
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-corrupted-covers.mjs              # fix all
 *   node --env-file=.env.local scripts/fix-corrupted-covers.mjs --scan-only  # just report
 *   node --env-file=.env.local scripts/fix-corrupted-covers.mjs --manga=<slug> # fix one
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { gotScraping } from 'got-scraping';

const SCAN_ONLY = process.argv.includes('--scan-only');
const MANGA_FILTER = process.argv.find(a => a.startsWith('--manga='))?.split('=')[1];

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'komawazone';
const MIN_COVER_SIZE = 2000;
const R2_URL_PATTERN = /^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i;

const SCRAPE_OPTS = {
  timeout: { request: 15000 },
  retry: { limit: 0 },
  headerGeneratorOptions: {
    browsers: [{ name: 'chrome', minVersion: 112 }],
    devices: ['desktop'],
    operatingSystems: ['macos'],
    locales: ['id-ID', 'en-US'],
  },
};

// ── Helpers ──

function extractR2Key(url) {
  try { return new URL(url).pathname.replace(/^\//, ''); } catch { return null; }
}

function extractR2Domain(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.host}`; } catch {
    return 'https://pub-918f7d0651d64a29a87deb04073b5fa1.r2.dev';
  }
}

async function getR2Size(key) {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return r.ContentLength || 0;
  } catch { return -1; }
}

async function tryDownload(url, referer) {
  try {
    const r = await gotScraping({
      url, responseType: 'buffer', ...SCRAPE_OPTS,
      headers: { Referer: referer || new URL(url).origin + '/', Accept: 'image/*,*/*' },
    });
    if (r.statusCode !== 200) return null;
    if (r.body.length < MIN_COVER_SIZE) return null;
    const ct = (r.headers['content-type'] || '').split(';')[0].trim();
    if (!ct.startsWith('image/')) return null;
    return { buffer: r.body, contentType: ct };
  } catch { return null; }
}

async function findCoverUrl(sourceUrl) {
  const response = await gotScraping({ url: sourceUrl, responseType: 'text', ...SCRAPE_OPTS });
  if (response.statusCode !== 200) return null;
  const html = response.body;

  // Try wp-post-image and og:image
  const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i)
    ?? html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
  if (wpPostImg?.[1]) return wpPostImg[1].startsWith('//') ? 'https:' + wpPostImg[1] : wpPostImg[1];

  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return og[1].startsWith('//') ? 'https:' + og[1] : og[1];

  return null;
}

async function downloadAndUpload(mangaId, originalCoverUrl, r2Key, sourceUrl) {
  // Step 1: Get cover URL from source page
  const coverUrl = await findCoverUrl(sourceUrl);

  // Step 2: Try original cover URL first
  let result = null;
  if (coverUrl) {
    result = await tryDownload(coverUrl, sourceUrl);
  }

  // Step 3: If failed, try manhwaland.cc CDN fallback
  if (!result && sourceUrl.includes('manhwaland')) {
    const slug = mangaId; // we'll construct URLs based on manga slug from source
    const sourceSlug = sourceUrl.match(/\/manga\/([^/]+)\//)?.[1];
    if (sourceSlug) {
      const months = ['2025/07', '2025/06', '2025/05', '2025/04', '2025/03', '2025/02', '2025/01', '2024/12'];
      for (const month of months) {
        for (const ext of ['jpg', 'webp']) {
          const altUrl = `https://02.manhwaland.land/wp-content/uploads/${month}/${sourceSlug}.${ext}`;
          result = await tryDownload(altUrl, sourceUrl);
          if (result) break;
        }
        if (result) break;
      }
    }
  }

  if (!result) throw new Error('All download attempts failed');

  // Step 4: Upload to R2
  const ext = result.contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'webp';
  const finalKey = r2Key.replace(/\.(webp|jpg|jpeg|png)$/i, `.${ext}`);

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: finalKey,
    Body: result.buffer,
    ContentType: result.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const domain = extractR2Domain(originalCoverUrl);
  return `${domain}/${finalKey}`;
}

// ── Main ──

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Fix Corrupted Covers — R2 Cover Scanner');
  console.log('═══════════════════════════════════════════════════\n');

  // Paginate through ALL results (Supabase caps at 1000 per request)
  const allManga = [];
  let offset = 0;
  while (true) {
    let query = sb
      .from('manga')
      .select('id, slug, title, cover_url, source_url')
      .not('cover_url', 'is', null)
      .like('cover_url', 'https://pub-%.r2.dev/%')
      .order('id')
      .range(offset, offset + 999);

    if (MANGA_FILTER) query = query.eq('slug', MANGA_FILTER);

    const { data, error } = await query;
    if (error) { console.error('DB error:', error.message); process.exit(1); }
    if (!data?.length) break;
    allManga.push(...data);
    if (MANGA_FILTER || data.length < 1000) break;
    offset += 1000;
  }

  const manga = allManga;
  console.log(`Checking ${manga.length} manga covers on R2...\n`);

  const corrupted = [];
  let checked = 0;

  for (const m of manga) {
    if (!R2_URL_PATTERN.test(m.cover_url)) continue;
    const key = extractR2Key(m.cover_url);
    if (!key) continue;

    const size = await getR2Size(key);
    checked++;

    if (size === -1) {
      corrupted.push({ ...m, key, size: 0 });
      if (MANGA_FILTER) console.log(`  ❌ MISSING: ${m.title}`);
    } else if (size < MIN_COVER_SIZE) {
      corrupted.push({ ...m, key, size });
      if (MANGA_FILTER) console.log(`  ⚠️  CORRUPT: ${m.title} — ${size} bytes`);
    }

    if (checked % 200 === 0) console.log(`  ... checked ${checked}/${manga.length}`);
  }

  console.log(`\n───────────────────────────────────────────────────`);
  console.log(`Scan: ${checked} checked, ${corrupted.length} corrupted/missing\n`);

  if (SCAN_ONLY) {
    for (const c of corrupted) console.log(`  • ${c.title} (${c.size}b) — ${c.source_url}`);
    process.exit(0);
  }

  if (corrupted.length === 0) {
    console.log('✅ All covers OK!');
    process.exit(0);
  }

  console.log(`Fixing ${corrupted.length} covers...\n`);

  let fixed = 0, failed = 0;

  for (const c of corrupted) {
    if (!c.source_url) { console.log(`  ⏭️  ${c.title} — no source`); failed++; continue; }
    try {
      process.stdout.write(`  🔄 ${c.title}...`);
      const newUrl = await downloadAndUpload(c.id, c.cover_url, c.key, c.source_url);
      if (newUrl !== c.cover_url) await sb.from('manga').update({ cover_url: newUrl }).eq('id', c.id);
      console.log(` ✅ ${newUrl.split('/').pop()}`);
      fixed++;
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.log(` ❌ ${e.message}`);
      failed++;
    }
  }

  console.log(`\n───────────────────────────────────────────────────`);
  console.log(`Done! Fixed: ${fixed}, Failed: ${failed}`);
}

main().catch(console.error);