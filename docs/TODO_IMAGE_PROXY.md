# TODO: Image Proxy & Mirror ke Supabase Storage

## Status: BELUM DIKERJAKAN — kerjakan setelah project selesai

## Masalah
Semua gambar (cover manga + halaman chapter) disimpan sebagai URL eksternal di database.
Jika CDN eksternal (jablay.gmbar.xyz, gmbr.pro, dll) mati → semua gambar broken.

## Solusi yang direncanakan
Buat sistem proxy/mirror:
1. Saat user membuka chapter → download halaman dari CDN eksternal → simpan ke Supabase Storage
2. Update database: ganti URL eksternal → URL Supabase Storage milik sendiri
3. Atau: buat `/api/proxy/image?url=...` sebagai fallback jika CDN mati

## Catatan Penting: Biaya Supabase Storage

### Free tier
- Storage: **1 GB** (tidak cukup untuk semua gambar)
- Bandwidth: 2 GB/bulan

### Estimasi kebutuhan storage
- 1907 manga × 1 cover (~200KB) = ~381 MB (cover saja sudah hampir habis free tier)
- Halaman chapter: 1907 manga × ~50 chapter × ~20 halaman × ~200KB = **±380 GB** (sangat besar)

### Opsi berbayar Supabase
| Plan | Harga | Storage |
|------|-------|---------|
| Free | $0 | 1 GB |
| Pro | $25/bulan | 100 GB |
| Pro + tambahan | $25 + $0.021/GB | sesuai kebutuhan |

### Alternatif lebih murah untuk storage besar
- **Cloudflare R2** → $0.015/GB/bulan, **GRATIS egress (bandwidth)**
- **Backblaze B2** → $0.006/GB/bulan (paling murah)
- **Self-hosted VPS** → bayar server sendiri, unlimited storage

## Estimasi Biaya Setahun (380 GB gambar)
| Layanan | Biaya/bulan | Setahun |
|---------|-------------|---------|
| Supabase Free (DB + Auth) | $0 | $0 |
| Cloudflare R2 (storage + ops) | ~$6 | ~$72 |
| Domain (opsional) | ~$1 | ~$12 |
| Vercel Free (hosting) | $0 | $0 |
| **TOTAL** | **~$6/bulan** | **~$72-87/tahun** |

> Catatan: Bandwidth Cloudflare R2 GRATIS (berbeda dengan AWS S3 yang mahal untuk egress)

## Rekomendasi
Untuk proyek besar dengan ratusan GB gambar:
→ Gunakan **Cloudflare R2** (murah + gratis bandwidth) bukan Supabase Storage
→ Supabase tetap dipakai untuk Database & Auth saja

## File terkait
- `next.config.ts` → tambah hostname baru jika ganti CDN
- `src/app/api/proxy/image/` → buat endpoint proxy
