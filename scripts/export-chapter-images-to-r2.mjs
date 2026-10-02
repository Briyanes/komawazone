#!/usr/bin/env node
/**
 * Export chapter_images → manifest JSON di R2 (gerbang #1 rencana "R2-first").
 *
 * Kenapa: tabel chapter_images = 518 MB (88% DB) dan hanya dipakai reader
 * sebagai daftar URL gambar per chapter — cocok jadi JSON statis di R2
 * (dilayani CDN, cache 5 menit). Setelah purge, DB turun ke ±75 MB →
 * Supabase free tier aman selamanya (tanpa Pro).
 *
 * Manifest: manifests/ch/<chapter_id>.json
 *   {"v":1,"images":[{"n":1,"u":"https://cdn...","w":800,"h":1200}, ...]}
 *
 * Usage:
 *   node scripts/export-chapter-images-to-r2.mjs            # ekspor + upload
 *   node scripts/export-chapter-images-to-r2.mjs --dry-run  # hitung saja
 *   node scripts/export-chapter-images-to-r2.mjs --verify   # bandingkan R2 vs DB
 *
 * JANGAN jalankan bersamaan dengan worker image-backfill (hindari manifest
 * basi akibat delete+insert mid-ekspor).
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
};
for (const [k, v] of Object.entries(ENV)) {
  if (!v) { console.error(`[export] env ${k} wajib diisi`); process.exit(1); }
}

const DRY = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');
const PAGE = 1000;

const H = { apikey: ENV.SERVICE_KEY, Authorization: `Bearer ${ENV.SERVICE_KEY}` };
const REST = (p) => fetch(`${ENV.SUPABASE_URL}/rest/v1/${p}`, { headers: H });

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ENV.R2_ACCESS_KEY_ID, secretAccessKey: ENV.R2_SECRET_ACCESS_KEY },
});

async function uploadManifest(chapterId, images) {
  const body = JSON.stringify({ v: 1, images });
  await s3.send(new PutObjectCommand({
    Bucket: ENV.R2_BUCKET,
    Key: `manifests/ch/${chapterId}.json`,
    Body: body,
    ContentType: 'application/json',
    // 5 menit (BUKAN immutable): chapter yang di-refill worker self-heal cepat
    CacheControl: 'public, max-age=300',
  }));
}

async function verify() {
  // Hitung manifest di R2 (perbandingan dengan DB dilakukan via psql di shell —
  // count(DISTINCT chapter_id) server-side, nol egress).
  let manifestCount = 0; let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: ENV.R2_BUCKET, Prefix: 'manifests/ch/', ContinuationToken: token, MaxKeys: 1000 }));
    manifestCount += (r.KeyCount ?? 0);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  console.log(`[verify] manifest-R2=${manifestCount}`);
  return manifestCount;
}

if (VERIFY) {
  await verify();
  process.exit(0);
}

// ── Ekspor: halaman demi halaman, kelompokkan per chapter ──────────────────
// Pagination offset rentan gagal transien (rate limit) — halaman gagal yang
// di-skip diam-diam membuat manifest KURANG. Maka: retry 4x per halaman dan
// ABORT keras (exit 1) bila permanen — jangan pernah break diam-diam.
async function fetchPage(offset) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await REST(`chapter_images?select=chapter_id,number,image_url,width,height&order=chapter_id.asc,number.asc&limit=${PAGE}&offset=${offset}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error('respons non-array');
      return rows;
    } catch (e) {
      console.warn(`[export] halaman offset=${offset} gagal (${e.message}) — ulangi ${attempt}/4`);
      await new Promise((r2) => setTimeout(r2, 2000 * attempt));
    }
  }
  console.error(`[export] ✗ halaman offset=${offset} gagal permanen — EKSPOR DIBATALKAN. JANGAN purge!`);
  process.exit(1);
}

let offset = 0;
let carried = null;        // { chapterId, images[] } yang terpotong antar-halaman
let uploaded = 0;
let rowsRead = 0;
const t0 = Date.now();

while (true) {
  const rows = await fetchPage(offset);
  if (rows.length === 0) break;
  rowsRead += rows.length;

  let i = 0;
  if (carried && rows[0].chapter_id === carried.chapterId) {
    for (; i < rows.length && rows[i].chapter_id === carried.chapterId; i++) {
      carried.images.push({ n: rows[i].number, u: rows[i].image_url, w: rows[i].width, h: rows[i].height });
    }
  }
  for (; i < rows.length; ) {
    const cid = rows[i].chapter_id;
    if (carried && carried.chapterId !== cid) {
      if (!DRY) await uploadManifest(carried.chapterId, carried.images);
      uploaded++;
    }
    carried = { chapterId: cid, images: [] };
    for (; i < rows.length && rows[i].chapter_id === cid; i++) {
      carried.images.push({ n: rows[i].number, u: rows[i].image_url, w: rows[i].width, h: rows[i].height });
    }
  }
  offset += PAGE;
  if (rows.length < PAGE) break;
  if (offset % 50000 === 0) console.log(`[export] ...${rowsRead} baris, ${uploaded} manifest (${Math.round((Date.now() - t0) / 1000)}s)`);
}
if (carried) {
  if (!DRY) await uploadManifest(carried.chapterId, carried.images);
  uploaded++;
}

console.log(`[export] ${DRY ? 'DRY-RUN ' : ''}selesai: ${rowsRead} baris → ${uploaded} manifest dalam ${Math.round((Date.now() - t0) / 1000)}s`);
if (!DRY) await verify();
