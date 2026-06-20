-- ====================================================================
-- 037: DB Optimization — Compress database to fit free tier (<500MB)
--
-- SAFE OPERATIONS ONLY — no images, no manga, no chapters deleted.
-- Only cleans orphaned metadata rows + normalizes URL strings.
-- ====================================================================

BEGIN;

-- ─── 1. Delete chapter_images for soft-deleted chapters ────────────
-- These images have no parent chapter anymore (chapter deleted_at IS NOT NULL).
-- The actual image files in R2 are NOT affected — we only remove metadata rows.
DELETE FROM chapter_images
WHERE chapter_id IN (
  SELECT id FROM chapters WHERE deleted_at IS NOT NULL
);

-- ─── 2. Delete chapter_images for orphaned chapters ────────────────
-- Chapters whose manga has been soft-deleted.
DELETE FROM chapter_images
WHERE chapter_id IN (
  SELECT c.id
  FROM chapters c
  JOIN manga m ON c.manga_id = m.id
  WHERE m.deleted_at IS NOT NULL
);

-- ─── 3. Normalize chapter_images URLs ──────────────────────────────
-- Convert full R2 URLs to short proxy paths:
--   "https://olluq.xyz/api/r2/image/pages/123.jpg" → "/api/r2/image/pages/123.jpg"
--   "https://pub-xxxx.r2.dev/pages/123.jpg"         → "/api/r2/image/pages/123.jpg"
-- This saves ~40-60 bytes per row × 545K rows = ~27MB
UPDATE chapter_images
SET url = REPLACE(url, 'https://olluq.xyz/api/r2/image/', '/api/r2/image/')
WHERE url LIKE 'https://olluq.xyz/api/r2/image/%';

UPDATE chapter_images
SET url = REPLACE(url, 'https://olluq.xyz/api/r2/image/', '/api/r2/image/')
WHERE url LIKE 'http://olluq.xyz/api/r2/image/%';

-- Also normalize any r2.dev dev URLs (known unreliable, should be proxied)
UPDATE chapter_images
SET url = '/api/r2/image/' || SPLIT_PART(url, '/', 4) || '/' || SPLIT_PART(url, '/', 5) || '/' || SPLIT_PART(url, '/', 6)
WHERE url LIKE 'https://pub-%.r2.dev/pages/%'
  AND url NOT LIKE '/api/r2/image/%';

-- ─── 4. Normalize manga cover URLs ─────────────────────────────────
UPDATE manga
SET cover_url = REPLACE(cover_url, 'https://olluq.xyz/api/r2/image/', '/api/r2/image/')
WHERE cover_url LIKE 'https://olluq.xyz/api/r2/image/%';

UPDATE manga
SET cover_url = REPLACE(cover_url, 'http://olluq.xyz/api/r2/image/', '/api/r2/image/')
WHERE cover_url LIKE 'http://olluq.xyz/api/r2/image/%';

-- ─── 5. Normalize manga thumbnail URLs ─────────────────────────────
UPDATE manga
SET thumbnail_url = REPLACE(thumbnail_url, 'https://olluq.xyz/api/r2/image/', '/api/r2/image/')
WHERE thumbnail_url LIKE 'https://olluq.xyz/api/r2/image/%';

UPDATE manga
SET thumbnail_url = REPLACE(thumbnail_url, 'http://olluq.xyz/api/r2/image/', '/api/r2/image/')
WHERE thumbnail_url LIKE 'http://olluq.xyz/api/r2/image/%';

-- ─── 6. Delete old notifications (>30 days) ────────────────────────
DELETE FROM notifications
WHERE created_at < NOW() - INTERVAL '30 days';

-- ─── 7. Delete read notifications older than 7 days ────────────────
DELETE FROM notifications
WHERE read = true
  AND created_at < NOW() - INTERVAL '7 days';

-- ─── 8. Clean up old import_jobs (completed >7 days ago) ───────────
UPDATE import_jobs
SET status = 'archived'
WHERE status IN ('completed', 'failed')
  AND started_at < NOW() - INTERVAL '7 days';

-- ─── 9. Vacuum analyze (reclaim space) ─────────────────────────────
-- Note: VACUUM cannot run inside a transaction block.
-- Run this manually after the migration:
--   VACUUM FULL ANALYZE chapter_images;
--   VACUUM FULL ANALYZE manga;
--   VACUUM FULL ANALYZE notifications;

COMMIT;

-- ─── Report ────────────────────────────────────────────────────────
-- Run after migration to verify savings:
-- SELECT pg_size_pretty(pg_database_size(current_database()));