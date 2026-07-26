# 🖥️ VPS Deployment Guide — Manga Zone Import Worker

> **Panduan lengkap** setup VPS agar import manga/chapter jalan 24/7 tanpa MacBook menyala.

---

## 📋 Table of Contents

1. [Rekomendasi VPS](#-rekomendasi-vps)
2. [Order VPS Vultr (Step-by-Step)](#-order-vps-vultr-step-by-step)
3. [Setup SSH Key dari MacBook](#-setup-ssh-key-dari-macbook)
4. [Bootstrap VPS (Sekali Click)](#-bootstrap-vps-sekali-click)
5. [Setup Environment Variables](#-setup-environment-variables)
6. [Deploy Update dari MacBook](#-deploy-update-dari-macbook)
7. [Monitoring & Maintenance](#-monitoring--maintenance)
8. [Troubleshooting](#-troubleshooting)
9. [Cost Breakdown](#-cost-breakdown)
10. [FAQ](#-faq)

---

## 🎯 Rekomendasi VPS

### #1 Vultr High Frequency ⭐⭐⭐ (RECOMMENDED)

| Spec | Value |
|------|-------|
| CPU | 1 vCPU (3+ GHz) |
| RAM | 2 GB |
| Storage | 64 GB NVMe |
| Bandwidth | 2 TB |
| Harga | **$6/bln** (~Rp 95.000) |
| Region | **Singapore** |

**Link Daftar**: https://www.vultr.com/?ref=high-frequency

**Kenapa Vultr HF?**
- ✅ NVMe SSD (10x lebih cepat dari regular SSD untuk download gambar)
- ✅ Region Singapore (latency 20-50ms ke source manga Indonesia)
- ✅ Pay-per-hour (test dulu, hapus kapan saja)
- ✅ API untuk auto-scale kalau perlu

### Alternatif Lain

| Provider | Spec | Harga | Region Asia | Catatan |
|----------|------|-------|-------------|---------|
| Hetzner CX22 | 2vCPU/4GB | €3.79 | ❌ | Paling murah, tapi EU only |
| DigitalOcean | 1vCPU/2GB | $12 | ✅ SGP | UI bagus, tapi 2x Vultr |
| Vultr Regular | 1vCPU/2GB | $5 | ✅ SGP | OK tapi SSD biasa (bukan NVMe) |

---

## 🛒 Order VPS Vultr (Step-by-Step)

### Step 1: Daftar Vultr
1. Buka https://www.vultr.com/?ref=high-frequency
2. Klik **Create Account**
3. Isi email + password
4. Verifikasi email
5. Tambahkan payment method (Credit Card / PayPal / Alipay)

### Step 2: Deploy Server
1. Klik **Products** → **+ Deploy Server**
2. Pilih **High Frequency** (bukan Regular!)
3. Config:
   ```
   Type:        High Frequency
   CPU:         1 vCPU
   RAM:         2 GB
   Storage:     64 GB NVMe
   Bandwidth:   2 TB
   Price:       $6/month
   ```

4. **Region**: Pilih **Singapore**
5. **OS**: Pilih **Debian 12 x64** (stabil & ringan)
6. **Additional Features**:
   - ✅ Enable Auto Backup ($1.20/bln — worth it!)
   - ✅ Enable IPv6

7. **SSH Keys**: Skip dulu (akan setup di step berikutnya)
8. **Server Label**: `manga-zone-sg`
9. Klik **Deploy Now**

### Step 3: Tunggu ~2 menit
- Status akan berubah dari *Installing* → *Running*
- Catat **IP Address** dan **Password** (ada di halaman server detail)

---

## 🔑 Setup SSH Key dari MacBook

Agar bisa SSH tanpa password (dan deploy script jalan otomatis):

### Step 1: Generate SSH Key di MacBook
```bash
# Di MacBook terminal:
ssh-keygen -t ed25519 -C "manga-zone-vps" -f ~/.ssh/manga_zone_vps

# Tekan Enter 2x (kosongkan passphrase untuk automation)
```

### Step 2: Copy SSH Key ke VPS
```bash
# Ganti VPS_IP dengan IP VPS Anda
ssh-copy-id -i ~/.ssh/manga_zone_vps.pub root@VPS_IP
```

### Step 3: Test Login Tanpa Password
```bash
ssh -i ~/.ssh/manga_zone_vps root@VPS_IP
# Harus login tanpa diminta password
```

### Step 4: Setup SSH Config (Opsional, tapi recommended)
```bash
nano ~/.ssh/config
```

Tambahkan:
```
Host manga-vps
    HostName VPS_IP
    User root
    IdentityFile ~/.ssh/manga_zone_vps
```

Sekarang bisa: `ssh manga-vps`

---

## 🚀 Bootstrap VPS (Sekali Click)

Setelah VPS ready dan SSH key setup, jalankan **salah satu** cara berikut:

### Cara A: Otomatis (Recommended)

SSH ke VPS lalu jalankan setup script:
```bash
# SSH ke VPS
ssh root@VPS_IP

# Download & run setup script
curl -sL https://raw.githubusercontent.com/Briyanes/komawazone/main/scripts/setup-vps.sh | bash
```

### Cara B: Manual (Kalau mau kontrol penuh)

```bash
# SSH ke VPS
ssh root@VPS_IP

# Clone repo
git clone https://github.com/Briyanes/komawazone.git /opt/manga-zone
cd /opt/manga-zone

# Jalankan setup
bash scripts/setup-vps.sh
```

### Yang Script Lakukan:

```
✅ Update system (apt upgrade)
✅ Install Node.js 20 LTS
✅ Install PM2 (process manager)
✅ Install Playwright + Chromium
✅ Setup Swap 2GB (mencegah OOM)
✅ Clone repo ke /opt/manga-zone
✅ npm install dependencies
✅ Setup UFW firewall (SSH only)
✅ Konfigurasi PM2 systemd auto-start
⏸️  Pause untuk setup .env
```

---

## ⚙️ Setup Environment Variables

Setup script akan pause dan minta Anda edit `.env`:

```bash
# SSH ke VPS (kalau belum)
ssh root@VPS_IP

# Edit .env
cd /opt/manga-zone
nano .env
```

### Isi yang HARUS diubah:

```env
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...YOUR_KEY...

# ── Cloudflare R2 ──
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_PUBLIC_BASE_URL=https://pub-xxxxx.r2.dev
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://pub-xxxxx.r2.dev

# ── Webshare Proxy (DISARANKAN) ──
WEBSHARE_PROXY_USERNAME=your_proxy_username
WEBSHARE_PROXY_PASSWORD=your_proxy_password
```

**Cara dapat credentials:**
- **Supabase**: Dashboard → Project Settings → API
- **R2**: Cloudflare Dashboard → R2 → Manage R2 API Tokens
- **Webshare**: https://proxy.webshare.io → Dashboard → Proxy → API

Save (`Ctrl+O`, `Enter`) lalu keluar (`Ctrl+X`).

### Lanjutkan Setup

```bash
# Re-run setup untuk start PM2
bash scripts/setup-vps.sh
```

Script akan:
1. Validasi `.env` (tidak boleh ada placeholder)
2. Start 3 PM2 workers
3. Setup auto-start on reboot
4. Tampilkan status

---

## 📤 Deploy Update dari MacBook

Setelah Anda edit code di MacBook dan push ke GitHub, update VPS dengan:

```bash
# Di MacBook:
./scripts/deploy-to-vps.sh root@VPS_IP
```

**Atau** tambahkan ke `.env` MacBook:
```env
VPS_SSH_HOST=VPS_IP_ANDA
VPS_SSH_USER=root
```

Lalu cukup:
```bash
./scripts/deploy-to-vps.sh
```

### Yang Deploy Script Lakukan:

```
1. Test SSH connection
2. git pull origin main (di VPS)
3. npm ci (jika package-lock berubah)
4. pm2 reload (zero-downtime restart)
5. Tampilkan status PM2
```

---

## 📊 Monitoring & Maintenance

### Cek Status Workers
```bash
ssh root@VPS_IP "pm2 list"
```

Output:
```
┌────┬───────────────────────┬─────────────┬───────────┐
│ id│ name                  │ status      │ cpu/memory│
├────┼───────────────────────┼─────────────┼───────────┤
│ 0 │ vps-sitemap-watcher   │ online ✅   │ 2% / 120MB│
│ 1 │ vps-chapter-checker   │ online ✅   │ 5% / 300MB│
│ 2 │ vps-thumbnail-fixer   │ online ✅   │ 0% / 150MB│
└────┴───────────────────────┴─────────────┴───────────┘
```

### Realtime Logs
```bash
# Semua logs
ssh root@VPS_IP "pm2 logs"

# Worker tertentu
ssh root@VPS_IP "pm2 logs vps-sitemap-watcher"

# Log error saja
ssh root@VPS_IP "pm2 logs --err"
```

### Dashboard Interaktif
```bash
ssh root@VPS_IP
pm2 monit
```
Tekan `Ctrl+C` untuk keluar.

### Restart Workers
```bash
ssh root@VPS_IP "pm2 restart all"           # restart semua
ssh root@VPS_IP "pm2 restart vps-chapter-checker"  # restart satu
```

### Cek Disk Usage
```bash
ssh root@VPS_IP "df -h"
```

### Bersihkan Log Lama
```bash
ssh root@VPS_IP "cd /opt/manga-zone && pm2 flush"
```

---

## 🔧 Troubleshooting

### ❌ Worker Crash / Error

**Cek log error:**
```bash
ssh root@VPS_IP "pm2 logs --err --lines 50"
```

**Common causes:**
1. **`.env` salah** → validasi credentials
2. **Supabase rate limit** → kurangi `IMPORT_CONCURRENCY` di `.env`
3. **R2 upload gagal** → cek R2 credentials & bucket name

### ❌ OOM (Out of Memory)

**Gejala**: Worker restart terus-menerus, log ada "JavaScript heap out of memory"

**Solusi:**
```bash
ssh root@VPS_IP

# Cek RAM
free -h

# Cek swap
swapon --show

# Kalau swap belum ada, buat:
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

### ❌ Banyak 403 Forbidden

**Gejala**: Log penuh dengan "403 Forbidden" atau "429 Too Many Requests"

**Artinya**: IP VPS Anda diblokir CDN source manga.

**Solusi:**
1. **Pastikan Webshare proxy aktif:**
   ```bash
   ssh root@VPS_IP
   cd /opt/manga-zone
   grep WEBSHARE .env
   ```

2. **Test proxy:**
   ```bash
   ssh root@VPS_IP "curl -x http://username:password@p.webshare.io:80 http://ipinfo.io/json"
   ```

3. **Kalau proxy OK tapi masih 403** → source memblokir berat. Pakai Playwright mode:
   ```env
   USE_PLAYWRIGHT_FALLBACK=true
   ```

### ❌ Disk Full

**Cek:**
```bash
ssh root@VPS_IP "df -h"
```

**Bersihkan:**
```bash
ssh root@VPS_IP
cd /opt/manga-zone
pm2 flush              # hapus log PM2
rm -rf logs/*.log      # hapus log file
apt-get clean          # hapus apt cache
docker system prune -f # kalau ada docker (seharusnya tidak)
```

### ❌ VPS Tidak Bisa SSH

1. **Cek di Vultr dashboard** → server status *Running*?
2. **Console access**: Vultr → Server → **View Console** (KVM)
3. **Firewall block**: Reboot VPS dari Vultr dashboard
4. **Rebuild**: Delete server → deploy ulang (data R2/Supabase tetap aman)

---

## 💰 Cost Breakdown

### Setup Awal
| Item | Biaya |
|------|-------|
| Vultr account | Gratis |
| SSH key | Gratis |
| Setup script | Gratis |

### Bulanan
| Item | Biaya | Wajib? |
|------|-------|--------|
| **Vultr HF Singapore** | $6/bln | ✅ Wajib |
| Vultr Auto Backup | $1.20/bln | ⚠️ Opsional (recommended) |
| **Webshare Proxy** | $2.99/bln | ⚠️ Opsional (recommended) |
| **Total Minimum** | **$6/bln** | |
| **Total Recommended** | **$10.19/bln** | |

**Rp 160.000/bulan** untuk import 24/7 tanpa MacBook menyala.

### Kalau Scale Up (Masa Depan)
| Level | Spec | Harga | Kapasitas |
|-------|------|-------|-----------|
| Starter | 1vCPU/2GB | $6 | 50-100 manga/day |
| Pro | 2vCPU/4GB | $24 | 200-500 manga/day |
| Enterprise | 4vCPU/8GB | $48 | 1000+ manga/day |

---

## ❓ FAQ

### Q: Apakah MacBook version tetap berfungsi?
**A: Ya!** MacBook version (`ecosystem.config.cjs`) dan VPS version (`ecosystem.vps.config.cjs`) terpisah. Anda bisa pakai keduanya atau salah satu.

### Q: Bisakah pindah dari MacBook ke VPS tanpa downtime?
**A: Bisa.** Karena data tersimpan di Supabase & R2 (bukan di MacBook/VPS), pindah platform tidak kehilangan data apa pun.

### Q: Apakah perlu domain untuk VPS?
**A: Tidak.** VPS hanya untuk import worker (background job). Website tetap jalan di Vercel. VPS diakses via SSH saja.

### Q: Bisakah pakai VPS gratis (Oracle Cloud)?
**A: Bisa**, tapi Oracle Cloud Free Tier (ARM) sering ada di region US/Eropa → latency tinggi ke source Asia. Untuk production, Vultr SG $6 lebih reliable.

### Q: Bagaimana kalau VPS kena block total?
**A:** 3 opsi:
1. Ganti region Vultr (snapshot → recreate di region lain)
2. Tambah Webshare proxy ($3/bln) untuk 10 IP rotating
3. Hybrid mode: VPS untuk monitoring + MacBook untuk import berat

### Q: Bisakah auto-scale VPS?
**A:** Vultr mendukung snapshot & resize. Kalau perlu upgrade:
1. Vultr Dashboard → Server → **Resize** (butuh reboot)
2. Atau buat server baru di region lain → deploy ulang

---

## 📞 Quick Reference

```bash
# ── Setup baru ──
ssh root@VPS_IP
bash scripts/setup-vps.sh

# ── Deploy update ──
./scripts/deploy-to-vps.sh root@VPS_IP

# ── Cek status ──
ssh root@VPS_IP "pm2 list"

# ── Lihat logs ──
ssh root@VPS_IP "pm2 logs"

# ── Restart workers ──
ssh root@VPS_IP "pm2 restart all"

# ── Stop semua ──
ssh root@VPS_IP "pm2 stop all"

# ── Hapus VPS (kalau mau berhenti) ──
# Vultr Dashboard → Server → Destroy
```

---

**Last updated**: 2026-07-26
**Maintainer**: Manga Zone Team