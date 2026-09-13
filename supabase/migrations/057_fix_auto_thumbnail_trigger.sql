-- ============================================================
-- Migration 057: Fix Trigger auto_set_chapter_thumbnail
-- ============================================================
-- Bug: Trigger pakai `new_rows` di FOR EACH STATEMENT,
--      tapi CREATE TRIGGER tidak declare REFERENCING NEW TABLE AS new_rows.
--      Akibatnya: "relation 'new_rows' does not exist" setiap INSERT.
--
-- Fix: Recreate trigger dengan REFERENCING clause yang benar.
-- ============================================================

-- Drop trigger lama (yang bugged)
DROP TRIGGER IF EXISTS trg_auto_set_chapter_thumbnail ON public.chapter_images;

-- Recreate dengan REFERENCING clause
CREATE TRIGGER trg_auto_set_chapter_thumbnail
  AFTER INSERT ON public.chapter_images
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.auto_set_chapter_thumbnail();

-- Verify
DO $$
BEGIN
  RAISE NOTICE '✅ Trigger trg_auto_set_chapter_thumbnail FIXED with REFERENCING NEW TABLE AS new_rows';
END;
$$;