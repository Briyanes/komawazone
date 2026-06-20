-- =====================================================================
-- Migration 036: Rewrite dead `pub-*.r2.dev` URLs to `/api/r2/image/`
-- =====================================================================
--
-- Background:
--   Cloudflare disabled the pub-*.r2.dev public subdomain.
--   Every URL pointing there now returns 404.
--   The app has an internal proxy at /api/r2/image/[...key] that reads
--   directly from the R2 bucket — fast, reliable, no external dependency.
--
-- This migration rewrites ALL stale URLs in one pass (server-side = instant).
--
-- Pattern:
--   https://pub-918f7d0651d64a29a87deb04073b5fa1.r2.dev/chapters/uuid/5.jpg
--   → /api/r2/image/chapters/uuid/5.jpg
--
-- Also handles r2.cloudflarestorage.com URLs (strips the bucket name prefix).
-- =====================================================================

BEGIN;

-- ── manga.cover_url ──────────────────────────────────────────────────
UPDATE manga
SET cover_url = regexp_replace(
    cover_url,
    '^https://[^/]+\.r2\.dev/',
    '/api/r2/image/'
)
WHERE cover_url LIKE 'https://%.r2.dev/%'
  AND cover_url NOT LIKE '/api/r2/image/%';

-- ── manga.banner_url ─────────────────────────────────────────────────
UPDATE manga
SET banner_url = regexp_replace(
    banner_url,
    '^https://[^/]+\.r2\.dev/',
    '/api/r2/image/'
)
WHERE banner_url LIKE 'https://%.r2.dev/%'
  AND banner_url NOT LIKE '/api/r2/image/%';

-- ── chapters.thumbnail_url ───────────────────────────────────────────
UPDATE chapters
SET thumbnail_url = regexp_replace(
    thumbnail_url,
    '^https://[^/]+\.r2\.dev/',
    '/api/r2/image/'
)
WHERE thumbnail_url LIKE 'https://%.r2.dev/%'
  AND thumbnail_url NOT LIKE '/api/r2/image/%';

-- ── chapter_images.image_url ─────────────────────────────────────────
UPDATE chapter_images
SET image_url = regexp_replace(
    image_url,
    '^https://[^/]+\.r2\.dev/',
    '/api/r2/image/'
)
WHERE image_url LIKE 'https://%.r2.dev/%'
  AND image_url NOT LIKE '/api/r2/image/%';

-- ── Also handle r2.cloudflarestorage.com URLs (strip bucket name) ─────
UPDATE manga
SET cover_url = '/api/r2/image/' || split_part(
    regexp_replace(cover_url, '^https://[^/]+\.r2\.cloudflarestorage\.com/', ''),
    '/',
    2
) || '/' || split_part(
    regexp_replace(cover_url, '^https://[^/]+\.r2\.cloudflarestorage\.com/([^/]+)/', ''),
    '/',
    1
)
WHERE cover_url LIKE 'https://%.r2.cloudflarestorage.com/%'
  AND cover_url NOT LIKE '/api/r2/image/%';

COMMIT;

-- ── Verification queries (run separately to check) ───────────────────
-- SELECT COUNT(*) AS remaining_r2_dev_covers
-- FROM manga WHERE cover_url LIKE 'https://%.r2.dev/%';
--
-- SELECT COUNT(*) AS remaining_r2_dev_thumbs
-- FROM chapters WHERE thumbnail_url LIKE 'https://%.r2.dev/%';
--
-- SELECT COUNT(*) AS remaining_r2_dev_pages
-- FROM chapter_images WHERE image_url LIKE 'https://%.r2.dev/%';