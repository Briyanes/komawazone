#!/usr/bin/env node
/**
 * Local R2 Migration Script
 * ─────────────────────────
 * Menggunakan TLS fingerprint browser (via got-scraping) untuk bypass Cloudflare
 * bot protection pada CDN seperti gmbr.pro, uwakjawa.xyz, dll.
 *
 * Usage:
 *   node scripts/migrate-images-to-r2.mjs                        # migrate semua covers
 *   node scripts/migrate-images-to-r2.mjs --type=chapters        # migrate chapter images
 *   node scripts/migrate-images-to-r2.mjs --type=covers-null     # re-scrape covers yang null dari source_url
 *   node scripts/migrate-images-to-r2.mjs --limit=100            # hanya 100 item
 *   node scripts/migrate-images-to-r2.mjs --dry-run              # test tanpa upload
 *   node scripts/migrate-images-to-r2.mjs --concurrency=3        # 3 request parallel
 *   node scripts/migrate-images-to-r2.mjs --resume               # lanjutkan dari progress terakhir
 *   node scripts/migrate-images-to-r2.mjs --cleanup-dead         # null-kan URL dari CDN mati
 *   node scripts/migrate-images-to-r2.mjs --cleanup-dead --dry-run  # preview tanpa update
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Progress & Failure files ──────────────────────────────────────────────────
const PROGRESS_FILE = path.join(__dirname, '.r2-migrate-progress.json');
const FAILURES_FILE = path.join(__dirname, 'failed-covers.jsonl');

function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { lastProcessedId: null, type: null, migrated: 0, failed: 0, processed: 0 };
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
const TYPE        = args['type'] ?? 'covers';          // covers | covers-null | chapters | all
const DRY_RUN     = args['dry-run'] === true || args['dry-run'] === 'true';
const RESUME      = args['resume'] === true || args['resume'] === 'true';
const LIMIT       = args['limit'] ? parseInt(args['limit']) : null;
const CONCURRENCY = Math.min(parseInt(args['concurrency'] ?? '3'), 10);
const BATCH_SIZE  = 30;
const CLEANUP_DEAD = args['cleanup-dead'] === true || args['cleanup-dead'] === 'true';

if (!CLEANUP_DEAD && !['covers', 'covers-null', 'covers-from-chapters', 'chapters', 'all'].includes(TYPE)) {
  console.error('❌ --type must be: covers, covers-null, covers-from-chapters, chapters, or all');
  process.exit(1);
}

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

// ── Image download with browser TLS fingerprint ───────────────────────────────
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

// CDN yang sudah pasti mati — skip langsung tanpa menunggu timeout 25 detik
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
    const host = new URL(url).hostname;
    return DEAD_CDN_HOSTS.has(host);
  } catch { return true; }
}

function isR2Url(url) {
  if (!url) return false;
  if (R2_BASE && url.startsWith(R2_BASE)) return true;
  return url.includes('.r2.cloudflarestorage.com');
}

async function downloadImage(url, gotScraping) {
  // Fast-skip CDN yang sudah pasti mati — hemat waktu
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

// ── Scrape manga cover from source URL ─────────────────────────────────────────
async function scrapeCoverFromSource(sourceUrl, gotScraping) {
  try {
    const response = await gotScraping({
      url: sourceUrl,
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
    const html = response.body;

    // Check for Cloudflare block page
    if (html.length < 2000 || html.includes('Just a moment') || html.includes('cf_chl_opt')) {
      return null;
    }

    // Try wp-post-image first (manhwaland / Madara theme)
    const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i)
      ?? html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
    if (wpPostImg?.[1]) return wpPostImg[1];

    // Try og:image meta tag
    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
      ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    if (ogImage?.[1]) return ogImage[1];

    // Try twitter:image
    const twImage = html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)
      ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+name="twitter:image"/i);
    if (twImage?.[1]) return twImage[1];

    return null;
  } catch {
    return null;
  }
}

// ── Build base query for counting non-R2 items ────────────────────────────────
function buildBaseQuery(table, urlField) {
  const r2Base = R2_BASE.replace('https://', '');
  return supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .not(urlField, 'is', null)
    .not(urlField, 'ilike', '%r2.cloudflarestorage.com%')
    .not(urlField, 'ilike', `%${r2Base || 'r2.dev'}%`);
}

// ── Concurrency helper ─────────────────────────────────────────────────────────
async function processWithConcurrency(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fn));
    results.push(...settled.map(r => r.status === 'fulfilled' ? r.value : null));
    // Delay antar batch — penting agar tidak kena rate-limit Cloudflare
    if (i + concurrency < items.length) await new Promise(r => setTimeout(r, 800));
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('🚀  Manga → Cloudflare R2 Migration');
  console.log('══════════════════════════════════════');
  console.log(`   Type        : ${TYPE}`);
  console.log(`   Concurrency : ${CONCURRENCY}`);
  console.log(`   Dry run     : ${DRY_RUN}`);
  console.log(`   Resume      : ${RESUME}`);
  if (LIMIT) console.log(`   Limit       : ${LIMIT}`);
  console.log('');

  const r2Base = R2_BASE.replace('https://', '');

  // Load resume progress
  let progress = loadProgress();
  if (RESUME && progress.type === TYPE && progress.lastProcessedId) {
    console.log(`📂 Resume dari ID terakhir: ${progress.lastProcessedId}`);
    console.log(`   Sudah diproses: ${progress.processed}, Berhasil: ${progress.migrated}, Gagal: ${progress.failed}`);
    console.log('');
  } else {
    progress = { lastProcessedId: null, type: TYPE, migrated: 0, failed: 0, processed: 0 };
  }

  // ── Cleanup dead CDN URLs ─────────────────────────────────────────────────
  if (CLEANUP_DEAD) {
    console.log('🧹  Cleanup URL dari CDN mati...');
    console.log(`   Hosts: ${[...DEAD_CDN_HOSTS].join(', ')}`);
    console.log('');

    const deadPatterns = [...DEAD_CDN_HOSTS];

    async function cleanupTable(table, urlField, label, mode = 'null') {
      let totalCleaned = 0;
      let offset = 0;
      const PAGE = 1000;

      while (true) {
        let query = supabase
          .from(table)
          .select(`id, ${urlField}`)
          .range(offset, offset + PAGE - 1);

        const orFilter = deadPatterns.map(h => `${urlField}.ilike.%${h}%`).join(',');
        query = query.or(orFilter);

        const { data: rows, error } = await query;
        if (error) { console.error(`❌ Query ${table} error:`, error.message); break; }
        if (!rows?.length) break;

        console.log(`   ${label}: ditemukan ${rows.length} baris di batch ini...`);

        if (!DRY_RUN) {
          const ids = rows.map(r => r.id);
          let actionErr;
          // Process in chunks of 100 to avoid Supabase URL length limit
          const CHUNK = 100;
          for (let ci = 0; ci < ids.length; ci += CHUNK) {
            const chunk = ids.slice(ci, ci + CHUNK);
            if (mode === 'delete') {
              ({ error: actionErr } = await supabase.from(table).delete().in('id', chunk));
            } else {
              ({ error: actionErr } = await supabase.from(table).update({ [urlField]: null }).in('id', chunk));
            }
            if (actionErr) break;
            totalCleaned += chunk.length;
          }
          if (actionErr) {
            console.error(`❌ ${mode === 'delete' ? 'Delete' : 'Update'} ${table} gagal:`, actionErr.message);
          }
        } else {
          rows.slice(0, 5).forEach(r => console.log(`   🔍 [DRY] ${r.id}: ${String(r[urlField]).slice(0, 70)}`));
          if (rows.length > 5) console.log(`   🔍 [DRY] ...dan ${rows.length - 5} lainnya`);
          totalCleaned += rows.length;
        }

        if (rows.length < PAGE) break;
        offset += PAGE;
      }

      const verb = mode === 'delete' ? (DRY_RUN ? 'akan dihapus' : 'dihapus') : (DRY_RUN ? 'akan di-null-kan' : 'di-null-kan');
      console.log(`✅  ${label}: ${totalCleaned} records ${verb}`);
    }

    await cleanupTable('manga', 'cover_url', 'manga.cover_url', 'null');
    await cleanupTable('chapter_images', 'image_url', 'chapter_images.image_url', 'delete');

    console.log('');
    if (DRY_RUN) console.log('⚠️  Dry run — tidak ada yang benar-benar diubah.');
    console.log('🎉  Cleanup selesai.');
    console.log('');
    return;
  }

  // ── Import got-scraping ────────────────────────────────────────────────────
  let gotScraping;
  try {
    const mod = await import('got-scraping');
    gotScraping = mod.gotScraping;
  } catch {
    console.error('❌ got-scraping tidak terinstall. Jalankan: npm install got-scraping --save-dev');
    process.exit(1);
  }

  // ── Phase: covers-null — Re-scrape covers yang null dari source_url ──────
  if (TYPE === 'covers-null') {
    console.log('🔄  Re-scrape covers yang NULL dari source_url...');
    console.log('');

    // Count manga with null cover but having source_url
    const { count: nullCount, error: countErr } = await supabase
      .from('manga')
      .select('id', { count: 'exact', head: true })
      .is('cover_url', null)
      .not('source_url', 'is', null)
      .is('deleted_at', null);

    if (countErr) {
      console.error('❌ Gagal menghitung manga null:', countErr.message);
      process.exit(1);
    }

    console.log(`📊 Manga tanpa cover (dengan source_url): ${nullCount ?? '?'}`);
    console.log('');

    const toProcess = LIMIT ?? nullCount ?? 0;
    let processed = 0;

    while (processed < toProcess) {
      const batchLimit = Math.min(BATCH_SIZE, toProcess - processed);

      let query = supabase
        .from('manga')
        .select('id, source_url, title, slug')
        .is('cover_url', null)
        .not('source_url', 'is', null)
        .is('deleted_at', null)
        .order('id')
        .limit(batchLimit);

      // Resume: skip already processed
      if (RESUME && progress.lastProcessedId) {
        query = query.gt('id', progress.lastProcessedId);
      }

      const { data: rows, error } = await query;

      if (error || !rows?.length) {
        if (error) console.error('❌ Query error:', error.message);
        break;
      }

      await processWithConcurrency(rows, async (row) => {
        processed++;
        progress.processed++;
        const progressLabel = `[${processed}/${toProcess}]`;

        // Step 1: Scrape cover URL from source page
        const coverUrl = await scrapeCoverFromSource(row.source_url, gotScraping);
        if (!coverUrl) {
          progress.failed++;
          console.log(`${progressLabel} ❌ Gagal scrape cover: ${(row.title || row.id).slice(0, 45)}`);
          console.log(`          Source: ${row.source_url.slice(0, 70)}`);
          logFailure({ id: row.id, title: row.title, source_url: row.source_url, phase: 'scrape_cover', error: 'No cover URL found' });
          return;
        }

        // Step 2: Skip dead CDN
        if (isDeadCdn(coverUrl)) {
          progress.failed++;
          console.log(`${progressLabel} ⚠️  Cover dari CDN mati: ${(row.title || row.id).slice(0, 40)}`);
          logFailure({ id: row.id, title: row.title, source_url: row.source_url, cover_url: coverUrl, phase: 'dead_cdn', error: 'Cover URL is on dead CDN' });
          return;
        }

        // Step 3: Download image
        const imageData = await downloadImage(coverUrl, gotScraping);
        if (!imageData) {
          progress.failed++;
          console.log(`${progressLabel} ❌ Gagal download: ${(row.title || row.id).slice(0, 45)}`);
          console.log(`          Cover: ${coverUrl.slice(0, 70)}`);
          logFailure({ id: row.id, title: row.title, source_url: row.source_url, cover_url: coverUrl, phase: 'download', error: 'Download failed' });
          return;
        }

        // Step 4: Upload to R2 & update DB
        const ext = getExtension(coverUrl, imageData.contentType);
        const key = `covers/${row.id}.${ext}`;

        if (!DRY_RUN) {
          try {
            const r2Url = await uploadToR2(imageData.buffer, key, imageData.contentType);
            await supabase.from('manga').update({ cover_url: r2Url }).eq('id', row.id);
            progress.migrated++;
            const size = (imageData.buffer.length / 1024).toFixed(0);
            console.log(`${progressLabel} ✅ ${(row.title || row.id).slice(0, 40)} (${size}KB)`);
          } catch (err) {
            progress.failed++;
            console.log(`${progressLabel} ❌ Upload gagal: ${err.message}`);
            logFailure({ id: row.id, title: row.title, source_url: row.source_url, cover_url: coverUrl, phase: 'upload', error: err.message });
          }
        } else {
          progress.migrated++;
          const size = (imageData.buffer.length / 1024).toFixed(0);
          console.log(`${progressLabel} 🔍 DRY: ${(row.title || row.id).slice(0, 40)} (${size}KB)`);
        }
      }, CONCURRENCY);

      // Save progress after each batch
      const lastRow = rows[rows.length - 1];
      progress.lastProcessedId = lastRow?.id;
      saveProgress(progress);

      if (rows.length < batchLimit) break;
    }

    console.log('');
    console.log('══════════════════════════════════════');
    console.log(`✅  Berhasil   : ${progress.migrated}`);
    console.log(`❌  Gagal      : ${progress.failed}`);
    console.log(`📦  Total      : ${progress.processed}`);
    if (DRY_RUN) console.log('\n⚠️  Dry run — tidak ada yang benar-benar diupload.');
    if (progress.failed > 0) {
      console.log(`\n💡  Detail kegagalan disimpan di: ${FAILURES_FILE}`);
    }
    console.log('');
    return;
  }

  // ── Phase: covers-from-chapters — Ambil cover dari chapter images ────────
  if (TYPE === 'covers-from-chapters') {
    console.log('🖼️  Ambil cover dari chapter images (page 2)...');
    console.log('');

    // Count manga with null cover but having chapters with images
    const { count: nullCount, error: countErr } = await supabase
      .from('manga')
      .select('id', { count: 'exact', head: true })
      .is('cover_url', null)
      .is('deleted_at', null);

    if (countErr) {
      console.error('❌ Gagal menghitung manga null:', countErr.message);
      process.exit(1);
    }

    console.log(`📊 Manga tanpa cover: ${nullCount ?? '?'}`);
    console.log('');

    const toProcess = LIMIT ?? nullCount ?? 0;
    let processed = 0;

    while (processed < toProcess) {
      const batchLimit = Math.min(BATCH_SIZE, toProcess - processed);

      let query = supabase
        .from('manga')
        .select('id, title, slug')
        .is('cover_url', null)
        .is('deleted_at', null)
        .order('id')
        .limit(batchLimit);

      if (RESUME && progress.lastProcessedId) {
        query = query.gt('id', progress.lastProcessedId);
      }

      const { data: mangaRows, error } = await query;
      if (error || !mangaRows?.length) {
        if (error) console.error('❌ Query error:', error.message);
        break;
      }

      for (const manga of mangaRows) {
        processed++;
        progress.processed++;
        const progressLabel = `[${processed}/${toProcess}]`;

        // Find first chapter with images
        const { data: chapters } = await supabase
          .from('chapters')
          .select('id, number')
          .eq('manga_id', manga.id)
          .is('deleted_at', null)
          .order('number')
          .limit(1);

        if (!chapters?.length) {
          progress.failed++;
          console.log(`${progressLabel} ⏭️  No chapters: ${(manga.title || manga.id).slice(0, 40)}`);
          progress.lastProcessedId = manga.id;
          saveProgress(progress);
          continue;
        }

        // Get chapter images — prefer page 2, fallback page 1
        const { data: images } = await supabase
          .from('chapter_images')
          .select('image_url, number')
          .eq('chapter_id', chapters[0].id)
          .order('number')
          .limit(3);

        if (!images?.length) {
          progress.failed++;
          console.log(`${progressLabel} ⏭️  No images: ${(manga.title || manga.id).slice(0, 40)}`);
          progress.lastProcessedId = manga.id;
          saveProgress(progress);
          continue;
        }

        // Pick page 2 if available, else page 1
        const coverSource = images.find(img => img.number === 2) ?? images[0];
        const sourceUrl = coverSource.image_url;

        // Skip if already R2 URL (shouldn't be null cover if R2 image exists, but just in case)
        if (isR2Url(sourceUrl)) {
          // Directly use as cover
          if (!DRY_RUN) {
            await supabase.from('manga').update({ cover_url: sourceUrl }).eq('id', manga.id);
          }
          progress.migrated++;
          console.log(`${progressLabel} ✅ (direct) ${(manga.title || manga.id).slice(0, 40)}`);
          progress.lastProcessedId = manga.id;
          saveProgress(progress);
          continue;
        }

        // Skip dead CDN
        if (isDeadCdn(sourceUrl)) {
          progress.failed++;
          console.log(`${progressLabel} ⚠️  Dead CDN: ${(manga.title || manga.id).slice(0, 40)}`);
          progress.lastProcessedId = manga.id;
          saveProgress(progress);
          continue;
        }

        // Download image
        const imageData = await downloadImage(sourceUrl, gotScraping);
        if (!imageData) {
          progress.failed++;
          console.log(`${progressLabel} ❌ Download failed: ${(manga.title || manga.id).slice(0, 40)}`);
          progress.lastProcessedId = manga.id;
          saveProgress(progress);
          continue;
        }

        // Upload to R2
        const ext = getExtension(sourceUrl, imageData.contentType);
        const key = `covers/${manga.id}.${ext}`;

        if (!DRY_RUN) {
          try {
            const r2Url = await uploadToR2(imageData.buffer, key, imageData.contentType);
            await supabase.from('manga').update({ cover_url: r2Url }).eq('id', manga.id);
            progress.migrated++;
            const size = (imageData.buffer.length / 1024).toFixed(0);
            console.log(`${progressLabel} ✅ ${(manga.title || manga.id).slice(0, 40)} (${size}KB from ch.${chapters[0].number} p.${coverSource.number})`);
          } catch (err) {
            progress.failed++;
            console.log(`${progressLabel} ❌ Upload gagal: ${err.message}`);
          }
        } else {
          progress.migrated++;
          console.log(`${progressLabel} 🔍 DRY: ${(manga.title || manga.id).slice(0, 40)} (ch.${chapters[0].number} p.${coverSource.number})`);
        }

        progress.lastProcessedId = manga.id;
        saveProgress(progress);
      }

      if (mangaRows.length < batchLimit) break;
    }

    console.log('');
    console.log('══════════════════════════════════════');
    console.log(`✅  Berhasil   : ${progress.migrated}`);
    console.log(`❌  Gagal      : ${progress.failed}`);
    console.log(`📦  Total      : ${progress.processed}`);
    if (DRY_RUN) console.log('\n⚠️  Dry run — tidak ada yang benar-benar diupload.');
    console.log('');
    return;
  }

  // ── Counts for covers & chapters ──────────────────────────────────────────
  const promises = [];
  if (TYPE === 'covers' || TYPE === 'all') {
    promises.push(buildBaseQuery('manga', 'cover_url').is('deleted_at', null));
  }
  if (TYPE === 'chapters' || TYPE === 'all') {
    promises.push(buildBaseQuery('chapter_images', 'image_url'));
  }
  const counts = await Promise.all(promises);

  if (TYPE === 'covers' || TYPE === 'all') {
    console.log(`📊 Cover belum di-R2  : ${counts[0].count ?? '?'}`);
  }
  if (TYPE === 'chapters' || TYPE === 'all') {
    const idx = TYPE === 'all' ? 1 : 0;
    console.log(`📊 Chapter image non-R2: ${counts[idx].count ?? '?'}`);
  }
  console.log('');

  let totalMigrated = progress.migrated;
  let totalFailed = progress.failed;
  let totalProcessed = progress.processed;

  // ── Process covers ────────────────────────────────────────────────────────
  if (TYPE === 'covers' || TYPE === 'all') {
    console.log('▶  Migrasi Covers...');
    const toProcess = LIMIT ?? (counts[0].count ?? 0);

    while (totalProcessed < toProcess) {
      const batchLimit = Math.min(BATCH_SIZE, toProcess - totalProcessed);

      let query = supabase
        .from('manga')
        .select('id, cover_url, title')
        .not('cover_url', 'is', null)
        .is('deleted_at', null)
        .not('cover_url', 'ilike', '%r2.cloudflarestorage.com%')
        .not('cover_url', 'ilike', `%${r2Base || 'r2.dev'}%`)
        .order('id')
        .limit(batchLimit);

      // Resume: skip already processed
      if (RESUME && progress.lastProcessedId) {
        query = query.gt('id', progress.lastProcessedId);
      }

      const { data: rows, error } = await query;

      if (error || !rows?.length) break;

      await processWithConcurrency(rows, async (row) => {
        totalProcessed++;
        const progressLabel = `[${totalProcessed}/${toProcess}]`;
        const imageData = await downloadImage(row.cover_url, gotScraping);

        if (!imageData) {
          totalFailed++;
          console.log(`${progressLabel} ❌ ${(row.title || row.id).slice(0, 45)}`);
          console.log(`          URL: ${row.cover_url.slice(0, 70)}`);
          logFailure({ id: row.id, title: row.title, cover_url: row.cover_url, phase: 'download', error: 'Download failed' });
          return;
        }

        const ext = getExtension(row.cover_url, imageData.contentType);
        const key = `covers/${row.id}.${ext}`;

        if (!DRY_RUN) {
          try {
            const r2Url = await uploadToR2(imageData.buffer, key, imageData.contentType);
            await supabase.from('manga').update({ cover_url: r2Url }).eq('id', row.id);
            totalMigrated++;
            const size = (imageData.buffer.length / 1024).toFixed(0);
            console.log(`${progressLabel} ✅ ${(row.title || row.id).slice(0, 40)} (${size}KB)`);
          } catch (err) {
            totalFailed++;
            console.log(`${progressLabel} ❌ Upload gagal: ${err.message}`);
            logFailure({ id: row.id, title: row.title, cover_url: row.cover_url, phase: 'upload', error: err.message });
          }
        } else {
          totalMigrated++;
          const size = (imageData.buffer.length / 1024).toFixed(0);
          console.log(`${progressLabel} 🔍 DRY: ${(row.title || row.id).slice(0, 40)} (${size}KB)`);
        }
      }, CONCURRENCY);

      // Save progress after each batch
      const lastRow = rows[rows.length - 1];
      progress.lastProcessedId = lastRow?.id;
      progress.migrated = totalMigrated;
      progress.failed = totalFailed;
      progress.processed = totalProcessed;
      saveProgress(progress);

      if (rows.length < batchLimit) break;
    }
    console.log('');
  }

  // ── Process chapters ──────────────────────────────────────────────────────
  if (TYPE === 'chapters' || TYPE === 'all') {
    console.log('▶  Migrasi Chapter Images...');
    const idx = TYPE === 'all' ? 1 : 0;
    const toProcess = (TYPE === 'all' ? null : LIMIT) ?? (counts[idx].count ?? 0);
    let chapterProcessed = 0;

    while (chapterProcessed < toProcess) {
      const batchLimit = Math.min(BATCH_SIZE, toProcess - chapterProcessed);

      const { data: rows, error } = await supabase
        .from('chapter_images')
        .select('id, image_url, chapter_id')
        .not('image_url', 'is', null)
        .not('image_url', 'ilike', '%r2.cloudflarestorage.com%')
        .not('image_url', 'ilike', `%${r2Base || 'r2.dev'}%`)
        .order('id')
        .limit(batchLimit);

      if (error || !rows?.length) break;

      await processWithConcurrency(rows, async (row) => {
        chapterProcessed++;
        totalProcessed++;
        const imageData = await downloadImage(row.image_url, gotScraping);

        if (!imageData) {
          totalFailed++;
          logFailure({ id: row.id, chapter_id: row.chapter_id, image_url: row.image_url, phase: 'download', error: 'Download failed' });
          return;
        }

        const ext = getExtension(row.image_url, imageData.contentType);
        const key = `chapters/${row.chapter_id}/${row.id}.${ext}`;

        if (!DRY_RUN) {
          try {
            const r2Url = await uploadToR2(imageData.buffer, key, imageData.contentType);
            await supabase.from('chapter_images').update({ image_url: r2Url }).eq('id', row.id);
            totalMigrated++;
            if (totalMigrated % 50 === 0) {
              console.log(`[${chapterProcessed}] ✅ ${totalMigrated} chapter images migrated so far...`);
            }
          } catch (err) {
            totalFailed++;
            logFailure({ id: row.id, chapter_id: row.chapter_id, image_url: row.image_url, phase: 'upload', error: err.message });
          }
        } else {
          totalMigrated++;
        }
      }, CONCURRENCY);

      // Save progress
      const lastRow = rows[rows.length - 1];
      progress.lastProcessedId = lastRow?.id;
      progress.migrated = totalMigrated;
      progress.failed = totalFailed;
      progress.processed = totalProcessed;
      saveProgress(progress);

      if (rows.length < batchLimit) break;
    }
    console.log('');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════');
  console.log(`✅  Berhasil   : ${totalMigrated}`);
  console.log(`❌  Gagal      : ${totalFailed}`);
  console.log(`📦  Total      : ${totalProcessed}`);
  if (DRY_RUN) console.log('\n⚠️  Dry run — tidak ada yang benar-benar diupload.');
  if (totalFailed > 0) {
    console.log(`\n💡  Detail kegagalan disimpan di: ${FAILURES_FILE}`);
    console.log('    Item yang gagal akan diambil lagi saat script dijalankan ulang.');
    console.log('    Kemungkinan CDN masih blokir — coba ulang beberapa saat lagi.');
  }
  console.log('');

  // Cleanup progress file on successful completion
  if (!DRY_RUN && totalFailed === 0 && existsSync(PROGRESS_FILE)) {
    console.log('🧹 Progress file dibersihkan (semua berhasil).');
    try { const { unlinkSync } = await import('fs'); unlinkSync(PROGRESS_FILE); } catch {}
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});