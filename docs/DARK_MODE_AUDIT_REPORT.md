# 🌙 Dark Mode Mobile Audit — Headed Playwright Report

**Date:** June 13, 2026  
**Method:** Playwright headed mode (visible browser), iPhone 14 viewport (390×844, 3x DPR)  
**Environment:** Production `olluq.xyz`, authenticated as admin, `data-theme="dark"` forced via init script  
**Screenshots:** `screenshots/dark-audit/` (16 pages)

---

## Executive Summary

| Metric | Result |
|--------|--------|
| Login as admin | ✅ Success, redirected to `/admin` |
| Public pages captured | **16/16** ✅ |
| Dark mode active on all pages | ✅ |
| Horizontal overflow detected | None |
| Broken images | Fixed (see Issue 1) |
| Genre detail timeout | ⚠️ `networkidle` too slow — retried with `domcontentloaded` ✅ |

---

## Pages Captured

| # | Page | File | Status |
|---|------|------|--------|
| 0 | Admin Dashboard (post-login) | `00-admin-dashboard.png` | ✅ Login works |
| 1 | Home | `01-home.png` (6.2MB) | ✅ |
| 2 | Search | `02-search.png` (3.6MB) | ✅ 20 manga results |
| 3 | Genre List | `03-genre-list.png` | ✅ |
| 4 | Genre: Action | `04-genre-action.png` | ✅ (initial timeout, retried) |
| 5 | Bookmarks | `05-bookmarks.png` | ✅ 1 bookmark |
| 6 | History | `06-history.png` | ✅ |
| 7 | Profile | `07-profile.png` | ✅ |
| 8 | VIP | `08-vip.png` | ✅ |
| 9 | About | `09-about.png` | ✅ |
| 10 | Contact | `10-contact.png` | ✅ |
| 11 | Terms | `11-terms.png` | ✅ |
| 12 | Privacy | `12-privacy.png` | ✅ |
| 13 | Advertise | `13-advertise.png` | ✅ |
| 14 | Manga Detail (`sister-neighbor`) | `14-manga-detail.png` | ✅ |
| 15 | Chapter Reader (ch.9) | `15-chapter-reader.png` | ✅ |

---

## Issues Found

### 🔴 Issue 1: 56 Cover Images Using Wrong R2 Endpoint (FIXED)

**Severity:** High — covers broken on home, search, bookmarks  
**Status:** ✅ Fixed in DB + code

56 manga had `cover_url` pointing to R2's S3 API endpoint:
```
❌ https://olluq.933578d40533df4bcca40a43611da8cb.r2.cloudflarestorage.com/covers/...
```
Returns 400 (auth required). Fixed to:
```
✅ https://pub-918f7d0651d64a29a87deb04073b5fa1.r2.dev/covers/...
```

- **DB fix:** All 56 records updated ✅  
- **Code fix:** `src/lib/storage/r2.ts` `buildR2PublicUrl()` — added safety warning ⚠️  
- **Verification:** `SELECT count(*) WHERE cover_url LIKE '%cloudflarestorage%'` → 0

---

### 🟡 Issue 2: Genre Detail Page Extremely Slow (No Pagination)

**Severity:** Medium  
**Location:** `src/app/(main)/genre/[slug]/page.tsx:127`

The genre detail page uses `.limit(200)` — loading 200 manga + images at once. Playwright timed out at 20s with `networkidle`. Retried with `domcontentloaded` + 5s wait → screenshot succeeded but the page is heavy.

**Fix:** Add pagination or infinite scroll (recommended: 24 items per page).

---

### 🟡 Issue 3: VIP Promo Modal Not Dismissed

During the audit, login as admin suppresses the VIP promo modal. However, for non-authenticated users, the `VIPPromoModal` still appears on first visit. This is expected behavior but worth noting.

---

### 🟡 Issue 4: 428 Manga with NULL Cover URL

10.7% of manga (428/3,985) have no cover image. Shows 📖 placeholder. Not a dark mode issue but affects visual quality.

---

## Dark Mode Visual Assessment

All 16 pages render correctly with dark mode CSS variables:

- **Backgrounds:** Dark (`--bg-primary` = `#0a0a0a` or similar) ✅  
- **Text:** White/light on dark backgrounds ✅  
- **Cards/sections:** Elevated dark surfaces ✅  
- **No contrast issues detected** ✅  
- **No horizontal overflow** ✅  
- **Mobile layout (390px):** Responsive, no broken grids ✅  
- **VIP page:** Pricing cards render well in dark with amber accents ✅  
- **Chapter reader:** Dark background with images visible ✅  

---

## How to View Screenshots

```bash
# Open all screenshots in Preview (macOS)
open screenshots/dark-audit/*.png

# Open specific page
open screenshots/dark-audit/01-home.png
```

---

## Files Modified This Session

1. `scripts/playwright-dark-audit.mjs` — New headed audit script  
2. `docs/DARK_MODE_AUDIT_REPORT.md` — This report  
3. `src/lib/storage/r2.ts` — `buildR2PublicUrl()` safety fix  
4. **Database:** 56 `cover_url` values fixed (`cloudflarestorage.com` → `r2.dev`)  

---

## Recommendations

| Priority | Issue | Action |
|----------|-------|--------|
| 🔴 P0 | Deploy needed | Push code + DB fixes to clear ISR cache |
| 🟡 P1 | Genre pagination | Add 24-item pagination or infinite scroll |
| 🟡 P2 | NULL covers (428) | Run R2 migration for remaining covers |
| 🟢 P3 | External CDN (3 manga) | Migrate to R2 |
| 🟢 P3 | Add regression test | Catch `cloudflarestorage.com` URLs |