-- ============================================================
-- Migration 040: Auto-Set Chapter Thumbnail via DB Trigger
-- ============================================================
-- Root cause fix: chapter yang di-import "metadata-only" (cron auto-import)
-- tidak memiliki thumbnail_url dan tidak ada entry di chapter_images.
--
-- Trigger ini memastikan: setiap kali chapter_images di-insert (via API,
-- cron, backfill, atau manual), thumbnail_url pada chapter induk akan
-- otomatis di-set ke gambar ke-5 dari terakhir (fallback: gambar pertama).
--
-- Logic sama dengan migration 039 (admin_fix_thumbnails_5th_from_last),
-- tapi berjalan otomatis untuk setiap INSERT baru.
-- ============================================================

-- ── 1. Trigger Function ──────────────────────────────────────
-- FOR EACH STATEMENT (bukan ROW) supaya efisien untuk batch insert.
-- Hanya update chapter yang thumbnail_url-nya masih NULL — tidak akan
-- override value yang sudah diset secara eksplisit.
CREATE OR REPLACE FUNCTION public.auto_set_chapter_thumbnail()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch_id UUID;
BEGIN
  -- Iterasi setiap chapter_id unik yang terkena insert ini
  FOR ch_id IN SELECT DISTINCT chapter_id FROM new_rows LOOP
    -- Set thumbnail HANYA jika masih NULL (belum diset eksplisit)
    UPDATE chapters
    SET thumbnail_url = (
      SELECT target_url FROM (
        SELECT
          ci.image_url AS target_url,
          COUNT(*)     OVER (PARTITION BY ci.chapter_id)                    AS img_count,
          ROW_NUMBER() OVER (PARTITION BY ci.chapter_id ORDER BY ci.number ASC)  AS rn_asc,
          ROW_NUMBER() OVER (PARTITION BY ci.chapter_id ORDER BY ci.number DESC) AS rn_desc
        FROM chapter_images ci
        WHERE ci.chapter_id = ch_id
      ) ranked
      WHERE
        (img_count >= 5 AND rn_desc = 5)   -- 5th from last
        OR (img_count < 5 AND rn_asc = 1)  -- fallback: first image
      LIMIT 1
    )
    WHERE id = ch_id
      AND thumbnail_url IS NULL;
  END LOOP;

  RETURN NULL; -- AFTER trigger, result ignored
END;
$$;

-- ── 2. Create Trigger ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auto_set_chapter_thumbnail ON public.chapter_images;
CREATE TRIGGER trg_auto_set_chapter_thumbnail
  AFTER INSERT ON public.chapter_images
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.auto_set_chapter_thumbnail();

-- ── 3. Verify deployment ─────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Trigger trg_auto_set_chapter_thumbnail deployed on chapter_images';
  RAISE NOTICE '   Logic: thumbnail = 5th image FROM LAST (fallback: 1st image)';
  RAISE NOTICE '   Only fires when chapters.thumbnail_url IS NULL (no override)';
END;
$$;