-- ============================================================================
-- Migration 042: RPC function for batch chapter counts
-- ============================================================================
-- Purpose: Returns chapter counts per manga_id in a single query.
-- Used by auto-import cron to avoid N+1 query pattern.
--
-- Usage: SELECT * FROM get_chapter_counts_by_manga();
-- Returns: { manga_id: uuid, count: bigint }
-- ============================================================================

CREATE OR REPLACE FUNCTION get_chapter_counts_by_manga()
RETURNS TABLE (
  manga_id uuid,
  count bigint
) AS $$
  SELECT
    manga_id,
    count(*)::bigint AS count
  FROM chapters
  WHERE deleted_at IS NULL
  GROUP BY manga_id;
$$ LANGUAGE sql STABLE;

-- Grant access to authenticated users (anon uses service role bypass)
GRANT EXECUTE ON FUNCTION get_chapter_counts_by_manga() TO authenticated;
GRANT EXECUTE ON FUNCTION get_chapter_counts_by_manga() TO anon;

-- Add comment for documentation
COMMENT ON FUNCTION get_chapter_counts_by_manga() IS
  'Returns chapter count per manga_id. Used by auto-import cron to avoid N+1 queries.';