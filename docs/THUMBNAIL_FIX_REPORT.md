# Thumbnail Fix Report — 19 Juni 2026 (Final Update)

## Problem
User melaporkan thumbnail rusak di `https://olluq.xyz/manga/hanas-demons-of-lust`.

## Root Cause
File `.env.local` memiliki **missing newline** antara `R2_PUBLIC_BASE_URL` dan `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, menyebabkan kedua variabel menyatu:

```
# SEBELUM (corrupted):
R2_PUBLIC_BASE_URL=https://pub-xxx.r2.devNEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev
```

Akibatnya, setiap URL yang dibangun menggunakan `R2_BASE` menjadi rusak:
```
# URL yang dihasilkan (corrupted):
https://pub-xxx.r2.devNEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev/chapters/abc/001.jpg
```

## Pola Korupsi yang Ditemukan
1. **Single corruption**: `NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://...r2.dev/chapters/...`
2. **Double corruption**: `https://...r2.devNEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://...r2.dev/chapters/...`

## Scope of Damage & Fixes (Final)

| Masalah | Jumlah Diperbaiki | Status |
|---------|-------------------|--------|
| Corrupted chapter_images (single + double) | ~5,550 | ✅ FIXED |
| Corrupted chapter thumbnails | ~93 | ✅ FIXED |
| **Total corrupted URLs fixed** | **~5,640** | ✅ **0 remaining** |

### Hana's Demons of Lust (Audit Lengkap)
- **97/97 chapters** — semua thumbnail valid ✅
- Thumbnail menggunakan **5th image** (gambar ke-5 teratas) ✅
- 3 chapters di R2 CDN, 94 chapters di gmbr.pro (external, valid)

## Status Database (Final)
- ✅ **Corrupted URLs (NEXT_PUBLIC pattern): 0** — SEMUA sudah bersih
- ✅ **Hana's Demons of Lust: 97/97 chapters OK**
- ⚠️ **3,185 chapters dengan NULL thumbnail** — ini adalah chapters yang memiliki **0 images** di database (chapter diimport tapi gambarnya belum didownload). Ini adalah masalah terpisah dari korupsi URL.

## Fixes Applied

### 1. `.env.local` — Fixed
Menambahkan newline yang hilang antara kedua variabel.

### 2. `scripts/fix-corrupted-urls-fast.mjs` — Rewritten (v2)
Targeted fixer yang langsung query rows corrupted (tanpa JOIN berat):
- Step 1: Fix `chapter_images` WHERE `image_url LIKE '%NEXT_PUBLIC%'`
- Step 2: Fix `chapters` WHERE `thumbnail_url LIKE '%NEXT_PUBLIC%'`
- Step 3: Fix `chapters` WHERE `thumbnail_url IS NULL` (set ke 5th image)
- **Double-corruption support**: `sanitizeCorruptedR2Url()` menangani pola `r2.devNEXT_PUBLIC...`
- **Fixed pagination**: Selalu query dari offset 0 karena fixed rows shift
- **Fixed gmbr.pro skip bug**: Hanya skip jika URL benar-benar corrupted, bukan external valid

### 3. `scripts/fix-all-thumbnails.mjs` — Updated
- Corruption validation guard + auto-repair
- Pagination untuk 16,764+ chapters
- Inline R2 migration

### 4. `scripts/migrate-images-to-r2.mjs` — Updated
Auto-update `thumbnail_url` setelah chapter images di-migrate ke R2.

## Prevention
1. Corruption validation guard mencegah script berjalan dengan `.env` yang rusak
2. `sanitizeCorruptedR2Url()` auto-repair jika corruption terjadi lagi
3. Image proxy route (`/api/r2/image/[...key]`) sudah me-validasi URL

## Scripts Reference
```bash
# Fix corruption saja (fast, tanpa JOIN):
node --env-file=.env.local scripts/fix-corrupted-urls-fast.mjs

# Fix semua thumbnail issues (comprehensive, dengan R2 migration):
node --env-file=.env.local scripts/fix-all-thumbnails.mjs

# Fix specific manga:
node --env-file=.env.local scripts/fix-all-thumbnails.mjs --manga=SLUG

# Dry run:
node --env-file=.env.local scripts/fix-all-thumbnails.mjs --dry-run