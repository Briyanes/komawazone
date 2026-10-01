#!/usr/bin/env node
/**
 * Image Backfill Worker — Playwright-based (runs ANYWHERE: GitHub Actions or laptop)
 *
 * Mengisi gambar chapter ke R2 untuk chapter yang:
 *   - belum punya baris chapter_images sama sekali (metadata-only import), ATAU
 *   - masih memakai URL sumber (belum R2)
 *
 * Kenapa Playwright? CDN sumber (mis. gmbr.pro) dilindungi Cloudflare
 * bot-management yang menuntut browser nyata (challenge JS). Server-side
 * fetch (Vercel/proxy datacenter) diblokir — browser lolos otomatis.
 *
 * Mode:
 *   - GitHub Actions: env dari repo secrets
 *   - Lokal: env dari .env.local (tanpa argumen)
 *
 * Usage:
 *   node scripts/image-backfill.mjs                 # default: LIMIT=5 chapter, 10 menit
 *   LIMIT=10 MINUTES=25 node scripts/image-backfill.mjs
 *
 * Idempotent: aman dijalankan berulang (skip yang sudah R2).
 */

import { chromium } from 'playwright';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
const LIMIT = Number(process.env.LIMIT || 5);            // max chapter per run
const MINUTES = Number(process.env.MINUTES || 10);        // time-box
const HOST_FILTER = process.env.HOST_FILTER || 'manhwaindo';
const DEADLINE = Date.now() + MINUTES * 60_000;

for (const [k, v] of Object.entries(ENV)) {
  if (!v) { console.error(`[backfill] env ${k} wajib diisi`); process.exit(1); }
}

// ── Supabase REST helpers ──────────────────────────────────────────────────
const H = { apikey: ENV.SERVICE_KEY, Authorization: `Bearer ${ENV.SERVICE_KEY}`, 'Content-Type': 'application/json' };
const REST = (p, init = {}) => fetch(`${ENV.SUPABASE_URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
const isR2 = (u) => !u || u.startsWith(ENV.R2_PUBLIC_BASE) || u.startsWith('/api/r2/image/');

// ── R2 client ──────────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ENV.R2_ACCESS_KEY_ID, secretAccessKey: ENV.R2_SECRET_ACCESS_KEY },
});

async function uploadToR2(buffer, contentType) {
  const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
  const key = `pages/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await s3.send(new PutObjectCommand({ Bucket: ENV.R2_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return { key, url: `${ENV.R2_PUBLIC_BASE}/${key}` };
}

// ── Pilih chapter yang butuh gambar (terbaru dulu) ────────────────────────
async function selectChapters(limit) {
  const chapters = await (await REST(`chapters?select=id,manga_id,number,created_at&deleted_at=is.null&order=created_at.desc&limit=300`)).json();
  if (!Array.isArray(chapters) || !chapters.length) return [];

  const mangaIds = [...new Set(chapters.map((c) => c.manga_id))];
  const mangaRows = await (await REST(`manga?select=id,slug,source_url&id=in.(${mangaIds.join(',')})`)).json();
  const mangaById = new Map((mangaRows || []).map((m) => [m.id, m]));

  const chapterIds = chapters.map((c) => c.id);
  const imgsByChapter = new Map();
  for (let i = 0; i < chapterIds.length; i += 200) {
    const slice = chapterIds.slice(i, i + 200);
    const imgs = await (await REST(`chapter_images?select=chapter_id,number,image_url&chapter_id=in.(${slice.join(',')})&limit=5000`)).json();
    for (const im of imgs || []) {
      if (!imgsByChapter.has(im.chapter_id)) imgsByChapter.set(im.chapter_id, []);
      imgsByChapter.get(im.chapter_id).push(im);
    }
  }

  const result = [];
  for (const c of chapters) {
    const manga = mangaById.get(c.manga_id);
    if (!manga?.slug || !manga.source_url || !manga.source_url.includes(HOST_FILTER)) continue;
    const imgs = imgsByChapter.get(c.id) || [];
    const needs = imgs.length === 0 || imgs.some((im) => !isR2(im.image_url));
    if (needs) {
      result.push({ id: c.id, number: c.number, slug: manga.slug, origin: new URL(manga.source_url).origin });
      if (result.length >= limit) break;
    }
  }
  return result;
}
// ── Ambil gambar chapter via browser nyata ────────────────────────────────
async function fetchChapterImages(origin, slug, number) {
  const pageUrl = `${origin}/${slug}-chapter-${number}/`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
  });
  const page = await context.newPage();
  // Intersepsi respons gambar sejak awal (bebas CORS — level protokol)
  const imageResponses = new Map();
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url)) return;
      if (/banner|advert|ads[-_/]|logo|icon/i.test(url)) return;
      if (!res.ok()) return;
      const ct = res.headers()['content-type'] || '';
      if (!ct.startsWith('image/') || ct.includes('svg')) return;
      if (!imageResponses.has(url)) imageResponses.set(url, res);
    } catch { /* ignore */ }
  });
  try {
    console.log(`[backfill] buka ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const collectUrls = () => page.evaluate(() => {
      const urls = [];
      for (const img of document.querySelectorAll('img')) {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!/^https?:\/\//.test(src)) continue;
        if (!/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(src)) continue;
        if (/banner|advert|ads[-_/]|logo|icon/i.test(src)) continue;
        if ((img.naturalWidth || 0) < 200) continue; // kecil = UI/iklan
        urls.push(src);
      }
      return urls;
    });

    let urls = [];
    for (let t = 0; t < 45; t++) {
      await page.waitForTimeout(1000);
      urls = await collectUrls();
      if (urls.length >= 3) break;
    }
    if (!urls.length) throw new Error('tidak ada gambar terdeteksi (CF challenge atau struktur berubah)');

    // Paksa semua lazy-load: scroll + ganti data-src → src
    await page.evaluate(async () => {
      document.querySelectorAll('img[data-src]').forEach((img) => {
        if (img.getAttribute('src') !== img.getAttribute('data-src')) img.setAttribute('src', img.getAttribute('data-src'));
      });
      for (let y = 0; y <= document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
      }
    });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    urls = [...new Set([...urls, ...(await collectUrls())])];
    console.log(`[backfill] ${urls.length} gambar kandidat, ${imageResponses.size} respons tertangkap`);

    // Ambil buffer dari respons yang diintersepsi (urut DOM)
    const buffers = [];
    for (const u of urls) {
      const res = imageResponses.get(u);
      if (!res) continue;
      try {
        const buf = await res.body();
        const ct = res.headers()['content-type'] || 'image/jpeg';
        buffers.push({ contentType: ct, buffer: buf });
      } catch { /* ignore */ }
    }
    console.log(`[backfill] ${buffers.length} gambar berhasil diambil dari respons jaringan`);
    return buffers;
  } finally {
    await browser.close();
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  const started = Date.now();
  console.log(`[backfill] mulai — limit ${LIMIT} chapter, budget ${MINUTES} menit`);
  const targets = await selectChapters(LIMIT);
  console.log(`[backfill] ${targets.length} chapter butuh gambar: ${targets.map((t) => `${t.slug}#ch${t.number}`).join(', ')}`);

  let ok = 0, fail = 0;
  for (const t of targets) {
    if (Date.now() > DEADLINE - 60_000) { console.log('[backfill] budget habis, berhenti'); break; }
    try {
      const images = await fetchChapterImages(t.origin, t.slug, t.number);
      if (!images.length) { fail++; continue; }

      const rows = [];
      for (let i = 0; i < images.length; i++) {
        const up = await uploadToR2(images[i].buffer, images[i].contentType);
        rows.push({ chapter_id: t.id, number: i + 1, image_url: up.url });
      }
      const ins = await REST(`chapter_images?on_conflict=chapter_id,number`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(rows),
      });
      if (!ins.ok) throw new Error(`upsert chapter_images HTTP ${ins.status}: ${(await ins.text()).slice(0, 150)}`);

      // Thumbnail = gambar ke-5 (aturan sama dengan backfill route)
      const thumb = rows.length >= 5 ? rows[4].image_url : rows[rows.length - 1].image_url;
      await REST(`chapters?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({ thumbnail_url: thumb }) });

      ok++;
      console.log(`[backfill] ✓ ${t.slug} ch.${t.number}: ${rows.length} gambar → R2, thumbnail diset`);
    } catch (e) {
      fail++;
      console.error(`[backfill] ✗ ${t.slug} ch.${t.number}: ${e.message}`);
    }
  }

  console.log(`\n[backfill] SELESAI dalam ${Math.round((Date.now() - started) / 1000)}s — sukses ${ok}, gagal ${fail}`);
  process.exit(0);
})().catch((e) => { console.error('[backfill] fatal:', e); process.exit(1); });