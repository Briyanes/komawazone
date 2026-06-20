# Chapter Image Audit & Fix — Final Report

> Date: 2026-06-20
> Status: ✅ All fixes implemented & TypeScript-clean

## 🔍 Root Causes Identified

### 1. **Backfill composite key bug** (CRITICAL)
**File**: `src/app/api/v1/admin/storage/backfill/route.ts`

The old code updated `chapter_images` rows by `image_url` alone:

```ts
// BUG: If the same URL appears in multiple chapters, ALL get overwritten.
//      If the URL has a query string / casing difference, update is a no-op,
//      silently leaving the row pointing to the dead CDN URL.
.update({ image_url: result.url })
.eq('image_url', result.originalUrl)
```

**Fix**: Update by composite key `(chapter_id, number)`:

```ts
.update({ image_url: result.url })
.eq('chapter_id', loc.chapter_id)
.eq('number', loc.number)
```

This is the root cause of *"chapter list shows but reader images are missing/partial"* —
the `chapters` row (thumbnail) was updated but the `chapter_images` rows were silently skipped.

---

### 2. **No proxy for CDN scraping** (BLOCKER)
**Files**: `src/lib/proxy.ts` (new), `src/lib/storage/image-downloader.ts`

Vercel runs on AWS datacenter IPs. Source CDNs (`gmbr.pro`, `manhwaland`, etc.)
block these IPs with 403/429. No proxy = no re-download possible.

**Fix**: New `src/lib/proxy.ts` provides a round-robin pool of 10 Webshare proxy IPs
that automatically rotate on failure. Integrated into `image-downloader.ts`.

---

### 3. **Dead CDN URLs served directly to browser** (PARTIAL IMAGES)
**File**: `src/components/ui/MangaImage.tsx`

Dead CDN URLs (`gmbr.pro`, etc.) were sent directly to the browser.
Browsers from residential IPs sometimes CAN load them (when CDN isn't blocking
that specific ISP), causing partial chapter loads.

**Fix**: `MangaImage` now auto-routes known dead CDN domains through
`/api/proxy/image` which uses the server-side proxy pool.

---

### 4. **R2 image route missing headers** (MINOR)
**File**: `src/app/api/r2/image/[...key]/route.ts`

- `Content-Type` was set explicitly (fine) but response was `new Uint8Array(buffer)`
  which in Next.js 16 / Web Streams is not the correct `BodyInit` type.
- Missing `Content-Length` header.

**Fix**: Wrap buffer in `new Blob([new Uint8Array(buffer)], { type: contentType })`,
add `Content-Length` and `Content-Disposition: inline`.

---

## 📋 Files Changed

| File | Change |
|---|---|
| `src/lib/proxy.ts` | **NEW** — Webshare 10-IP rotating proxy pool |
| `src/lib/storage/image-downloader.ts` | Integrated proxy pool + retry with different IPs |
| `src/components/ui/MangaImage.tsx` | Auto-route dead CDN URLs through `/api/proxy/image` |
| `src/app/api/proxy/image/route.ts` | Dynamic Referer header + proxy support |
| `src/app/api/v1/admin/storage/backfill/route.ts` | **CRITICAL**: composite key `(chapter_id, number)` update |
| `src/app/api/r2/image/[...key]/route.ts` | Blob body + Content-Length + Content-Disposition |
| `scripts/audit-chapters.mjs` | **NEW** — detect empty/broken/duplicate chapters, `--fix` flag |
| `.env.example` | Added `WEBSHARE_PROXY_*` variables |

---

## 🚀 How to Run the Fix

### Step 1: Set environment variables (Vercel + `.env.local`)

```bash
WEBSHARE_PROXY_USERNAME=xxx
WEBSHARE_PROXY_PASSWORD=xxx
WEBSHARE_PROXY_ENDPOINT=p.webshare.io
WEBSHARE_PROXY_PORT=80
```

### Step 2: Audit all chapters

```bash
node scripts/audit-chapters.mjs
```

This will report:
- Empty chapters (0 images)
- Chapters with dead CDN URLs
- Duplicate image URLs across chapters

### Step 3: Fix specific manga

```bash
node scripts/audit-chapters.mjs --manga=from-weakling-to-nemesis --fix
```

### Step 4: Or use admin dashboard

Go to **Admin → Storage Backfill** and trigger backfill per manga.
The fix in `backfill/route.ts` ensures images are correctly persisted to R2
with composite-key updates.

---

## 🏗 Architecture Overview (Correct Flow)

```
┌─────────────────────────────────────────────────────────────┐
│  SOURCE CDN (gmbr.pro, manhwaland, etc.)                    │
│  ↓ blocked for datacenter IPs                               │
├─────────────────────────────────────────────────────────────┤
│  Webshare 10-IP Proxy Pool (src/lib/proxy.ts)               │
│  ↓ rotates IPs on failure                                   │
├─────────────────────────────────────────────────────────────┤
│  image-downloader.ts → fetches image through proxy          │
│  ↓ uploads to R2                                            │
├─────────────────────────────────────────────────────────────┤
│  Cloudflare R2 (manga-covers, chapter-pages, banners)       │
│  ↓ served via /api/r2/image/[...key]                        │
├─────────────────────────────────────────────────────────────┤
│  Reader (ReaderClient.tsx → MangaImage.tsx)                 │
│  ↓ R2 URLs served directly (fast)                           │
│  ↓ Dead CDN URLs routed through /api/proxy/image (fallback) │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Important Notes

1. **Never run backfill without proxy** — it will silently fail on all dead CDN URLs.
2. **The composite-key fix is non-destructive** — it only fixes future backfills.
   For existing corrupted data, run the audit script with `--fix`.
3. **Vercel `maxDuration`** for backfill is 300s (5 min). For large manga,
   the job runs in background via `after()`.
4. **Rate limit on R2 route**: 300 req/min per IP. Sufficient for normal reading.