#!/usr/bin/env node
/**
 * COMPREHENSIVE thumbnail fixer + verifier.
 *
 * Fixes ALL categories of thumbnail problems in ONE step:
 *   1. thumbnail_url is NULL or doesn't exist
 *   2. thumbnail_url doesn't match the 5th image (index 4) of chapter_images
 *   3. thumbnail_url OR chapter_images contain EXTERNAL (non-R2) URLs that
 *      may be broken/hotlink-blocked — re-downloads them to R2 inline
 *   4. CORRUPTED R2 URLs (from previous runs with broken .env) — auto-repaired
 *
 * For each chapter:
 *   - If chapter_images are external URLs: download to R2, update both
 *     chapter_images AND thumbnail_url to use R2 URLs
 *   - If chapter_images exist: thumbnail = images[4] (or images[0] if <5)
 *   - If chapter_images don't exist: try to scrape them (skip if no source URL)
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-all-thumbnails.mjs
 *   node --env-file=.env.local scripts/fix-all-thumbnails.mjs --manga=SLUG
 *   node --env-file=.env.local scripts/fix-all-thumbnails.mjs --dry-run
 *   node --env-file=.env.local scripts/fix-all-thumbnails.mjs --limit=100
 *   node --env-file=.env.local scripts/fix-all-thumbnails.mjs --skip-migration   # only fix indexes, don't download
 */
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!sbUrl || !sbKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey);

// ── R2 config ──────────────────────────────────────────────────────────────────
const R2_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

let s3 = null;
if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

function buildR2Url(key) {
  if (R2_BASE) return `${R2_BASE}/${key}`;
  return `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}

// ── Validate R2_BASE for corruption (e.g. missing newline in .env) ─────────────
if (R2_BASE && (R2_BASE.includes('NEXT_PUBLIC') || R2_BASE.includes('R2_PUBLIC_BASE_URL=') || R2_BASE.includes('$'))) {
  console.error('❌ FATAL: R2_PUBLIC_BASE_URL is corrupted!');
  console.error(`   Value contains env var name or $: ${R2_BASE.slice(0, 80)}...`);
  console.error('   Check .env.local for missing newlines between variables.');
  process.exit(1);
}

/**
 * Detect & repair corrupted R2 URLs (from previous runs with broken .env).
 * Corrupted URLs look like: https://pub-xxx.r2.devNEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev/chapters/...
 * We extract the R2 key (the part after the real domain) and rebuild a clean URL.
 */
function sanitizeCorruptedR2Url(url) {
  if (!url) return url;
  // Detect corruption: URL contains an embedded env var name
  if (!url.includes('NEXT_PUBLIC_') && !url.includes('R2_PUBLIC_BASE_URL=')) {
    return url; // Not corrupted
  }

  // Extract the R2 key by finding the LAST occurrence of a known path prefix
  const keyMatch = url.match(/\/(chapters|manga|covers)\/[^?\s]+$/);
  if (keyMatch) {
    const key = keyMatch[0].slice(1); // Remove leading /
    return buildR2Url(key);
  }

  return url; // Can't repair
}

// ── got-scraping for TLS fingerprint (bypass Cloudflare) ───────────────────────
let gotScraping = null;

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function getExtension(url, contentType) {
  const fromUrl = url.split('/').pop()?.split('?')[0]?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromUrl && fromUrl.length >= 2 && fromUrl.length <= 5) return fromUrl;
  return MIME_EXT[contentType] ?? 'jpg';
}

async function downloadImage(url) {
  try {
    if (!gotScraping) {
      const mod = await import('got-scraping');
      gotScraping = mod.gotScraping;
    }
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
        Referer: (() => { try { return new URL(url).origin + '/'; } catch { return undefined; } })(),
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
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

// ── Concurrency helper ─────────────────────────────────────────────────────────
async function processWithConcurrency(items, fn, concurrency = 3) {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(fn));
    if (i + concurrency < items.length) await new Promise(r => setTimeout(r, 500));
  }
}

// ── Parse CLI args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const mangaSlug = (args.find(a => a.startsWith('--manga=')) || '').split('=')[1] || null;
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const skipMigration = args.includes('--skip-migration');

const EXTERNAL_HOSTS = ['gmbr.pro', 'gmbar.xyz', 'manhwaland', 'kambingjantan.cc', 'shinigami.asia'];

function isR2Url(url) {
  if (!url) return false;
  if (url.includes('.r2.dev/') || url.includes('.r2.cloudflarestorage.com/')) return true;
  if (R2_BASE && url.startsWith(R2_BASE)) return true;
  if (url.startsWith('/api/r2/image/')) return true;
  return false;
}

function isExternalUrl(url) {
  if (!url) return false;
  return EXTERNAL_HOSTS.some(h => url.includes(h));
}

function isCorrupted(url) {
  return !!(url && (url.includes('NEXT_PUBLIC_') || url.includes('R2_PUBLIC_BASE_URL=')));
}

function getThumbIdx(count) {
  return count >= 5 ? 4 : 0;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  COMPREHENSIVE THUMBNAIL FIXER');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Manga filter:     ${mangaSlug || '(all)'}`);
  console.log(`  Dry run:          ${dryRun ? 'YES (no writes)' : 'NO (will update DB)'}`);
  console.log(`  Limit:            ${limit || '(none)'}`);
  console.log(`  R2 migration:     ${skipMigration ? 'SKIPPED (index-only fix)' : (s3 ? 'ENABLED' : '⚠️  R2 not configured')}`);
  console.log('');

  // Fetch with pagination (Supabase default limit is 1000)
  const selectCols = `
    id, number, manga_id, thumbnail_url,
    manga!inner(slug, title, source_url),
    chapter_images(id, image_url, number)
  `;

  const PAGE_SIZE = 1000;
  const chapters = [];
  let page = 0;

  console.log('📋 Fetching chapters...\n');

  while (true) {
    let pageQuery = sb
      .from('chapters')
      .select(selectCols)
      .is('deleted_at', null)
      .order('number', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (mangaSlug) {
      pageQuery = pageQuery.filter('manga.slug', 'eq', mangaSlug);
    }

    const { data: pageData, error } = await pageQuery;

    if (error) {
      console.error('❌ Error fetching chapters:', error.message);
      process.exit(1);
    }

    if (!pageData || pageData.length === 0) {
      break;
    }

    chapters.push(...pageData);
    process.stdout.write(`\r  Fetched ${chapters.length} chapters...`);

    if (limit && chapters.length >= limit) {
      chapters.length = limit;
      break;
    }

    if (pageData.length < PAGE_SIZE) break;

    page++;
  }

  console.log('');

  if (chapters.length === 0) {
    console.log('⚠️  No chapters found.');
    process.exit(0);
  }

  console.log(`\n📋 Found ${chapters.length} chapters to process\n`);

  const stats = {
    alreadyCorrect: 0,
    fixedNullThumb: 0,
    fixedWrongIndex: 0,
    migratedImages: 0,
    fixedExternalThumb: 0,
    noImages: 0,
    errors: 0,
    migrationFailed: 0,
    fixedCorruptedImg: 0,
    fixedCorruptedThumb: 0,
  };

  let processed = 0;

  for (const ch of chapters) {
    processed++;
    const mangaInfo = Array.isArray(ch.manga) ? ch.manga[0] : ch.manga;
    const mangaSlugVal = mangaInfo?.slug || '?';
    const imgs = (ch.chapter_images || [])
      .slice()
      .sort((a, b) => a.number - b.number);

    process.stdout.write(`\r[${processed}/${chapters.length}] Ch.${ch.number} (${mangaSlugVal.slice(0, 20)})...`);

    // ── CASE 1: No chapter_images at all ──
    if (imgs.length === 0) {
      stats.noImages++;
      continue;
    }

    // ── CASE 1.5: Repair CORRUPTED R2 URLs (from previous broken .env runs) ──
    const corruptedImgs = imgs.filter(img => isCorrupted(img.image_url));
    const corruptedThumb = isCorrupted(ch.thumbnail_url);

    if ((corruptedImgs.length > 0 || corruptedThumb) && !dryRun) {
      for (const img of corruptedImgs) {
        const cleanUrl = sanitizeCorruptedR2Url(img.image_url);
        if (cleanUrl !== img.image_url) {
          await sb.from('chapter_images').update({ image_url: cleanUrl }).eq('id', img.id);
          img.image_url = cleanUrl;
          stats.fixedCorruptedImg++;
        }
      }
      if (corruptedThumb) {
        const cleanThumb = sanitizeCorruptedR2Url(ch.thumbnail_url);
        if (cleanThumb !== ch.thumbnail_url) {
          await sb.from('chapters').update({ thumbnail_url: cleanThumb }).eq('id', ch.id);
          ch.thumbnail_url = cleanThumb;
          stats.fixedCorruptedThumb++;
        }
      }
      console.log(`\n  🔧 Repaired ${corruptedImgs.length} corrupted img URLs${corruptedThumb ? ' + thumb' : ''}`);
    }

    // ── CASE 2: Migrate external chapter_images to R2 ────────────────────────
    const externalImgs = imgs.filter(img => isExternalUrl(img.image_url) && !isR2Url(img.image_url));
    let imagesUpdated = false;

    if (externalImgs.length > 0 && !skipMigration && s3 && !dryRun) {
      // Download all external images, upload to R2, update DB
      await processWithConcurrency(externalImgs, async (img) => {
        const imageData = await downloadImage(img.image_url);
        if (!imageData) {
          stats.migrationFailed++;
          return;
        }
        const ext = getExtension(img.image_url, imageData.contentType);
        const key = `chapters/${ch.id}/${img.id}.${ext}`;
        try {
          const r2Url = await uploadToR2(imageData.buffer, key, imageData.contentType);
          await sb.from('chapter_images').update({ image_url: r2Url }).eq('id', img.id);
          img.image_url = r2Url; // Update in-memory so thumbnail calc uses R2 URL
          stats.migratedImages++;
          imagesUpdated = true;
        } catch {
          stats.migrationFailed++;
        }
      });

      if (imagesUpdated) {
        console.log(`\n  🔄 Migrated ${stats.migratedImages > 0 ? 'images' : ''} for ch.${ch.number}`);
      }
    } else if (externalImgs.length > 0 && (skipMigration || !s3)) {
      // Just flag — can't migrate
      console.log(`\n  ⚠️  ${externalImgs.length} external images (migration ${skipMigration ? 'skipped' : 'not configured'})`);
    }

    // Re-read updated images from DB if we migrated (to get the freshest data)
    let finalImgs = imgs;
    if (imagesUpdated) {
      const { data: refreshImgs } = await sb
        .from('chapter_images')
        .select('id, image_url, number')
        .eq('chapter_id', ch.id)
        .order('number', { ascending: true });
      if (refreshImgs && refreshImgs.length > 0) {
        finalImgs = refreshImgs;
      }
    }

    // ── CASE 3: Compute expected thumbnail from (now R2) images ─────────────
    const expectedIdx = getThumbIdx(finalImgs.length);
    const expectedThumb = finalImgs[expectedIdx].image_url;
    const currentThumb = ch.thumbnail_url;

    const thumbIsExternal = isExternalUrl(currentThumb) && !isR2Url(currentThumb);
    const thumbIsCorrupted = isCorrupted(currentThumb);
    const thumbIsNull = !currentThumb;
    const thumbIsWrong = !thumbIsNull && !thumbIsExternal && !thumbIsCorrupted && currentThumb !== expectedThumb;

    if (!thumbIsNull && !thumbIsWrong && !thumbIsExternal && !thumbIsCorrupted) {
      stats.alreadyCorrect++;
      continue;
    }

    // ── FIX: Update thumbnail_url to the correct 5th image ──────────────────
    if (dryRun) {
      if (thumbIsNull) {
        console.log(`\n  ⚠️  NULL thumb → ${expectedThumb.slice(0, 60)}...`);
      } else if (thumbIsExternal) {
        console.log(`\n  🌐 External thumb → ${expectedThumb.slice(0, 60)}...`);
      } else if (thumbIsCorrupted) {
        console.log(`\n  🔧 Corrupted thumb → ${expectedThumb.slice(0, 60)}...`);
      } else if (thumbIsWrong) {
        console.log(`\n  ❌ Wrong index → fix to ${expectedThumb.slice(0, 60)}...`);
      }
    } else {
      const { error: updateErr } = await sb
        .from('chapters')
        .update({ thumbnail_url: expectedThumb })
        .eq('id', ch.id);

      if (updateErr) {
        console.error(`\n  ❌ Update failed: ${updateErr.message}`);
        stats.errors++;
      } else {
        if (thumbIsNull) stats.fixedNullThumb++;
        else if (thumbIsExternal || thumbIsCorrupted) stats.fixedExternalThumb++;
        else if (thumbIsWrong) stats.fixedWrongIndex++;
      }
    }
  }

  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Total chapters checked:    ${chapters.length}`);
  console.log(`  ✓ Already correct:         ${stats.alreadyCorrect}`);
  console.log(`  ✓ Fixed (NULL thumb):      ${stats.fixedNullThumb}`);
  console.log(`  ✓ Fixed (wrong index):     ${stats.fixedWrongIndex}`);
  console.log(`  ✓ Fixed (external thumb):  ${stats.fixedExternalThumb}`);
  console.log(`  🔧 Fixed corrupted img:    ${stats.fixedCorruptedImg}`);
  console.log(`  🔧 Fixed corrupted thumb:  ${stats.fixedCorruptedThumb}`);
  console.log(`  🔄 Images migrated to R2:  ${stats.migratedImages}`);
  console.log(`  ⚠️  No images (skip):       ${stats.noImages}`);
  console.log(`  ⚠️  Migration failures:     ${stats.migrationFailed}`);
  console.log(`  ❌ Errors:                  ${stats.errors}`);

  if (stats.migrationFailed > 0) {
    console.log('\n⚠️  Some images failed to migrate (CDN may be blocking).');
    console.log('   Run again later or use migrate-images-to-r2.mjs --type=chapters.');
  }

  if (dryRun) {
    console.log('\n🔍 This was a DRY RUN. Remove --dry-run to apply fixes.');
  }

  console.log('');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});