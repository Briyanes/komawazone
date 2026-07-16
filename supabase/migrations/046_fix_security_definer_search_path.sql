-- ============================================================================
-- Migration 046: Fix SECURITY DEFINER Functions (search_path)
-- ============================================================================
-- Supabase Advisor: "Function Search Path Mutable"
-- CVE-2024-7348: Functions dengan SECURITY DEFINER tanpa explicit search_path
-- rentan terhadap search path hijacking attacks.
--
-- Solution: ALTER setiap SECURITY DEFINER function dengan explicit search_path.
-- Approach: Hardcoded statements (BUKAN dynamic SQL loop) untuk menghindari
--          error saat PostgreSQL evaluasi function body.
-- ============================================================================

BEGIN;

-- ─── 1. SECURITY DEFINER functions — set search_path explicit ──────────────
-- Setiap statement dibungkus DO $$ EXCEPTION agar tidak gagal total jika
-- salah satu function tidak ada di database.

-- handle_new_user() — trigger: auto-create user profile (migration 001)
DO $$ BEGIN
  ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: handle_new_user()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: handle_new_user() (%)', SQLERRM;
END $$;

-- update_comment_likes_count() — trigger: maintain likes_count (migration 010)
DO $$ BEGIN
  ALTER FUNCTION public.update_comment_likes_count() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: update_comment_likes_count()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: update_comment_likes_count() (%)', SQLERRM;
END $$;

-- update_manga_rating() — trigger: recalculate manga rating (migration 004)
DO $$ BEGIN
  ALTER FUNCTION public.update_manga_rating() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: update_manga_rating()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: update_manga_rating() (%)', SQLERRM;
END $$;

-- auto_set_chapter_thumbnail() — trigger: auto thumbnail (migration 040)
DO $$ BEGIN
  ALTER FUNCTION public.auto_set_chapter_thumbnail() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: auto_set_chapter_thumbnail()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: auto_set_chapter_thumbnail() (%)', SQLERRM;
END $$;

-- update_manga_timestamp() — trigger: updated_at reflect release (migration 032)
DO $$ BEGIN
  ALTER FUNCTION public.update_manga_timestamp() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: update_manga_timestamp()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: update_manga_timestamp() (%)', SQLERRM;
END $$;

-- get_import_stats() — RPC untuk admin import dashboard (migration 034)
DO $$ BEGIN
  ALTER FUNCTION public.get_import_stats() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: get_import_stats()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: get_import_stats() (%)', SQLERRM;
END $$;

-- get_dashboard_stats() — RPC untuk admin dashboard stats (migration 038)
DO $$ BEGIN
  ALTER FUNCTION public.get_dashboard_stats() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: get_dashboard_stats()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: get_dashboard_stats() (%)', SQLERRM;
END $$;

-- admin_fix_thumbnails_5th_from_last() — RPC fix thumbnails (migration 039)
DO $$ BEGIN
  ALTER FUNCTION public.admin_fix_thumbnails_5th_from_last() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: admin_fix_thumbnails_5th_from_last()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: admin_fix_thumbnails_5th_from_last() (%)', SQLERRM;
END $$;

-- get_chapter_counts_by_manga() — RPC batch chapter counts (migration 042)
DO $$ BEGIN
  ALTER FUNCTION public.get_chapter_counts_by_manga() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: get_chapter_counts_by_manga()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: get_chapter_counts_by_manga() (%)', SQLERRM;
END $$;

-- set_updated_at() — trigger: auto updated_at (migration 001)
DO $$ BEGIN
  ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
  RAISE NOTICE '✅ Fixed: set_updated_at()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skipped: set_updated_at() (%)', SQLERRM;
END $$;

-- ─── 2. REVOKE EXECUTE dari anon/public untuk RPC functions ───────────────
-- Best practice: SECURITY DEFINER RPCs hanya untuk authenticated/admin.
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_import_stats() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.get_import_stats() FROM public;
  RAISE NOTICE '✅ Revoked anon execute: get_import_stats';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skip revoke (not found): get_import_stats';
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM public;
  RAISE NOTICE '✅ Revoked anon execute: get_dashboard_stats';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skip revoke (not found): get_dashboard_stats';
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.admin_fix_thumbnails_5th_from_last() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.admin_fix_thumbnails_5th_from_last() FROM public;
  RAISE NOTICE '✅ Revoked anon execute: admin_fix_thumbnails_5th_from_last';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Skip revoke (not found): admin_fix_thumbnails_5th_from_last';
END $$;

-- Note: get_chapter_counts_by_manga() tetap GRANT ke anon karena dipakai
-- oleh auto-import cron (server-side dengan service role key bypass RLS).
-- Tapi search_path sudah di-fix di atas.

-- Note: handle_new_user, update_comment_likes_count, update_manga_rating,
-- auto_set_chapter_thumbnail, update_manga_timestamp — ini TRIGGER functions.
-- Tidak dipanggil langsung oleh client, tidak perlu revoke execute.

COMMIT;

-- ─── 3. Verify: tampilkan semua SECURITY DEFINER functions dan search_path ─
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;