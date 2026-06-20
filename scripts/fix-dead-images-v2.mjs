#!/usr/bin/env node
/**
 * fix-dead-images-v2.mjs
 *
 * Re-scrape and re-download chapter images that point to dead CDNs
 * (gmbr.pro, manhwaland.land, uwakjawa.xyz).
 *
 * Flow:
 *   1. Query chapters where ALL chapter_images point to dead CDN domains
 *   2. Re-scrape the chapter source URL to get fresh image URLs
 *   3. Download all images to R2
 *   4. Delete old dead chapter_images rows
 *   5. Insert new R2-backed rows
 *   6. Update chapter thumbnail_url to 5th page
 *
 * Usage:
 *   node scripts/fix-dead-images-v2.mjs [--dry-run] [--limit=N] [--manga=slug]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Config ───────────────────────────────────────────────────────────────

const DEAD_CDN_PATTERNS = ['gmbr.pro', 'manhwaland.land', 'uwakjawa.xyz'];

const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const LIMIT    = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const MANGA    = args.find(a => a.startsWith('--manga='))?.split('=')[1];
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? '3', 10);

// ─── Helpers ──────────────────────────────────────────────────────────────

function isDeadCdnUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return DEAD_CDN_PATTERNS.some(p => hostname === p || hostname.endsWith(`.${p}`));
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function buildHeaders(url) {
  let referer = 'https://04x.manhwaland.land/';
  try { referer = new URL(url).origin + '/'; } catch {}
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
    'Referer': referer,
  };
}

/** Parse chapter images from HTML (same logic as scraper-utils) */
function parseChapterImages(html) {
  const urls = [];
  const idx = html.indexOf('id="readerarea"');
  const section = idx !== -1 ? html.slice(idx, idx + 80000) : html;

  // noscript fallback
  const nsRe = /<noscript>([\s\S]*?)<\/noscript>/g;
  let m;
  while ((m = nsRe.exec(section)) !== null) {
    const sRe = /src=['"]([^'"]+)['"]/g;
    let s;
    while ((s = sRe.exec(m[1])) !== null) {
      if (/^https?:\/\//i.test(s[1])) urls.push(s[1]);
    }
  }

  // data-src fallback
  if (urls.length === 0) {
    const dsRe = /data-src=['"]([^'"]+)['"]/g;
    while ((m = dsRe.exec(section)) !== null) {
      if (/^https?:\/\//i.test(m[1])) urls.push(m[1]);
    }
  }

  // img src fallback
  if (urls.length === 0) {
    const isRe = /<img[^>]+src=['"]([^'"]+)['"]/g;
    while ((m = isRe.exec(section)) !== null) {
      if (/^https?:\/\//i.test(m[1]) && /chapter|manga|upload/i.test(m[1])) {
        urls.push(m[1]);
      }
    }
  }

  // upgrade gmbr.pro http → https
  return urls.map(u => {
    try {
      const p = new URL(u);
      if (p.protocol === 'http:' && p.hostname.includes('gmbr.pro')) {
        p.protocol = 'https:';
        return p.toString();
      }
      return u;
    } catch { return u; }
  });
}

/** Scrape chapter page and extract image URLs */
async function scrapeChapterImages(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (attempt > 1) {
      const backoff = Math.min(2000 * 2 ** (attempt - 2), 10000);
      await sleep(backoff + Math.random() * 1000);
    }

    try {
      const res = await fetch(url, {
        headers: buildHeaders(url),
        signal: AbortSignal.timeout(20000),
      });

      if (res.status === 429 || res.status === 503) {
        const ra = parseInt(res.headers.get('retry-after') ?? '5', 10);
        await sleep(ra * 1000);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();

      // Cloudflare block check
      if (html.length < 2000 || html.includes('cf-browser-verification')) {
        throw new Error('Blocked by CloudFlare');
      }

      return parseChapterImages(html);
    } catch (err) {
      if (attempt === retries) throw err;
    }
  }
  return [];
}

/** Download image and upload to R2 via admin API */
async function downloadAndUpload(imageUrl, chapterId, pageNum) {
  // Use R2 config directly
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket    = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_BASE_URL;

  if (!accountId || !accessKey || !secretKey || !bucket) {
    throw new Error('R2 config missing');
  }

  // Download
  const imgRes = await fetch(imageUrl, {
    headers: {
      'User-Agent': UA,
      'Accept': 'image/*,*/*;q=0.8',
      'Referer': new URL(imageUrl).origin + '/',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!imgRes.ok) throw new Error(`Download HTTP ${imgRes.status}`);

  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new Error(`Not image: ${contentType}`);

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  if (buffer.length === 0) throw new Error('Empty image');

  // Upload via S3 API
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  const ext = contentType.split('/')[1] ?? 'jpg';
  const key = `pages/${chapterId}/${Date.now()}-${pageNum}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const finalUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, '')}/${key}`
    : `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;

  return finalUrl;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function getChaptersWithDeadImages() {
  console.log('📋 Querying chapters with dead CDN images...');

  const allDead = [];
  const PAGE_SIZE = 500;
  let offset = 0;

  while (true) {
    let query = supabase
      .from('chapters')
      .select(`
        id, number, title, manga_id,
        manga!inner(slug, title, source_url),
        chapter_images(id, image_url, number)
      `)
      .is('deleted_at', null)
      .order('number', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (MANGA) {
      query = query.filter('manga.slug', 'eq', MANGA);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Query failed: ${error.message}`);

    const batch = (data ?? []).filter(ch => {
      const imgs = ch.chapter_images ?? [];
      if (imgs.length === 0) return false;
      return imgs.every(img => isDeadCdnUrl(img.image_url));
    });
    allDead.push(...batch);

    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    process.stdout.write(`\r  Scanned ${offset} chapters...`);
  }

  console.log(`\r  Scanned ${offset + (data?.length ?? 0)} chapters total.      `);

  if (LIMIT > 0) return allDead.slice(0, LIMIT);
  return allDead;
}

async function fixChapter(chapter) {
  const manga = chapter.manga;
  if (!manga?.slug) return { status: 'skip', reason: 'no manga slug' };

  const origin = manga.source_url
    ? new URL(manga.source_url).origin
    : 'https://04x.manhwaland.land';

  const paddedNum = String(Math.floor(chapter.number)).padStart(2, '0');
  const candidates = chapter.number % 1 !== 0
    ? [`${origin}/${manga.slug}-chapter-${chapter.number}/`]
    : chapter.number < 100
      ? [`${origin}/${manga.slug}-chapter-${chapter.number}/`, `${origin}/${manga.slug}-chapter-${paddedNum}/`]
      : [`${origin}/${manga.slug}-chapter-${chapter.number}/`];

  // Step 1: Scrape fresh image URLs
  let sourceUrls = [];
  let sourceUrl = '';
  for (const url of candidates) {
    try {
      sourceUrls = await scrapeChapterImages(url);
      if (sourceUrls.length > 0) { sourceUrl = url; break; }
    } catch (err) {
      // try next candidate
    }
  }

  if (sourceUrls.length === 0) {
    return { status: 'no_source', reason: `Could not scrape from ${candidates.join(', ')}` };
  }

  if (DRY_RUN) {
    console.log(`  [DRY] Ch.${chapter.number} (${manga.slug}): found ${sourceUrls.length} images from ${sourceUrl}`);
    return { status: 'dry_run', count: sourceUrls.length };
  }

  // Step 2: Download & upload each image to R2
  const r2Urls = [];
  let failures = 0;
  for (let i = 0; i < sourceUrls.length; i++) {
    try {
      const r2Url = await downloadAndUpload(sourceUrls[i], chapter.id, i + 1);
      r2Urls.push(r2Url);
    } catch (err) {
      console.warn(`    ⚠ Image ${i + 1} failed: ${err.message}`);
      r2Urls.push(sourceUrls[i]); // fallback to original
      failures++;
    }
    // Small delay to avoid overwhelming R2
    if (i > 0 && i % 10 === 0) await sleep(200);
  }

  // Step 3: Delete old dead chapter_images
  const { error: delErr } = await supabase
    .from('chapter_images')
    .delete()
    .eq('chapter_id', chapter.id);

  if (delErr) {
    return { status: 'error', reason: `Delete failed: ${delErr.message}` };
  }

  // Step 4: Insert new R2-backed images
  const rows = r2Urls.map((url, i) => ({
    chapter_id: chapter.id,
    image_url: url,
    number: i + 1,
  }));

  const { error: insErr } = await supabase
    .from('chapter_images')
    .insert(rows);

  if (insErr) {
    return { status: 'error', reason: `Insert failed: ${insErr.message}` };
  }

  // Step 5: Update thumbnail to 5th page
  const thumbUrl = r2Urls.length >= 5 ? r2Urls[4] : r2Urls[r2Urls.length - 1];
  await supabase
    .from('chapters')
    .update({ thumbnail_url: thumbUrl })
    .eq('id', chapter.id);

  return { status: 'fixed', count: r2Urls.length, failures };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  fix-dead-images-v2.mjs — Re-download Dead CDN Images');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update DB)'}`);
  if (MANGA)    console.log(`  Manga filter: ${MANGA}`);
  if (LIMIT)    console.log(`  Limit: ${LIMIT} chapters`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log('');

  const chapters = await getChaptersWithDeadImages();
  console.log(`📊 Found ${chapters.length} chapters with dead CDN images\n`);

  if (chapters.length === 0) {
    console.log('✅ Nothing to fix!');
    return;
  }

  // Process in batches
  let fixed = 0;
  let failed = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < chapters.length; i += CONCURRENCY) {
    const batch = chapters.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    const totalBatches = Math.ceil(chapters.length / CONCURRENCY);

    const results = await Promise.allSettled(batch.map(ch => fixChapter(ch)));

    for (let j = 0; j < results.length; j++) {
      const ch = batch[j];
      const res = results[j];
      const mangaSlug = ch.manga?.slug ?? 'unknown';

      if (res.status === 'fulfilled') {
        const v = res.value;
        if (v.status === 'fixed') {
          fixed++;
          console.log(`✅ [${i + j + 1}/${chapters.length}] ${mangaSlug} Ch.${ch.number}: ${v.count} images (${v.failures} failed)`);
        } else if (v.status === 'dry_run') {
          console.log(`🔹 [${i + j + 1}/${chapters.length}] ${mangaSlug} Ch.${ch.number}: ${v.count} images found (dry run)`);
        } else if (v.status === 'no_source') {
          skipped++;
          console.log(`⏭️  [${i + j + 1}/${chapters.length}] ${mangaSlug} Ch.${ch.number}: ${v.reason}`);
        } else {
          failed++;
          console.log(`❌ [${i + j + 1}/${chapters.length}] ${mangaSlug} Ch.${ch.number}: ${v.reason}`);
        }
      } else {
        failed++;
        console.log(`💥 [${i + j + 1}/${chapters.length}] ${mangaSlug} Ch.${ch.number}: ${res.reason?.message ?? res.reason}`);
      }
    }

    // Progress every 10 batches
    if (batchNum % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = ((i + batch.length) / (elapsed / 60)).toFixed(1);
      console.log(`\n⏱️  Batch ${batchNum}/${totalBatches} | ${elapsed}s elapsed | ${rate} chapters/min\n`);
    }

    // Rate limit between batches
    await sleep(500);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`✅ Done in ${elapsed}s`);
  console.log(`   Fixed:   ${fixed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed:  ${failed}`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});