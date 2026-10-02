-- =====================================================================
-- Migration 057: Serve R2 images via the custom domain cdn.olluq.xyz
-- =====================================================================
--
-- Rewrites BOTH legacy URL formats to direct CDN URLs:
--   https://pub-*.r2.dev/<key>                          → https://cdn.olluq.xyz/<key>
--   https://<acct>.r2.cloudflarestorage.com/<bucket>/<key> → https://cdn.olluq.xyz/<key>
--   /api/r2/image/<key>                                  → https://cdn.olluq.xyz/<key>
--
-- Why:
--   * pub-*.r2.dev is rate-limited (officially dev-only) and unreliable.
--   * /api/r2/image/ proxy burns a Vercel function invocation + bandwidth
--     on EVERY page view. The custom domain is served straight from the
--     Cloudflare edge with immutable caching and free egress.
--
-- Idempotent: rows already on cdn.olluq.xyz match no WHERE clause below.
-- NOTE: full URLs are ~50 bytes/row larger than proxy paths (~27MB across
-- 545K rows) — accepted trade-off for zero function cost.

-- ── manga.cover_url ─────────────────────────────────────────────────
UPDATE manga
SET cover_url = 'https://cdn.olluq.xyz/' || regexp_replace(cover_url, '^https?://[^/]+', '')
WHERE cover_url LIKE 'https://%.r2.dev/%';

UPDATE manga
SET cover_url = 'https://cdn.olluq.xyz/' || regexp_replace(cover_url, '^https?://[^/]+/[^/]+', '')
WHERE cover_url LIKE 'https://%.r2.cloudflarestorage.com/%';

UPDATE manga
SET cover_url = 'https://cdn.olluq.xyz/' || substr(cover_url, length('/api/r2/image/') + 1)
WHERE cover_url LIKE '/api/r2/image/%';

-- ── manga.banner_url ────────────────────────────────────────────────
UPDATE manga
SET banner_url = 'https://cdn.olluq.xyz/' || regexp_replace(banner_url, '^https?://[^/]+', '')
WHERE banner_url LIKE 'https://%.r2.dev/%';

UPDATE manga
SET banner_url = 'https://cdn.olluq.xyz/' || regexp_replace(banner_url, '^https?://[^/]+/[^/]+', '')
WHERE banner_url LIKE 'https://%.r2.cloudflarestorage.com/%';

UPDATE manga
SET banner_url = 'https://cdn.olluq.xyz/' || substr(banner_url, length('/api/r2/image/') + 1)
WHERE banner_url LIKE '/api/r2/image/%';

-- ── chapters.thumbnail_url ──────────────────────────────────────────
UPDATE chapters
SET thumbnail_url = 'https://cdn.olluq.xyz/' || regexp_replace(thumbnail_url, '^https?://[^/]+', '')
WHERE thumbnail_url LIKE 'https://%.r2.dev/%';

UPDATE chapters
SET thumbnail_url = 'https://cdn.olluq.xyz/' || regexp_replace(thumbnail_url, '^https?://[^/]+/[^/]+', '')
WHERE thumbnail_url LIKE 'https://%.r2.cloudflarestorage.com/%';

UPDATE chapters
SET thumbnail_url = 'https://cdn.olluq.xyz/' || substr(thumbnail_url, length('/api/r2/image/') + 1)
WHERE thumbnail_url LIKE '/api/r2/image/%';

-- ── chapter_images.image_url ────────────────────────────────────────
UPDATE chapter_images
SET image_url = 'https://cdn.olluq.xyz/' || regexp_replace(image_url, '^https?://[^/]+', '')
WHERE image_url LIKE 'https://%.r2.dev/%';

UPDATE chapter_images
SET image_url = 'https://cdn.olluq.xyz/' || regexp_replace(image_url, '^https?://[^/]+/[^/]+', '')
WHERE image_url LIKE 'https://%.r2.cloudflarestorage.com/%';

UPDATE chapter_images
SET image_url = 'https://cdn.olluq.xyz/' || substr(image_url, length('/api/r2/image/') + 1)
WHERE image_url LIKE '/api/r2/image/%';

-- ── Verification (run separately) ───────────────────────────────────
-- SELECT
--   count(*) FILTER (WHERE cover_url LIKE 'https://%.r2.dev/%' OR cover_url LIKE '/api/r2/image/%') AS manga_old,
--   count(*) FILTER (WHERE cover_url LIKE 'https://cdn.olluq.xyz/%') AS manga_cdn
-- FROM manga;
--
-- SELECT
--   count(*) FILTER (WHERE thumbnail_url LIKE 'https://%.r2.dev/%' OR thumbnail_url LIKE '/api/r2/image/%') AS ch_old,
--   count(*) FILTER (WHERE thumbnail_url LIKE 'https://cdn.olluq.xyz/%') AS ch_cdn
-- FROM chapters;
--
-- SELECT
--   count(*) FILTER (WHERE image_url LIKE 'https://%.r2.dev/%' OR image_url LIKE '/api/r2/image/%') AS ci_old,
--   count(*) FILTER (WHERE image_url LIKE 'https://cdn.olluq.xyz/%') AS ci_cdn
-- FROM chapter_images;
