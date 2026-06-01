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
 *   node scripts/migrate-images-to-r2.mjs --limit=100            # hanya 100 item
 *   node scripts/migrate-images-to-r2.mjs --dry-run              # test tanpa upload
 *   node scripts/migrate-images-to-r2.mjs --concurrency=3        # 3 request parallel
 *   node scripts/migrate-images-to-r2.mjs --cleanup-dead         # null-kan URL dari CDN mati
 *   node scripts/migrate-images-to-r2.mjs --cleanup-dead --dry-run  # preview tanpa update
 */

import { readFileSync } from 'fs';
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
const TYPE        = args['type'] ?? 'covers';          // covers | chapters | all
const DRY_RUN     = args['dry-run'] === true || args['dry-run'] === 'true';
const LIMIT       = args['limit'] ? parseInt(args['limit']) : null;
const CONCURRENCY = Math.min(parseInt(args['concurrency'] ?? '3'), 10);
const BATCH_SIZE  = 30;
const CLEANUP_DEAD = args['cleanup-dead'] === true || args['cleanup-dead'] === 'true';

if (!CLEANUP_DEAD && !['covers', 'chapters', 'all'].includes(TYPE)) {
  console.error('❌ --type must be: covers, chapters, or all');
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

async function downloadImage(url, gotScraping) {
  // Fast-skip CDN yang sudah pasti mati — hemat waktu
  try {
    const host = new URL(url).hostname;
    if (DEAD_CDN_HOSTS.has(host)) return null;
  } catch { return null; }

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
  if (LIMIT) console.log(`   Limit       : ${LIMIT}`);
  console.log('');

  const r2Base = R2_BASE.replace('https://', '');

  // ── Cleanup dead CDN URLs ─────────────────────────────────────────────────
  if (CLEANUP_DEAD) {
    console.log('🧹  Cleanup URL dari CDN mati...');
    console.log(`   Hosts: ${[...DEAD_CDN_HOSTS].join(', ')}`);
    console.log('');

    const deadPatterns = [...DEAD_CDN_HOSTS];

    // Build OR filter for each table
    async function cleanupTable(table, urlField, label) {
      let totalNulled = 0;
      let offset = 0;
      const PAGE = 1000;

      while (true) {
        // Fetch rows with dead CDN URLs — pick first matching host per row
        let query = supabase
          .from(table)
          .select(`id, ${urlField}`)
          .range(offset, offset + PAGE - 1);

        // Apply OR filters for all dead hosts
        const orFilter = deadPatterns.map(h => `${urlField}.ilike.%${h}%`).join(',');
        query = query.or(orFilter);

        const { data: rows, error } = await query;
        if (error) { console.error(`❌ Query ${table} error:`, error.message); break; }
        if (!rows?.length) break;

        console.log(`   ${label}: ditemukan ${rows.length} baris di batch ini...`);

        if (!DRY_RUN) {
          const ids = rows.map(r => r.id);
          const { error: updErr } = await supabase
            .from(table)
            .update({ [urlField]: null })
            .in('id', ids);
          if (updErr) {
            console.error(`❌ Update ${table} gagal:`, updErr.message);
          } else {
            totalNulled += rows.length;
          }
        } else {
          // Preview: show first 5 as sample
          rows.slice(0, 5).forEach(r => console.log(`   🔍 [DRY] ${r.id}: ${String(r[urlField]).slice(0, 70)}`));
          if (rows.length > 5) console.log(`   🔍 [DRY] ...dan ${rows.length - 5} lainnya`);
          totalNulled += rows.length;
        }

        if (rows.length < PAGE) break;
        offset += PAGE;
      }

      const action = DRY_RUN ? 'akan di-null-kan' : 'di-null-kan';
      console.log(`✅  ${label}: ${totalNulled} URL ${action}`);
    }

    await cleanupTable('manga', 'cover_url', 'manga.cover_url');
    await cleanupTable('chapter_images', 'image_url', 'chapter_images.image_url');

    console.log('');
    if (DRY_RUN) console.log('⚠️  Dry run — tidak ada yang benar-benar diubah.');
    console.log('🎉  Cleanup selesai.');
    console.log('');
    return;
  }

    return supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .not(urlField, 'is', null)
      .not(urlField, 'ilike', '%r2.cloudflarestorage.com%')
      .not(urlField, 'ilike', `%${r2Base || 'r2.dev'}%`);
  }

  // Counts
  let gotScraping;
  try {
    const mod = await import('got-scraping');
    gotScraping = mod.gotScraping;
  } catch {
    console.error('❌ got-scraping tidak terinstall. Jalankan: npm install got-scraping --save-dev');
    process.exit(1);
  }

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

  let totalMigrated = 0;
  let totalFailed = 0;
  let totalProcessed = 0;

  // ── Process covers ────────────────────────────────────────────────────────
  if (TYPE === 'covers' || TYPE === 'all') {
    console.log('▶  Migrasi Covers...');
    const toProcess = LIMIT ?? (counts[0].count ?? 0);

    while (totalProcessed < toProcess) {
      const batchLimit = Math.min(BATCH_SIZE, toProcess - totalProcessed);

      const { data: rows, error } = await supabase
        .from('manga')
        .select('id, cover_url, title')
        .not('cover_url', 'is', null)
        .is('deleted_at', null)
        .not('cover_url', 'ilike', '%r2.cloudflarestorage.com%')
        .not('cover_url', 'ilike', `%${r2Base || 'r2.dev'}%`)
        .order('id')
        .limit(batchLimit);

      if (error || !rows?.length) break;

      await processWithConcurrency(rows, async (row) => {
        totalProcessed++;
        const progress = `[${totalProcessed}/${toProcess}]`;
        const imageData = await downloadImage(row.cover_url, gotScraping);

        if (!imageData) {
          totalFailed++;
          console.log(`${progress} ❌ ${(row.title || row.id).slice(0, 45)}`);
          console.log(`          URL: ${row.cover_url.slice(0, 70)}`);
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
            console.log(`${progress} ✅ ${(row.title || row.id).slice(0, 40)} (${size}KB)`);
          } catch (err) {
            totalFailed++;
            console.log(`${progress} ❌ Upload gagal: ${err.message}`);
          }
        } else {
          totalMigrated++;
          const size = (imageData.buffer.length / 1024).toFixed(0);
          console.log(`${progress} 🔍 DRY: ${(row.title || row.id).slice(0, 40)} (${size}KB)`);
        }
      }, CONCURRENCY);

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
          } catch {
            totalFailed++;
          }
        } else {
          totalMigrated++;
        }
      }, CONCURRENCY);

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
    console.log('\n💡  Item yang gagal akan diambil lagi saat script dijalankan ulang.');
    console.log('    Kemungkinan CDN masih blokir — coba ulang beberapa saat lagi.');
  }
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
