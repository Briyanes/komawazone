# 🖥️ Local Import Tool — Jalan dari MacBook

> **Kenapa local?** Vercel cron dibatasi timeout (10s/hobby, 60s/pro, 300s/enterprise). Import manga + ratusan gambar chapter butuh menit sampai jam. Dengan local import tool, MacBook Anda jadi "worker" yang powerful — **tanpa timeout**, download paralel, upload langsung ke R2.

---

## 📋 Prasyarat

1. **Node.js 18+** (sudah terpasang jika Anda bisa jalankan `npm run dev`)
2. **File `.env`** di root project dengan kredensial berikut (lihat `.env.example`):

   ```env
   # Supabase (wajib)
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJxxx

   # Cloudflare R2 (wajib untuk upload gambar)
   R2_ACCOUNT_ID=your-account-id
   R2_ACCESS_KEY_ID=your-access-key
   R2_SECRET_ACCESS_KEY=your-secret-key
   R2_BUCKET=olluq
   R2_PUBLIC_BASE_URL=https://pub-xxxxx.r2.dev

   # Webshare Proxy (opsional tapi sangat disarankan)
   WEBSHARE_PROXY_USERNAME=xxx
   WEBSHARE_PROXY_PASSWORD=xxx
   WEBSHARE_PROXY_ENDPOINT=p.webshare.io
   WEBSHARE_PROXY_PORT=80
   ```

3. **Install dependencies** (sekali saja):
   ```bash
   npm install
   ```

---

## 🛡️ Safety: Auto-Batch-Pause (Anti-CDN-Block)

Untuk backfill skala besar (24K+ chapters), tool ini punya **auto-batch-pause** built-in:

| Flag | Default | Fungsi |
|------|---------|--------|
| `--batch-size <n>` | `500` | Pause setiap N manga |
| `--batch-pause <ms>` | `600000` (10min) | Durasi cooldown antar batch |

**Cara kerja:**
1. Setiap 500 manga → save progress + pause 10 menit
2. Memberi CDN server waktu "lupa" pattern request kita
3. Progress tersimpan ke `.import-progress.json` (crash-safe)
4. Skip otomatis pada batch terakhir (tidak waste time)

**Contoh custom:**
```bash
# Pause 5 menit setiap 300 manga (lebih konservatif)
npm run import:local -- auto-update --batch-size 300 --batch-pause 300000

# Disable batch-pause (untuk daily update kecil)
npm run import:local -- auto-update --batch-size 0
```

**Rekomendasi Expert (10 proxy Webshare):**
```bash
# Sweet spot: 7 concurrency × 10 proxy = 0.7 req/IP (aman <5% block rate)
npm run import:local -- auto-update \
  --concurrency 7 \
  --parallel-images 4 \
  --proxy \
  --delay 4000 \
  --batch-size 500 \
  --batch-pause 600000 \
  --resume
```

**5 Lapis Keamanan:**
1. ☕ `caffeinate` auto-start — MacBook tidak sleep
2. 🔄 Proxy rotation — ganti IP setiap 20 request
3. ⏸️ CDN-down detection — 3 smart-skip → pause 5 menit
4. 🛡️ Circuit breaker — 10 error → STOP otomatis
5. 📊 Auto-batch-pause — cooldown 10min setiap 500 manga

---

## 🚀 Quick Start

Buka terminal di folder project, lalu pilih salah satu:

### 1. Import Full (Manga + Chapters + Images)

Untuk manga baru yang belum ada di database — scrape metadata, daftar chapter, download semua gambar, upload ke R2:

```bash
# Default: 3 chapters paralel, 3 image uploads paralel per chapter
npm run import:local -- full --url "https://04x-1s.manhwaland.land/manga/prison-revenge/"

# MAXIMUM SPEED: 10 chapters paralel, 5 image uploads paralel ⚡
npm run import:local -- full --url "..." --concurrency 10 --parallel-images 5
```

### 2. Import Manga Saja (Metadata)

Cepat — hanya metadata (title, cover, synopsis, genres). Tidak download chapter:

```bash
npm run import:local -- manga --url "https://04x-1s.manhwaland.land/manga/prison-revenge/"
```

### 3. Import Chapters Saja (Metadata + Images)

Untuk manga yang **sudah ada** di database tapi belum punya chapter:

```bash
npm run import:local -- chapters --url "https://04x-1s.manhwaland.land/manga/prison-revenge/"
```

### 4. Batch Import dari Sitemap

Scan semua URL manga dari sitemap XML sumber, lalu import satu per satu:

```bash
npm run import:local -- sitemap
```

### 5. 🔄 Auto-Update Chapter Baru (DAILY USE — YANG PALING SERING DIPAKAI)

> ⚠️ **PENTING:** Ini adalah command yang tepat untuk **menambah chapter baru**.
> **JANGAN pakai** `backfill-empty` atau `backfill-all-empty-images` untuk update chapter baru — itu untuk mengisi gambar yang kosong/missing, BUKAN untuk mencari chapter baru.

**Cara kerja `auto-update`:**
1. Scan semua manga di database yang punya `source_url`
2. Cek halaman sumber untuk chapter baru
3. **Skip chapter yang sudah ada** (by source URL) — efisien, tidak re-download
4. Download & upload hanya chapter yang belum ada

```bash
# ⭐ CARA PALING GAMPANG (recommended):
npm run import:local:update

# Dengan proxy (jika IP diblokir CDN):
npm run import:local:update:safe

# Mode cepat (concurrency tinggi):
npm run import:local:update:fast

# Resume jika crash (lanjut dari manga terakhir):
npm run import:local:update:resume
```

**Equivalent manual commands:**
```bash
# Basic auto-update
npm run import:local -- auto-update

# Dengan proxy + batch safety
npm run import:local -- auto-update --proxy --batch-size 50 --batch-pause 300000

# Full config (expert recommendation)
npm run import:local -- auto-update \
  --concurrency 7 \
  --parallel-images 4 \
  --proxy \
  --delay 4000 \
  --batch-size 500 \
  --batch-pause 600000 \
  --resume
```

**Filter manga spesifik:**
```bash
# Hanya manga tertentu (by slug)
npm run import:local -- auto-update --slug "hana-kana"

# Hanya N manga pertama (testing)
npm run import:local -- auto-update --limit 5
```

> 💡 **Bedanya dengan `backfill-empty`:**
> | Command | Fungsi | Use Case |
> |---------|--------|----------|
> | `auto-update` | Cari & download **chapter baru** yang belum ada | Daily update |
> | `backfill-empty` | Isi gambar yang **null/kosong** di chapter yang sudah ada | Fix missing images |
> | `chapters` | Import **semua chapter** dari URL (tidak skip yang sudah ada) | Initial import |

---

## ⚙️ Opsi Lanjutan

### ⚡ Parallel Processing (NEW!)

Tool sekarang memproses **multiple chapters secara paralel** dan **multiple image uploads paralel per chapter**:

| Flag | Default | Max | Description |
|------|---------|-----|-------------|
| `--concurrency <n>` | 3 | **30** | Jumlah chapter diproses paralel |
| `--parallel-images <n>` | 3 | **10** | Jumlah upload R2 paralel per chapter |

```bash
# Fast: 5 chapters paralel, 3 uploads paralel
npm run import:local -- chapters --slug hana --concurrency 5

# MAXIMUM: 15 chapters paralel, 8 uploads paralel (butuh bandwidth besar)
npm run import:local -- auto-update --concurrency 15 --parallel-images 8 --proxy

# Conservative: 2 chapters paralel (untuk koneksi lambat)
npm run import:local -- full --url "..." --concurrency 2 --parallel-images 2
```

**Tips tuning:**
- MacBook M1/M2/M3: aman dengan `--concurrency 10 --parallel-images 5`
- Jika R2 sering timeout: turunkan `--parallel-images 2`
- Jika source CDN rate-limit: tetap `--concurrency 3` tapi naikkan `--delay 5000`
- Browser batch-download tetap 1 per chapter (Playwright), tapi upload ke R2 paralel

### Download dengan Proxy

Jika source CDN memblokir IP Anda, aktifkan proxy pool (Webshare):

```bash
npm run import:local -- full --url "..." --proxy
```

### Batasi Jumlah Chapter

Hanya download N chapter pertama (untuk testing):

```bash
npm run import:local -- full --url "..." --limit 5
```

### Mode Dry-Run (tidak write ke DB)

Cek apa yang akan di-import tanpa benar-benar menyimpan:

```bash
npm run import:local -- full --url "..." --dry-run
```

### Batch Sitemap dengan Filter

Hanya import manga yang belum ada di database:

```bash
npm run import:local -- sitemap --skip-existing
```

---

## 🛡️ Safety & Anti-Block Features (Hardened v2)

### 1. Random Jitter (±30%)
Setiap delay di-randomisasi ±30% untuk menghindari pola robotik:
```
delay 2000ms → actual 1400-2600ms (random)
```

### 2. Domain-Specific Delays
CDN image hosts (gmbr.pro, cdn.scroller) → 800ms
HTML source sites (manhwaland) → 2500ms

### 3. Adaptive Rate Limiting
- 3x HTTP 429/503 berturut-turut → pause 60 detik otomatis
- Single 429/503 → pause 5 detik

### 4. Circuit Breaker
10 consecutive errors → STOP import otomatis (mencegah IP ban)

### 5. Proactive Proxy Rotation
Setiap 20 request → switch IP proxy otomatis (mencegah pattern detection)

### 6. Safety Guard CLI
Bulk import >20 manga tanpa `--proxy` → warning + 5 detik countdown untuk cancel

### 7. Playwright Browser Fallback
CDN yang memblokir undici (TLS fingerprinting, Cloudflare) → auto-fallback ke headless Chromium

### Legacy Features
- **Proxy rotation**: Webshare 10-IP pool dengan auto-cooldown (60s saat 403/429)
- **Direct mode**: IP residensial MacBook jarang diblokir

---

## 📊 Monitoring Progress

Script menampilkan progress real-time di terminal:

```
╔══════════════════════════════════════════════╗
║  🖥️  Manga Zone — Local Import Tool          ║
╚══════════════════════════════════════════════╝

📥 Mode: FULL IMPORT
🔗 URL: https://04x-1s.manhwaland.land/manga/...

✅ Scraping manga metadata...
   Title: Prison Revenge
   Author: ---
   Genres: Drama, Action

📖 Found 42 chapters
📥 Downloading images: [████████░░] 18/42 chapters
🖼️  Uploading to R2:   [██████░░░░] 312/580 images
```

Anda juga bisa monitor via Dashboard admin → **Import** → tab **Riwayat Import Job** (data tersimpan di tabel `import_jobs`).

---

## 🔄 Cron Jobs (Opsional — `launchd` di macOS)

Jalankan auto-update otomatis setiap hari. Buat file:

```bash
cat > ~/Library/LaunchAgents/com.mangazone.import.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mangazone.import</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/mac/VSC Project/Manga Zone/scripts/local-import.mjs</string>
    <string>auto-update</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/manga-import.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/manga-import-error.log</string>
</dict>
</plist>
EOF

# Load the job
launchctl load ~/Library/LaunchAgents/com.mangazone.import.plist
```

Ini akan menjalankan auto-update setiap hari jam **06:00 pagi**. Cek log:

```bash
cat /tmp/manga-import.log
```

---

## 🆚 Local vs Vercel Cron

| Fitur | Vercel Cron | **Local Import (MacBook)** |
|-------|------------|---------------------------|
| Timeout | 10s–300s | **Tidak ada** ⭐ |
| Download gambar paralel | Terbatas | **Full CPU** ⭐ |
| Auto-update harian | ✅ | ✅ (via `launchd`) |
| Bulk import ratusan manga | ❌ timeout | **✅** ⭐ |
| Anti-Hotlink CDN (gmbr.pro) | ❌ Sering 403 | **✅** Browser fallback ⭐ |
| Biaya | Pro plan | **Gratis** ⭐ |
| Monitoring di Dashboard | ✅ | ✅ (tersimpan ke DB) |

---

## 🐛 Troubleshooting

### "Cannot find module" / import errors

```bash
npm install
```

### R2 upload gagal (403 Forbidden)

Cek kredensial R2 di `.env`:
```bash
grep R2_ .env
```

### Source CDN memblokir (403/429)

Cek dulu status CDN source:
```bash
npm run cdn:check:quick    # quick check (1 chapter)
npm run cdn:check          # full check
```

Jika **ISP (Internet Positif)** memblokir source site, script akan menampilkan:
```
🚫 ISP BLOCKED → https://internet-positif.info/...
```

Solusi — aktifkan proxy:
```bash
npm run import:local -- full --url "..." --proxy
```

Atau set `PROXY_LIST` di `.env` jika Webshare rotating endpoint tidak bekerja:
```env
PROXY_LIST=host1:port1:user1:pass1,host2:port2:user2:pass2
```

### Scraping gagal (struktur berubah)

Cek apakah source site mengubah HTML-nya:
```bash
npm run import:local -- manga --url "..." --debug
```

Script akan log HTML response untuk debugging.

---

## 📁 File yang Terlibat

| File | Fungsi |
|------|--------|
| `scripts/local-import.mjs` | Entry point CLI — parsing argumen, dispatch mode |
| `scripts/lib/local-import-utils.mjs` | Shared utilities (env loader, DB helpers, R2 client, scraper wrapper) |
| `src/lib/scrapers/manga-scraper.ts` | Core scraping logic (shared dengan API routes) |
| `src/lib/storage/r2.ts` | R2 upload logic (shared dengan API routes) |
| `src/lib/proxy.ts` | Proxy pool manager (Webshare 10 rotating IPs) |
| `src/components/admin/ImportDashboard.tsx` | Dashboard UI — menampilkan CLI commands dengan tombol Copy |

---

## 💡 Tips Pro

1. **Import massal semalam sekaligus**: Gunakan `sitemap` mode dengan `--skip-existing`, biarkan berjalan semalam.
2. **Simpan session terminal**: Gunakan `tmux` agar proses tidak terputus saat MacBook sleep.
3. **Monitor via Dashboard**: Buka `/admin/import` di browser — progress tersimpan real-time ke tabel `import_jobs`.
4. **Retry yang gagal**: Manga yang gagal tersimpan dengan status `failed` — bisa di-retry via dashboard atau `npm run import:local -- chapters --url "..."`.

---

## 🤖 Otomatisasi dengan PM2 (MacBook sebagai Server)

Daripada mengandalkan Vercel Cron (yang terbatas di 10 menit & cold-start), jalankan **MacBook sebagai worker** menggunakan PM2. Ini lebih powerful: bisa import massal tanpa timeout, scrape paralel, dan auto-restart on crash.

### Setup Sekali Jalan

```bash
npm run setup:local        # install PM2 global, buat logs/ dir, setup launchd auto-start
```

### Jalankan Auto-Importer

```bash
pm2 start ecosystem.config.cjs    # start 2 worker: sitemap-watcher + chapter-checker
pm2 status                        # cek status
pm2 logs                          # realtime logs
pm2 monit                         # dashboard resource (CPU/RAM)
pm2 stop all                      # stop semua
pm2 delete all                    # hapus semua worker
```

### Dua Worker yang Dijalankan PM2

| Worker | Fungsi | Jadwal |
|--------|--------|--------|
| `manga-zone-sitemap-watcher` | Scan sitemap source setiap 10 menit → import manga baru | Continuously looping (10 min interval) |
| `manga-zone-chapter-checker` | Scan semua manga existing → cek chapter baru | Setiap 2 jam (cron restart) |

### Auto-Start saat MacBook Boot

```bash
pm2 startup        # ikuti instruksi (copy-paste command yang di-output)
pm2 save           # simpan konfigurasi saat ini
```

Setelah ini, PM2 akan auto-start saat MacBook menyala — bahkan setelah shutdown/restart.

### Dry-Run Test (lihat tanpa import)

```bash
node scripts/local-sitemap-watcher.mjs --dry-run          # single scan
node scripts/local-sitemap-watcher.mjs --watch --dry-run  # loop mode
```

### Menambah Source Baru

Via API:
```bash
curl -X POST http://localhost:3000/api/v1/admin/sources \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Manhwaland","slug":"manhwaland","sitemap_urls":["https://manhwaland.com/sitemap.xml"],"is_active":true}'
```

Atau via Admin Dashboard → Sources → Add Source.

Snapshot sitemap disimpan di `.sitemap-snapshots/<source-id>.json`.
