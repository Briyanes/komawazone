-- Migration: 038_dashboard_stats_rpc.sql
-- Purpose: Create optimized RPC for admin dashboard stats
--          Replaces fetch-all + reduce for totalViews with a single SUM() query

DROP FUNCTION IF EXISTS public.get_dashboard_stats();

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS TABLE (
  total_manga    BIGINT,
  total_chapters BIGINT,
  total_users    BIGINT,
  total_views    BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.manga     WHERE deleted_at IS NULL)                AS total_manga,
    (SELECT COUNT(*) FROM public.chapters  WHERE deleted_at IS NULL)                AS total_chapters,
    (SELECT COUNT(*) FROM public.users)                                            AS total_users,
    COALESCE((SELECT SUM(views) FROM public.manga WHERE deleted_at IS NULL), 0)    AS total_views;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;