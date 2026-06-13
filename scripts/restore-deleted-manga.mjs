#!/usr/bin/env node
/**
 * Restore & Re-scrape Soft-Deleted Manga
 * ──────────────────────────────────────────
 * Restores soft-deleted manga, fixes source_urls, and re-scrapes covers.
 *
 * Usage:
 *   node scripts/restore-deleted-manga.mjs --dry-run              # preview only
 *   node scripts/restore-deleted-manga.mjs --restore              # restore manga (set deleted_at = NULL)
 *   node scripts/restore-deleted-manga.mjs --restore --covers     # restore + scrape covers
 *   node scripts/restore-deleted-manga.mjs --restore --covers --source-url-only  # fix source_urls only
 *   node scripts/restore-deleted-manga.mjs --limit=100            # limit to 100 manga
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
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

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);

const DRY_RUN       = args['dry-run'] === true || args['dry-run'] === 'true';
const DO_RESTORE    = args['restore'] === true || args['restore'] === 'true';
const DO_COVERS     = args['covers'] === true || args['covers'] === 'true';
const SOURCE_URL_ONLY = args['source-url-only'] === true || args['source-url-only'] === 'true';
const LIMIT         = args['limit'] ? parseInt(args['limit']) : null;
const DELAY         = parseInt(args['delay'] ?? '1500');
const BASE_DOMAIN   = 'https://04x.manhwaland.land';

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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Scraper helpers ───────────────────────────────────────────────────────────
function isBlockedPage(html) {
  return html.length < 2000 || html.includes('Just a moment') || html.includes('cf_chl_opt')
    || html.includes('Enable JavaScript and cookies to continue');
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    .replace(/"/g, '"').replace(/&#39;|'/g, "'").replace(/&nbsp;/g, ' ');
}

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
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    if (response.statusCode !== 200) return null;
    if (isBlockedPage(response.body)) return null;
    return response.body;
  } catch { return null; }
}

function extractCoverFromHtml(html) {
  // Primary: wp-post-image
  const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i)
    ?? html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
  if (wpPostImg?.[1]) return wpPostImg[1];

  // Fallback: og:image
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImage?.[1]) return ogImage[1];

  // Fallback: twitter:image
  const twImage = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  if (twImage?.[1]) return twImage[1];

  return null;
}

async function downloadImage(url, gotScraping) {
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
  } catch { return null; }
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('🔄  Restore & Re-scrape Deleted Manga');
  console.log('══════════════════════════════════════');
  console.log(`   Mode         : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Restore      : ${DO_RESTORE ? 'YES' : 'NO'}`);
  console.log(`   Covers       : ${DO_COVERS ? 'YES' : 'NO'}`);
  console.log(`   Source URL   : ${SOURCE_URL_ONLY ? 'FIX ONLY' : 'NORMAL'}`);
  console.log(`   Domain       : ${BASE_DOMAIN}`);
  if (LIMIT) console.log(`   Limit        : ${LIMIT}`);
  console.log('');

  // ── Import got-scraping if needed (only for cover scraping) ────────────────
  let gotScraping = null;
  if (DO_COVERS) {
    try {
      const mod = await import('got-scraping');
      gotScraping = mod.gotScraping;
    } catch {
      console.error('❌ got-scraping tidak terinstall. Jalankan: npm install got-scraping --save-dev');
      process.exit(1);
    }
  }

  // ── Fetch all soft-deleted manga ───────────────────────────────────────────
  console.log('📥 Fetching soft-deleted manga...');
  const allManga = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('manga')
      .select('id, slug, title, source_url, cover_url, content_rating')
      .not('deleted_at', 'is', null)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) { console.error('❌ Query error:', error.message); break; }
    if (!data?.length) break;

    allManga.push(...data);
    console.log(`   Fetched ${allManga.length} manga...`);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`   Total: ${allManga.length} soft-deleted manga`);

  if (LIMIT) {
    console.log(`   Limited to: ${LIMIT}`);
    allManga.length = LIMIT;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    total: allManga.length,
    restored: 0,
    sourceUrlFixed: 0,
    coversScraped: 0,
    coversFailed: 0,
    skipped: 0,
  };

  // ── Process ────────────────────────────────────────────────────────────────
  console.log('');
  console.log('── Processing ────────────────────────────────────────────');
  console.log('');

  for (let i = 0; i < allManga.length; i++) {
    const manga = allManga[i];
    const progress = `[${i + 1}/${allManga.length}]`;
    const shortTitle = (manga.title || manga.slug || '').slice(0, 45);

    try {
      // ── Fix source_url if missing ──────────────────────────────────────────
      let sourceUrl = manga.source_url;
      let needsCoverScrape = DO_COVERS && (!manga.cover_url || manga.cover_url.includes('null'));

      if (!sourceUrl) {
        // Construct from slug
        sourceUrl = `${BASE_DOMAIN}/manga/${encodeURIComponent(manga.slug)}/`;

        if (!DRY_RUN && (DO_RESTORE || SOURCE_URL_ONLY)) {
          const { error: updateErr } = await supabase
            .from('manga')
            .update({ source_url: sourceUrl })
            .eq('id', manga.id);

          if (updateErr) {
            console.log(`${progress} ⚠️  ${shortTitle} — source_url update failed: ${updateErr.message}`);
          } else {
            stats.sourceUrlFixed++;
          }
        }
        needsCoverScrape = DO_COVERS; // No source = no cover either
      }

      // ── Scrape cover if needed ─────────────────────────────────────────────
      if (needsCoverScrape && gotScraping && sourceUrl) {
        if (i % 50 === 0 && i > 0) {
          console.log(`${progress} 📕 ${shortTitle}...`);
        }

        // Fetch manga page
        const html = await fetchPageHtml(sourceUrl, gotScraping);
        if (!html) {
          stats.coversFailed++;
          if (i < 20 || i % 100 === 0) console.log(`${progress} ⚠️  ${shortTitle} — page fetch failed`);
          await sleep(DELAY);
          continue;
        }

        const coverUrl = extractCoverFromHtml(html);
        if (!coverUrl) {
          stats.coversFailed++;
          continue;
        }

        if (!DRY_RUN) {
          // Download and upload cover to R2
          const imgData = await downloadImage(coverUrl, gotScraping);
          if (imgData) {
            const ext = coverUrl.split('.').pop()?.split('?')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const safeExt = ext.length >= 2 && ext.length <= 5 ? ext : 'jpg';
            const key = `covers/${manga.id}.${safeExt}`;
            const r2Url = await uploadToR2(imgData.buffer, key, imgData.contentType);

            await supabase
              .from('manga')
              .update({ cover_url: r2Url })
              .eq('id', manga.id);

            stats.coversScraped++;
          } else {
            stats.coversFailed++;
          }
        } else {
          stats.coversScraped++;
        }
      }

      // ── Restore (set deleted_at = NULL) ────────────────────────────────────
      if (DO_RESTORE && !SOURCE_URL_ONLY) {
        if (!DRY_RUN) {
          const { error: restoreErr } = await supabase
            .from('manga')
            .update({ deleted_at: null })
            .eq('id', manga.id);

          if (restoreErr) {
            console.log(`${progress} ⚠️  ${shortTitle} — restore failed: ${restoreErr.message}`);
          } else {
            stats.restored++;
          }
        } else {
          stats.restored++;
        }
      }

      // Progress output every 100 or for first 10
      if (i < 10 || (i + 1) % 100 === 0) {
        console.log(`${progress} ✅ ${shortTitle} | src:${sourceUrl ? 'Y' : 'N'} | cover:${manga.cover_url ? 'Y' : needsCoverScrape ? 'scraped' : 'N'}`);
      }

      await sleep(DELAY);

    } catch (err) {
      stats.skipped++;
      console.error(`${progress} ❌ ${shortTitle} — ${err.message}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('');
  console.log('══════════════════════════════════════');
  console.log('📊  RESTORE SUMMARY');
  console.log('══════════════════════════════════════');
  console.log(`   Total processed : ${stats.total}`);
  console.log(`   Manga restored  : ${stats.restored}`);
  console.log(`   Source URL fix  : ${stats.sourceUrlFixed}`);
  console.log(`   Covers scraped  : ${stats.coversScraped}`);
  console.log(`   Covers failed   : ${stats.coversFailed}`);
  console.log(`   Skipped/errors  : ${stats.skipped}`);
  if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — nothing was actually changed.');
  console.log('');

  if (!DRY_RUN && DO_RESTORE && !SOURCE_URL_ONLY) {
    console.log('💡 Next step: Run chapter download:');
    console.log('   node scripts/download-chapters.mjs --resume --concurrency=2');
    console.log('');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});