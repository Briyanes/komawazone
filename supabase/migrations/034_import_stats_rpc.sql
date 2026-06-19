-- Migration: 034_import_stats_rpc.sql
-- Purpose: Create optimized RPC function for import dashboard stats
--          Replaces N+1 pagination queries with a single SQL query

-- Drop if exists (for re-runs)
DROP FUNCTION IF EXISTS public.get_import_stats();

CREATE OR REPLACE FUNCTION public.get_import_stats()
RETURNS TABLE (
  total_manga          BIGINT,
  manga_with_source    BIGINT,
  total_chapters       BIGINT,
  manga_with_chapters  BIGINT,
  manga_without_chapters BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH active_manga AS (
    SELECT id FROM public.manga WHERE deleted_at IS NULL
  ),
  active_chapters AS (
    SELECT DISTINCT manga_id
    FROM public.chapters
    WHERE deleted_at IS NULL
      AND manga_id IN (SELECT id FROM active_manga)
  )
  SELECT
    (SELECT COUNT(*) FROM active_manga)                                           AS total_manga,
    (SELECT COUNT(*) FROM public.manga WHERE deleted_at IS NULL AND source_url IS NOT NULL) AS manga_with_source,
    (SELECT COUNT(*) FROM public.chapters WHERE deleted_at IS NULL
       AND manga_id IN (SELECT id FROM active_manga))                             AS total_chapters,
    (SELECT COUNT(*) FROM active_chapters)                                        AS manga_with_chapters,
    (SELECT COUNT(*) FROM active_manga) - (SELECT COUNT(*) FROM active_chapters)  AS manga_without_chapters
  ;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_import_stats() TO authenticated;