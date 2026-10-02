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
const LIMIT = Number(process.env.LIMIT || 5);            // max chapter per run
const MINUTES = Number(process.env.MINUTES || 10);        // time-box
// Lane paralel: tiap lane punya browser sendiri dan menarik chapter dari
// antrean bersama. GH ubuntu-latest (2 vCPU/7GB) nyaman dengan 2 lane.
const LANES = Number(process.env.LANES ?? 2);
// Fase COVER: rehost cover yang mati (gmbr/gmbar/uwakjawa diblokir Cloudflare
// 403 global) atau NULL → R2. Diambil dari halaman manga source via browser
// nyata (og:image), lolos proteksi yang sama dengan halaman chapter.
const COVER_LIMIT = Number(process.env.COVER_LIMIT ?? 10); // 0 = matikan fase cover
const HOST_FILTER = process.env.HOST_FILTER || 'manhwaindo';
// Halaman manga asli hampir selalu ≥600px di kedua sisi. Semua slot iklan
// standar (728×90, 970×250, 300×250, 300×600, 336×280, 400×25, …) punya
// minimal satu sisi ≤400px — banner "BANDAR36" 400×25 menyamar alt="Page 1".
const MIN_IMG_SIDE = Number(process.env.MIN_IMG_SIDE || 400);
// Iklan menurut URL: kata banner/advert/sponsor, segmen "ads" yang berdiri
// sendiri (/ads/, /ad/, ads-x, "ads.example.com"), atau thumbnail/cover manga
// yang kebetulan besar (720×1013) sehingga lolos filter dimensi.
// Regex polos /ads[-_/]/ SALAH — cocok dengan substring "ads/" di "uploads/"
// dan membuang semua halaman asli dari gmbr.pro (/uploads/manga-images/...).
const AD_URL_RE = /banner|advert|sponsor|(^|[/_.-])ads?([-_/.]|$)|(^|[/_.-])thumb(nail)?s?([-_/.]|$)/i;
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

// ── Fase COVER: rehost cover mati/null → R2 ────────────────────────────────
const DEAD_COVER_RE = /gmbr\.pro|gmbar\.xyz|uwakjawa\.xyz/i;

async function selectBrokenCovers(limit) {
  // Jendela 1500 manga terbaru: cover mati tersebar juga di manga lama
  // (impor era gmbr), bukan hanya manga baru.
  const rows = await (await REST(`manga?select=id,slug,source_url,cover_url&deleted_at=is.null&order=created_at.desc&limit=1500`)).json();
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((m) => m.source_url && (!m.cover_url || DEAD_COVER_RE.test(m.cover_url)))
    .slice(0, limit);
}

async function uploadCoverToR2(buffer, contentType) {
  const ext = ((contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg');
  const key = `covers/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await s3.send(new PutObjectCommand({ Bucket: ENV.R2_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return `${ENV.R2_PUBLIC_BASE}/${key}`;
}

async function fetchCoverViaPage(sourceUrl) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
    });
    const page = await context.newPage();

    // Host cover (imgx-id.gmbr.pro) menolak SEMUA fetch non-browser (403
    // bahkan dengan UA+Referer — blokir fingerprint/IP). Satu-satunya jalur
    // yang terbukti lolos = biarkan browser memuat gambar sebagai sub-sumber
    // halaman dan ambil bytesnya lewat intersepsi respons (pola yang sama
    // dengan fetchChapterImages). JANGAN pakai AD_URL_RE di sini: file cover
    // bernama "thumbnail.png" — filter iklan akan membuangnya!
    const images = [];
    page.on('response', async (res) => {
      try {
        const url = res.url();
        if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) return;
        if (!res.ok()) return;
        const ct = res.headers()['content-type'] || '';
        if (!ct.startsWith('image/') || ct.includes('svg')) return;
        const buf = await res.body();
        const dims = getImageDimensions(buf);
        if (!dims || Math.min(dims.width, dims.height) < 200) return;
        images.push({ url, buffer: buf, contentType: ct, area: dims.width * dims.height });
      } catch { /* ignore */ }
    });

    console.log(`[cover] buka ${sourceUrl}`);
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // og:image = URL cover otoritatif → paksa <img> memuatnya agar responsnya
    // terekam intersepsi (sampai 10 dtk — host cover kadang lambat/challenge).
    const norm = (u) => u.replace(/^http:\/\//i, 'https://').replace(/[?#].*$/, '');
    const og = await page.evaluate(() =>
      document.querySelector('meta[property="og:image"]')?.content
      || document.querySelector('meta[name="og:image"]')?.content || '');
    if (/^https?:\/\//i.test(og)) {
      await page.evaluate((u) => {
        const i = document.createElement('img');
        i.src = u; i.style.display = 'none';
        document.body.appendChild(i);
      }, og);
      for (let t = 0; t < 20 && !images.some((im) => norm(im.url) === norm(og)); t++) {
        await page.waitForTimeout(500);
      }
    } else {
      // Tanpa og:image: paksa lazy-load semua gambar, ambil yang terbesar.
      await page.evaluate(() => {
        document.querySelectorAll('img[data-src]').forEach((img) => img.setAttribute('src', img.getAttribute('data-src')));
      });
      await page.waitForTimeout(6000);
    }

    const match = (/^https?:\/\//i.test(og) && images.find((im) => norm(im.url) === norm(og))) || null;
    const pick = match || images.sort((a, b) => b.area - a.area)[0];
    if (!pick) return null;
    return { buffer: pick.buffer, contentType: pick.contentType };
  } finally {
    await browser.close();
  }
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
async function fetchChapterImages(browser, origin, slug, number) {
  const pageUrl = `${origin}/${slug}-chapter-${number}/`;
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
      // gif dibuang: animasi iklan + bermasalah di reader (kebijakan sama
      // dengan parseChapterImages di scraper-utils)
      if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) return;
      // "ads" hanya dianggap iklan bila berdiri sendiri (/ads/, ads-x, ads_)
      // — JANGAN pakai ads[-_/] polos: itu cocok dengan "uploads/" dan
      // menghabiskan semua URL halaman asli (/uploads/manga-images/...)!
      if (AD_URL_RE.test(url)) return;
      if (!res.ok()) return;
      const ct = res.headers()['content-type'] || '';
      if (!ct.startsWith('image/') || ct.includes('svg')) return;
      if (!imageResponses.has(url)) imageResponses.set(url, res);
    } catch { /* ignore */ }
  });
  try {
    console.log(`[backfill] buka ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Paksa semua lazy-load: scroll + ganti data-src → src, supaya semua
    // halaman mulai di-download (strip webtoon tinggi butuh puluhan detik).
    const forceLazyLoad = () => page.evaluate(async () => {
      document.querySelectorAll('img[data-src]').forEach((img) => {
        if (img.getAttribute('src') !== img.getAttribute('data-src')) img.setAttribute('src', img.getAttribute('data-src'));
      });
      for (let y = 0; y <= document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
      }
    });
    await forceLazyLoad();

    // Kandidat halaman: <img> http(s) non-gif, selesai decode, dan min-side
    // ≥ MIN_IMG_SIDE. Banner iklan sering menyamar alt="Page 1" + w-full —
    // dimensi pixel adalah sinyal paling andal. `pending` = kandidat yang
    // masih loading (harus ditunggu, bukan dibuang).
    const collectUrls = () => page.evaluate(({ minSide, adRe }) => {
      const urls = [];
      const dropped = [];
      let pending = 0;
      for (const img of document.querySelectorAll('img')) {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!/^https?:\/\//.test(src)) continue;
        if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(src)) continue; // gif dibuang (iklan animasi)
        if (adRe.test(src)) continue;
        if (!img.complete) { pending++; continue; }
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        if (w === 0 || h === 0) continue; // gagal load / belum decode
        if (Math.min(w, h) < minSide) { dropped.push(`${w}x${h} ${src}`); continue; }
        urls.push(src);
      }
      return { urls, dropped, pending };
    }, { minSide: MIN_IMG_SIDE, adRe: AD_URL_RE });

    // Tunggu halaman termuat. Keluar lebih awal hanya jika:
    //  a) ≥3 halaman valid DAN semua kandidat sudah selesai loading, atau
    //  b) daftar stabil 4 polling (8 dtk) dengan ≥3 halaman — menunggu
    //     iklan yang loading selamanya itu sia-sia; halaman sisanya
    //     diambil via fetch langsung di bawah.
    let urls = [];
    let droppedDom = [];
    let stable = 0;
    let prev = -1;
    const waitStart = Date.now();
    for (;;) {
      const r = await collectUrls();
      urls = r.urls;
      droppedDom = r.dropped;
      if (urls.length >= 3 && r.pending === 0) break;
      if (urls.length === prev) stable++; else stable = 0;
      prev = urls.length;
      if (stable >= 4 && urls.length >= 3) break;
      if (Date.now() - waitStart > 120_000) break;
      await page.waitForTimeout(2000);
    }
    if (!urls.length) throw new Error('tidak ada gambar terdeteksi (CF challenge atau struktur berubah)');

    await forceLazyLoad();
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    const recollect = await collectUrls();
    urls = [...new Set([...urls, ...recollect.urls])];
    droppedDom = [...new Set([...droppedDom, ...recollect.dropped])];
    if (droppedDom.length) {
      console.log(`[backfill] buang ${droppedDom.length} kandidat kecil/iklan (DOM):`);
      for (const d of droppedDom.slice(0, 5)) console.log(`[backfill]   - ${d}`);
    }
    console.log(`[backfill] ${urls.length} gambar kandidat, ${imageResponses.size} respons tertangkap (${Math.round((Date.now() - waitStart) / 1000)}s tunggu)`);

    // Ambil buffer (urut DOM) + verifikasi dimensi dari byte gambar asli.
    // Lookup respons intersepsi; URL http:// dicoba varian https://
    // (Chrome auto-upgrade mixed content), lalu fallback fetch langsung
    // pakai konteks browser (bawa cookies/UA) untuk yang tak tertangkap.
    const getBuffer = async (u) => {
      let res = imageResponses.get(u);
      if (!res && u.startsWith('http://')) res = imageResponses.get(`https://${u.slice(7)}`);
      if (res) {
        try {
          return { buffer: await res.body(), contentType: res.headers()['content-type'] || 'image/jpeg' };
        } catch { /* jatuh ke fetch */ }
      }
      try {
        const r = await context.request.get(u, { timeout: 30_000 });
        if (r.ok()) return { buffer: await r.body(), contentType: r.headers()['content-type'] || 'image/jpeg' };
      } catch { /* ignore */ }
      return null;
    };

    const buffers = [];
    let droppedBuf = 0;
    let missed = 0;
    for (const u of urls) {
      const got = await getBuffer(u);
      if (!got) { missed++; console.log(`[backfill] ! tanpa buffer: ${u}`); continue; }
      const dims = getImageDimensions(got.buffer);
      if (dims && Math.min(dims.width, dims.height) < MIN_IMG_SIDE) {
        droppedBuf++;
        console.log(`[backfill] buang (buffer ${dims.width}x${dims.height}) ${u}`);
        continue;
      }
      buffers.push({ contentType: got.contentType, buffer: got.buffer });
    }
    if (droppedBuf) console.log(`[backfill] ${droppedBuf} gambar dibuang dari respons jaringan (sisi < ${MIN_IMG_SIDE}px)`);
    console.log(`[backfill] ${buffers.length} gambar berhasil diambil${missed ? `, ${missed} gagal` : ''}`);
    return buffers;
  } finally {
    await context.close(); // browser di-launch per lane oleh main, jangan ditutup di sini
  }
}

// ── Fase CHAPTER-LIST: manga manhwaindo tanpa chapter → import metadata ────
// Halaman seri manhwaindo.my diblokir CF untuk IP datacenter (cron Vercel
// mendapat 403), tetapi lolos dari browser nyata di runner GH. Data daftar
// chapter = JSON inline ber-escape di HTML (tema AGC) — format yang sama
// dengan fallback ketiga parseChapterListFromHtml.
const CHAPTERS_LIMIT = Number(process.env.CHAPTERS_LIMIT ?? 3); // 0 = off
const SYNC_LIMIT = Number(process.env.SYNC_LIMIT ?? 5);   // manga ongoing dicek/run (0 = off)
const AGC_CHAPTER_RE = /\{"id":\d+,"title":"[^"]*","url":"https?:\/\/[^"]+","chapter":"\d+(?:\.\d+)?","time":"[^"]*"\}/g;

async function selectChapterlessManga(limit) {
  const rows = (await (await REST(`manga?select=id,slug,source_url&deleted_at=is.null&order=created_at.desc&limit=300`)).json()) || [];
  const out = [];
  for (const m of rows) {
    if (!m.source_url || !m.source_url.includes(HOST_FILTER)) continue;
    const cnt = (await (await REST(`chapters?select=id&manga_id=eq.${m.id}&deleted_at=is.null&limit=1`)).json()) || [];
    if (cnt.length === 0) out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

async function importChaptersFromSeries(m) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
    });
    const page = await context.newPage();
    console.log(`[chapters] buka ${m.source_url}`);
    await page.goto(m.source_url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const html = await page.content();
    const unescaped = html.replace(/\\"/g, '"').replace(/\\\//g, '/');
    const objs = unescaped.match(AGC_CHAPTER_RE) || [];
    if (!objs.length) return 0;

    const existing = (await (await REST(`chapters?select=number&manga_id=eq.${m.id}&deleted_at=is.null&limit=10000`)).json()) || [];
    const have = new Set(existing.map((c) => c.number));

    const rows = [];
    const seen = new Set();
    for (const obj of objs) {
      const number = parseFloat(obj.match(/"chapter":"(\d+(?:\.\d+)?)"/)[1]);
      if (seen.has(number) || have.has(number)) continue;
      seen.add(number);
      rows.push({ manga_id: m.id, number, title: `Chapter ${number}` });
    }
    for (let i = 0; i < rows.length; i += 50) {
      const ins = await REST(`chapters`, {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify(rows.slice(i, i + 50)),
      });
      if (!ins.ok) throw new Error(`insert chapters HTTP ${ins.status}: ${(await ins.text()).slice(0, 120)}`);
    }
    return rows.length;
  } finally {
    await browser.close();
  }
}

// ── Fase SYNC: manga ongoing → deteksi & insert chapter baru ────────────────
// Pengganti cron Vercel check-new-chapters (403 oleh CF utk IP datacenter).
// Window acak dari manga yang paling lama di-update (stale-first) supaya
// seluruh koleksi tersapu seiring waktu tanpa kolom marker tambahan.
async function selectOngoingManga(limit) {
  const off = Math.floor(Math.random() * 240);
  const rows = (await (await REST(`manga?select=id,slug,source_url&deleted_at=is.null&order=updated_at.asc&limit=400&offset=${off}`)).json()) || [];
  const out = [];
  for (const m of rows) {
    if (!m.source_url || !m.source_url.includes(HOST_FILTER)) continue;
    const cnt = (await (await REST(`chapters?select=id&manga_id=eq.${m.id}&deleted_at=is.null&limit=1`)).json()) || [];
    if (cnt.length > 0) out.push(m); // ongoing = sudah punya chapter
    if (out.length >= limit) break;
  }
  return out;
}

// ── Metrik penutup: progres terlihat di log tiap run ────────────────────────
async function printMetrics() {
  try {
    const countOf = async (table, q) => {
      const r = await REST(`${table}?${q}&limit=1`, { headers: { Prefer: 'count=exact' } });
      return (r.headers.get('content-range') || '?/').split('/')[1];
    };
    const imgs = await countOf('chapter_images', 'select=id');
    const chaptersTotal = await countOf('chapters', 'select=id');
    const deadCovers = await countOf('manga', 'select=id&deleted_at=is.null&or=(cover_url.like.*gmbr.pro*,cover_url.like.*gmbar.xyz*,cover_url.like.*uwakjawa.xyz*)');
    console.log(`[metrics] chapter_images=${imgs} | chapters=${chaptersTotal} | cover-mati=${deadCovers}`);
  } catch (e) {
    console.log(`[metrics] gagal: ${e.message}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  const started = Date.now();
  console.log(`[backfill] mulai — limit ${LIMIT} chapter, ${COVER_LIMIT} cover, budget ${MINUTES} menit`);

  // ── Fase 0: manga tanpa chapter → import daftar chapter (metadata) ──────
  let chaptersOk = 0, chaptersFail = 0;
  if (CHAPTERS_LIMIT > 0) {
    const targets0 = await selectChapterlessManga(CHAPTERS_LIMIT);
    console.log(`[chapters] ${targets0.length} manga tanpa chapter: ${targets0.map((m) => m.slug).join(', ')}`);
    for (const m of targets0) {
      if (Date.now() > DEADLINE - 60_000) { console.log('[chapters] budget habis, berhenti'); break; }
      try {
        const n = await importChaptersFromSeries(m);
        if (n === 0) { chaptersFail++; console.log(`[chapters] ! ${m.slug}: daftar chapter kosong`); continue; }
        chaptersOk++;
        console.log(`[chapters] ✓ ${m.slug}: +${n} chapter`);
      } catch (e) {
        chaptersFail++;
        console.error(`[chapters] ✗ ${m.slug}: ${e.message}`);
      }
    }
  }

  // ── Fase 0b: sync chapter baru untuk manga ongoing ───────────────────────
  let syncOk = 0, syncFail = 0, syncAdded = 0;
  if (SYNC_LIMIT > 0) {
    const syncTargets = await selectOngoingManga(SYNC_LIMIT);
    console.log(`[sync] ${syncTargets.length} manga ongoing dicek: ${syncTargets.map((m) => m.slug).join(', ')}`);
    for (const m of syncTargets) {
      if (Date.now() > DEADLINE - 60_000) { console.log('[sync] budget habis, berhenti'); break; }
      try {
        const n = await importChaptersFromSeries(m);
        syncAdded += n;
        if (n > 0) {
          syncOk++;
          // updated_at HANYA dinaikkan bila benar-benar ada chapter baru —
          // kolom ini dipakai sorting "Terbaru" di UI, jangan digerakkan
          // oleh pemeriksaan kosong.
          await REST(`manga?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ updated_at: new Date().toISOString() }) });
          console.log(`[sync] ✓ ${m.slug}: +${n} chapter baru`);
        } else {
          console.log(`[sync] = ${m.slug}: up to date`);
        }
      } catch (e) {
        syncFail++;
        console.error(`[sync] ✗ ${m.slug}: ${e.message}`);
      }
    }
  }

  // ── Fase 1: cover rusak → R2 (cepat, dampak langsung di beranda) ────────
  let coversOk = 0, coversFail = 0;
  if (COVER_LIMIT > 0) {
    const coverTargets = await selectBrokenCovers(COVER_LIMIT);
    console.log(`[cover] ${coverTargets.length} cover butuh rehost: ${coverTargets.map((m) => m.slug).join(', ')}`);
    for (const m of coverTargets) {
      if (Date.now() > DEADLINE - 60_000) { console.log('[cover] budget habis, berhenti'); break; }
      try {
        const img = await fetchCoverViaPage(m.source_url);
        if (!img) { coversFail++; console.log(`[cover] ! ${m.slug}: cover tidak terambil`); continue; }
        const url = await uploadCoverToR2(img.buffer, img.contentType);
        const patch = await REST(`manga?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ cover_url: url }) });
        if (!patch.ok) throw new Error(`PATCH manga HTTP ${patch.status}`);
        coversOk++;
        console.log(`[cover] ✓ ${m.slug} → ${url}`);
      } catch (e) {
        coversFail++;
        console.error(`[cover] ✗ ${m.slug}: ${e.message}`);
      }
    }
  }

  const targets = await selectChapters(LIMIT);
  console.log(`[backfill] ${targets.length} chapter butuh gambar: ${targets.map((t) => `${t.slug}#ch${t.number}`).join(', ')}`);

  // ── Fase 2: isi gambar chapter — LANES browser paralel dari antrean ──────
  let ok = 0, fail = 0;
  let nextIdx = 0;
  const lane = async (laneId) => {
    // Stagger 20 dtk: dua lane tidak membuka halaman pada milidetik yang sama
    if (laneId > 1) await new Promise((r) => setTimeout(r, 20_000));
    const browser = await chromium.launch({ headless: true });
    try {
      while (Date.now() <= DEADLINE - 60_000) {
        const t = targets[nextIdx++];
        if (!t) break;
        try {
          const images = await fetchChapterImages(browser, t.origin, t.slug, t.number);
          if (!images.length) { fail++; continue; }

          const rows = [];
          for (let i = 0; i < images.length; i++) {
            const up = await uploadToR2(images[i].buffer, images[i].contentType);
            rows.push({ chapter_id: t.id, number: i + 1, image_url: up.url });
          }
          // Hapus baris lama sebelum insert: hasil scrape fresh bisa lebih pendek
          // dari data lama (iklan terbuang) — upsert saja akan menyisakan baris
          // nomor lama yang tidak valid / duplikat halaman terakhir.
          const del = await REST(`chapter_images?chapter_id=eq.${t.id}`, { method: 'DELETE' });
          if (!del.ok) throw new Error(`delete chapter_images HTTP ${del.status}`);

          const ins = await REST(`chapter_images`, {
            method: 'POST',
            body: JSON.stringify(rows),
          });
          if (!ins.ok) throw new Error(`insert chapter_images HTTP ${ins.status}: ${(await ins.text()).slice(0, 150)}`);

          // Thumbnail = gambar ke-5 DARI BELAKANG (aturan migration 039 + admin
          // routes); fallback gambar pertama.
          const thumbIdx = rows.length >= 5 ? rows.length - 5 : 0;
          await REST(`chapters?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({ thumbnail_url: rows[thumbIdx].image_url }) });

          ok++;
          console.log(`[lane${laneId}] ✓ ${t.slug} ch.${t.number}: ${rows.length} gambar → R2, thumbnail diset`);
        } catch (e) {
          fail++;
          console.error(`[lane${laneId}] ✗ ${t.slug} ch.${t.number}: ${e.message}`);
        }
      }
      if (Date.now() > DEADLINE - 60_000) console.log(`[lane${laneId}] budget habis`);
    } finally {
      await browser.close();
    }
  };
  console.log(`[backfill] ${LANES} lane paralel aktif`);
  await Promise.all(Array.from({ length: LANES }, (_, i) => lane(i + 1)));

  await printMetrics();
  console.log(`\n[backfill] SELESAI dalam ${Math.round((Date.now() - started) / 1000)}s — sync: ✓${syncOk} +${syncAdded}ch ✗${syncFail}; chapter-list: ✓${chaptersOk} ✗${chaptersFail}; cover: ✓${coversOk} ✗${coversFail}; gambar chapter: sukses ${ok}, gagal ${fail}`);
  process.exit(0);
})().catch((e) => { console.error('[backfill] fatal:', e); process.exit(1); });