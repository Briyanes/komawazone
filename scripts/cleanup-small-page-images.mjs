#!/usr/bin/env node
/**
 * Cleanup Small Page Images — deteksi & hapus gambar halaman terlalu kecil
 * (iklan/banner, mis. 400×25 "BANDAR36") yang lolos ke chapter_images + R2
 * sebelum filter dimensi dipasang di worker image-backfill.
 *
 * Kriteria: min(width, height) < MIN_SIDE (default 400px), dibaca dari byte
 * gambar asli (header JPEG/PNG/GIF/WebP/AVIF) — bukan dari URL/alt.
 *
 * Yang dilakukan per chapter terdampak (hanya dengan --apply):
 *   1. Hapus baris chapter_images yang ukurannya kecil
 *   2. Renumber halaman 1..N (banner sering nyempil di tengah urutan)
 *   3. Set ulang chapters.thumbnail_url (aturan: gambar ke-5 dari belakang,
 *      fallback gambar pertama — sama dengan migration 039)
 *   4. --delete-r2: hapus juga objek kecilnya dari bucket R2 (opsional)
 *
 * Scope: chapter dengan created_at >= SINCE (default 2026-10-01, saat pipeline
 * backfill worker aktif). Scan seluruh 40k+ chapter × download semua gambarnya
 * tidak praktis — perdalam dengan --since kalau perlu.
 *
 * Usage:
 *   node scripts/cleanup-small-page-images.mjs                    # DRY-RUN
 *   node scripts/cleanup-small-page-images.mjs --apply            # eksekusi DB
 *   node scripts/cleanup-small-page-images.mjs --apply --delete-r2
 *   node scripts/cleanup-small-page-images.mjs --chapter=<uuid>   # 1 chapter
 *   MIN_SIDE=500 node scripts/cleanup-small-page-images.mjs
 */

import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getImageDimensions } from './lib/image-dims.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env: process.env (CI) → fallback .env.local (laptop) ───────────────────
function loadEnv() {
  const envLocal = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(envLocal)) {
    for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
loadEnv();

const ENV = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_PUBLIC_BASE: (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
};
for (const [k, v] of Object.entries(ENV)) {
  if (!v) { console.error(`[cleanup] env ${k} wajib diisi`); process.exit(1); }
}

const APPLY = process.argv.includes('--apply');
const DELETE_R2 = process.argv.includes('--delete-r2');
const MIN_SIDE = Number(process.env.MIN_SIDE || 400);
const SINCE = (process.argv.find((a) => a.startsWith('--since=')) || `--since=2026-10-01`).split('=')[1];
const CHAPTER_ARG = (process.argv.find((a) => a.startsWith('--chapter=')) || '').split('=')[1];

if (!APPLY) console.log('[cleanup] DRY-RUN — tidak ada perubahan. Tambahkan --apply untuk eksekusi.\n');

// ── Supabase REST ──────────────────────────────────────────────────────────
const H = { apikey: ENV.SERVICE_KEY, Authorization: `Bearer ${ENV.SERVICE_KEY}`, 'Content-Type': 'application/json' };
const REST = (p, init = {}) => fetch(`${ENV.SUPABASE_URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
const isR2 = (u) => u && (u.startsWith(ENV.R2_PUBLIC_BASE) || u.startsWith('/api/r2/image/'));

// ── R2 ─────────────────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ENV.R2_ACCESS_KEY_ID, secretAccessKey: ENV.R2_SECRET_ACCESS_KEY },
});

function r2KeyFromUrl(url) {
  // https://<base>/pages/xxx.jpg atau /api/r2/image/pages/xxx.jpg → pages/xxx.jpg
  const m = url.match(/\/(pages\/[^/?#]+)/);
  return m ? m[1] : null;
}

async function fetchR2Buffer(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: ENV.R2_BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  // 1. Ambil chapter kandidat
  let chaptersQuery = `chapters?select=id,number,thumbnail_url,manga_id&deleted_at=is.null&order=created_at.desc&limit=1000`;
  if (CHAPTER_ARG) chaptersQuery += `&id=eq.${CHAPTER_ARG}`;
  else chaptersQuery += `&created_at=gte.${SINCE}`;
  const chapters = await (await REST(chaptersQuery)).json();
  if (!Array.isArray(chapters) || !chapters.length) { console.log('[cleanup] tidak ada chapter kandidat'); process.exit(0); }
  console.log(`[cleanup] ${chapters.length} chapter kandidat (${CHAPTER_ARG ? 'chapter ' + CHAPTER_ARG : 'since ' + SINCE})`);

  // 2. Ambil images per chapter (hanya yang URL-nya R2)
  const chapterIds = chapters.map((c) => c.id);
  const imgsByChapter = new Map();
  for (let i = 0; i < chapterIds.length; i += 100) {
    const slice = chapterIds.slice(i, i + 100);
    const imgs = await (await REST(
      `chapter_images?select=chapter_id,number,image_url&chapter_id=in.(${slice.join(',')})&order=number.asc&limit=10000`,
    )).json();
    for (const im of imgs || []) {
      if (!isR2(im.image_url)) continue; // URL sumber akan diganti worker — skip
      if (!imgsByChapter.has(im.chapter_id)) imgsByChapter.set(im.chapter_id, []);
      imgsByChapter.get(im.chapter_id).push(im);
    }
  }

  // 3. Periksa dimensi tiap gambar R2
  const affected = [];  // { chapter, kept, small }
  let checked = 0;
  for (const ch of chapters) {
    const imgs = imgsByChapter.get(ch.id) || [];
    if (!imgs.length) continue;
    const kept = [];
    const small = [];
    for (const im of imgs) {
      const key = r2KeyFromUrl(im.image_url);
      if (!key) { kept.push(im); continue; }
      let dims = null;
      try {
        const buf = await fetchR2Buffer(key);
        dims = getImageDimensions(buf);
      } catch (e) {
        console.warn(`[cleanup] ! gagal ambil ${key}: ${e.message}`);
      }
      checked++;
      if (dims && Math.min(dims.width, dims.height) < MIN_SIDE) {
        small.push({ ...im, w: dims.width, h: dims.height, key });
      } else {
        kept.push(im);
      }
    }
    if (small.length) {
      affected.push({ chapter: ch, kept, small });
      console.log(`[cleanup] chapter ${ch.id.slice(0, 8)}… ch.${ch.number}: ${small.length} gambar kecil dari ${imgs.length}`);
      for (const s of small) console.log(`[cleanup]   - page ${s.number}: ${s.w}x${s.h} ${s.image_url}`);
    }
  }

  console.log(`\n[cleanup] ${checked} gambar R2 diperiksa, ${affected.length} chapter terdampak`);

  if (!affected.length) {
    console.log('[cleanup] bersih — tidak ada gambar kecil.');
    process.exit(0);
  }

  // 4. Eksekusi
  if (APPLY) {
    for (const { chapter: ch, kept, small } of affected) {
      // 4a. Hapus baris kecil
      const numbers = small.map((s) => s.number).join(',');
      const del = await REST(`chapter_images?chapter_id=eq.${ch.id}&number=in.(${numbers})`, { method: 'DELETE' });
      if (!del.ok) { console.error(`[cleanup] ✗ delete rows ch ${ch.id}: HTTP ${del.status}`); continue; }

      // 4b. Renumber sisa halaman 1..N (delete + reinsert — hindari konflik unique)
      const sortedKept = kept.slice().sort((a, b) => a.number - b.number);
      const needRenumber = sortedKept.some((im, i) => im.number !== i + 1);
      if (needRenumber && sortedKept.length) {
        const delAll = await REST(`chapter_images?chapter_id=eq.${ch.id}`, { method: 'DELETE' });
        if (!delAll.ok) { console.error(`[cleanup] ✗ renumber-delete ch ${ch.id}: HTTP ${delAll.status}`); continue; }
        const rows = sortedKept.map((im, i) => ({ chapter_id: ch.id, number: i + 1, image_url: im.image_url }));
        const ins = await REST(`chapter_images`, { method: 'POST', body: JSON.stringify(rows) });
        if (!ins.ok) { console.error(`[cleanup] ✗ renumber-insert ch ${ch.id}: HTTP ${ins.status}`); continue; }
      }

      // 4c. Thumbnail = ke-5 dari belakang (fallback pertama)
      if (sortedKept.length) {
        const thumbIdx = sortedKept.length >= 5 ? sortedKept.length - 5 : 0;
        await REST(`chapters?id=eq.${ch.id}`, { method: 'PATCH', body: JSON.stringify({ thumbnail_url: sortedKept[thumbIdx].image_url }) });
      } else {
        await REST(`chapters?id=eq.${ch.id}`, { method: 'PATCH', body: JSON.stringify({ thumbnail_url: null }) });
      }

      // 4d. Hapus objek R2 kecil (opsional)
      if (DELETE_R2) {
        for (const s of small) {
          if (!s.key) continue;
          try {
            await s3.send(new DeleteObjectCommand({ Bucket: ENV.R2_BUCKET, Key: s.key }));
          } catch (e) {
            console.warn(`[cleanup] ! gagal hapus R2 ${s.key}: ${e.message}`);
          }
        }
      }

      console.log(`[cleanup] ✓ ch.${ch.number}: ${small.length} dihapus, ${sortedKept.length} halaman tersisa${needRenumber ? ' (renumbered)' : ''}${DELETE_R2 ? ' + objek R2' : ''}`);
    }
    console.log('\n[cleanup] SELESAI. Jalankan ulang worker untuk mengisi ulang halaman yang hilang:');
    console.log("  gh workflow run 'Image Backfill (Playwright)' -f limit=5 -f minutes=10");
  } else {
    console.log('[cleanup] dry-run — jalankan ulang dengan --apply untuk mengeksekusi langkah di atas.');
  }
  process.exit(0);
})().catch((e) => { console.error('[cleanup] fatal:', e); process.exit(1); });

