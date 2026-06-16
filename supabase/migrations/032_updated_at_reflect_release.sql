-- ============================================================
-- 032: Fix manga.updated_at to reflect chapter release_date
-- ============================================================
-- PROBLEM:
--   1. The generic set_updated_at() trigger (from 001_initial_schema.sql)
--      ALWAYS sets updated_at = NOW() on every UPDATE, overriding any
--      explicit value we set (e.g., during backfill).
--   2. The on_chapter_insert trigger (from 029) set updated_at = NOW()
--      instead of the actual chapter release_date.
--
-- SOLUTION:
--   1. Make set_updated_at() smart — only auto-set NOW() if the UPDATE
--      didn't explicitly change updated_at.
--   2. Make update_manga_timestamp() use the chapter's release_date.
--   3. Backfill existing manga with latest chapter release_date.

-- Step 1: Make set_updated_at() respect explicit updated_at values
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only auto-set updated_at to NOW() if it wasn't explicitly changed
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- Step 2: Make on_chapter_insert trigger use release_date
CREATE OR REPLACE FUNCTION update_manga_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE manga
  SET updated_at = COALESCE(NEW.release_date, NOW())
  WHERE id = NEW.manga_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Backfill — set manga.updated_at to latest chapter release_date
-- (This now works because set_updated_at() respects explicit values)
UPDATE manga m
SET updated_at = sub.max_release
FROM (
  SELECT manga_id, MAX(release_date) as max_release
  FROM chapters
  WHERE deleted_at IS NULL
  GROUP BY manga_id
) sub
WHERE m.id = sub.manga_id
  AND m.deleted_at IS NULL;