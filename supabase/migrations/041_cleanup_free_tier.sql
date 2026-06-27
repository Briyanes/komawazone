-- ============================================================================
-- Migration 041: Cleanup & Optimize for Supabase Free Tier (v3 — Bulletproof)
-- ============================================================================
-- Uses EXECUTE dynamic SQL inside DO blocks so PostgreSQL does NOT
-- compile-time validate column references. This prevents errors when
-- tables/columns don't exist in your schema.
-- ============================================================================

BEGIN;

-- ─── 1. Delete chapter_images for soft-deleted chapters ───────────────────
DELETE FROM chapter_images
WHERE chapter_id IN (
  SELECT id FROM chapters WHERE deleted_at IS NOT NULL
);

DELETE FROM chapter_images
WHERE chapter_id IN (
  SELECT c.id
  FROM chapters c
  JOIN manga m ON c.manga_id = m.id
  WHERE m.deleted_at IS NOT NULL
);

-- ─── 2. Soft-delete chapters for soft-deleted manga ──────────────────────
UPDATE chapters
SET deleted_at = NOW()
WHERE manga_id IN (
  SELECT id FROM manga WHERE deleted_at IS NOT NULL
)
AND deleted_at IS NULL;

-- ─── 3. Permanently delete manga soft-deleted >30 days ago ────────────────
DELETE FROM chapter_images
WHERE chapter_id IN (
  SELECT c.id FROM chapters c
  JOIN manga m ON c.manga_id = m.id
  WHERE m.deleted_at IS NOT NULL
  AND m.deleted_at < NOW() - INTERVAL '30 days'
);

DELETE FROM chapters
WHERE manga_id IN (
  SELECT id FROM manga WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '30 days'
);

DELETE FROM manga
WHERE deleted_at IS NOT NULL
AND deleted_at < NOW() - INTERVAL '30 days';

-- ─── 4. Normalize image URLs to short paths ───────────────────────────────
UPDATE chapter_images
SET image_url = REPLACE(
  image_url,
  'https://olluq.xyz/api/r2/image/',
  '/api/r2/image/'
)
WHERE image_url LIKE 'https://olluq.xyz/api/r2/image/%';

UPDATE chapter_images
SET image_url = REPLACE(
  image_url,
  'https://www.olluq.xyz/api/r2/image/',
  '/api/r2/image/'
)
WHERE image_url LIKE 'https://www.olluq.xyz/api/r2/image/%';

UPDATE chapters
SET thumbnail_url = REPLACE(
  thumbnail_url,
  'https://olluq.xyz/api/r2/image/',
  '/api/r2/image/'
)
WHERE thumbnail_url LIKE 'https://olluq.xyz/api/r2/image/%';

UPDATE chapters
SET thumbnail_url = REPLACE(
  thumbnail_url,
  'https://www.olluq.xyz/api/r2/image/',
  '/api/r2/image/'
)
WHERE thumbnail_url LIKE 'https://www.olluq.xyz/api/r2/image/%';

UPDATE manga
SET cover_url = REPLACE(
  cover_url,
  'https://olluq.xyz/api/r2/image/',
  '/api/r2/image/'
)
WHERE cover_url LIKE 'https://olluq.xyz/api/r2/image/%';

UPDATE manga
SET cover_url = REPLACE(
  cover_url,
  'https://www.olluq.xyz/api/r2/image/',
  '/api/r2/image/'
)
WHERE cover_url LIKE 'https://www.olluq.xyz/api/r2/image/%';

UPDATE manga
SET banner_url = REPLACE(
  banner_url,
  'https://olluq.xyz/api/r2/image/',
  '/api/r2/image/'
)
WHERE banner_url LIKE 'https://olluq.xyz/api/r2/image/%';

COMMIT;

-- ─── 5. Delete old notifications (bulletproof — uses `read` boolean) ─────
-- Your schema: read (boolean), created_at (timestamp)
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'notifications table does not exist — skipped';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'read'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'DELETE FROM notifications WHERE read = true AND created_at < NOW() - INTERVAL ''7 days''';
    EXECUTE 'DELETE FROM notifications WHERE created_at < NOW() - INTERVAL ''30 days''';
    RAISE NOTICE 'notifications cleanup done';
  ELSE
    RAISE NOTICE 'notifications missing read or created_at — skipped';
  END IF;
END $$;

-- ─── 6. Delete old import_jobs (bulletproof — auto-detect timestamp col) ─
DO $$
DECLARE
  ts_col text;
BEGIN
  IF to_regclass('public.import_jobs') IS NULL THEN
    RAISE NOTICE 'import_jobs table does not exist — skipped';
    RETURN;
  END IF;

  SELECT column_name INTO ts_col
  FROM information_schema.columns
  WHERE table_name = 'import_jobs'
    AND column_name IN ('created_at', 'started_at', 'updated_at', 'queued_at')
  ORDER BY array_position(array['created_at','started_at','updated_at','queued_at'], column_name)
  LIMIT 1;

  IF ts_col IS NULL THEN
    -- No timestamp column at all — just delete by status with a row cap
    EXECUTE 'DELETE FROM import_jobs WHERE ctid IN (SELECT ctid FROM import_jobs WHERE status IN (''completed'',''failed'',''cancelled'') LIMIT 500)';
    RAISE NOTICE 'import_jobs cleanup done (no timestamp — capped 500 rows)';
  ELSE
    EXECUTE format(
      'DELETE FROM import_jobs WHERE status IN (''completed'',''failed'',''cancelled'') AND %I < NOW() - INTERVAL ''14 days''',
      ts_col
    );
    RAISE NOTICE 'import_jobs cleanup done using column %', ts_col;
  END IF;
END $$;

-- ─── 7. Delete old file_assets (bulletproof — only filter by created_at) ──
DO $$
BEGIN
  IF to_regclass('public.file_assets') IS NULL THEN
    RAISE NOTICE 'file_assets table does not exist — skipped';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'file_assets' AND column_name = 'created_at'
  ) THEN
    -- Only filter by created_at to avoid referencing entity_type/entity_id
    -- which may not exist in your schema
    EXECUTE 'DELETE FROM file_assets WHERE created_at < NOW() - INTERVAL ''30 days''';
    RAISE NOTICE 'file_assets cleanup done';
  ELSE
    RAISE NOTICE 'file_assets has no created_at — skipped';
  END IF;
END $$;

-- ─── 8. Delete old daily_stats (bulletproof) ──────────────────────────────
DO $$
DECLARE
  date_col text;
BEGIN
  IF to_regclass('public.daily_stats') IS NULL THEN
    RAISE NOTICE 'daily_stats table does not exist — skipped';
    RETURN;
  END IF;

  SELECT column_name INTO date_col
  FROM information_schema.columns
  WHERE table_name = 'daily_stats'
    AND column_name IN ('date', 'created_at', 'day')
  LIMIT 1;

  IF date_col IS NOT NULL THEN
    EXECUTE format(
      'DELETE FROM daily_stats WHERE %I < (NOW() - INTERVAL ''90 days'')',
      date_col
    );
    RAISE NOTICE 'daily_stats cleanup done using %', date_col;
  ELSE
    RAISE NOTICE 'daily_stats has no date column — skipped';
  END IF;
END $$;

-- ─── 9. Verify results ────────────────────────────────────────────────────
SELECT 'chapter_images' AS table_name, count(*) AS rows FROM chapter_images
UNION ALL
SELECT 'chapters (active)', count(*) FROM chapters WHERE deleted_at IS NULL
UNION ALL
SELECT 'manga (active)', count(*) FROM manga WHERE deleted_at IS NULL
UNION ALL
SELECT 'notifications', count(*) FROM notifications;