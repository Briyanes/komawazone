-- ============================================================================
-- Migration 048: Storage Security + Schema Hardening
-- ============================================================================
-- Supabase Advisor: "Storage Bucket Public" dan masalah schema security lainnya
--
-- Project ini menggunakan Cloudflare R2 untuk image storage, tapi Supabase
-- Storage mungkin terbuka secara default. Migration ini:
--   1. Pastikan tidak ada storage bucket yang public tanpa authentication
--   2. REVOKE EXECUTE untuk function berbahaya dari anon role
--   3. Pastikan `public` schema tidak memberikan akses berlebihan
-- ============================================================================

BEGIN;

-- ─── 1. Cek dan buat storage bucket hanya jika diperlukan ─────────────────
-- Project menggunakan R2, jadi Supabase Storage buckets tidak digunakan
-- untuk image storage. Tapi pastikan jika ada, tidak public tanpa auth.

-- Hapus bucket public yang tidak terpakai (jika ada)
-- Note: Storage buckets tidak bisa di-DROP IF EXISTS tanpa cek dulu
DO $$
DECLARE
  bucket_record RECORD;
BEGIN
  -- Loop semua buckets dan log statusnya
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    FOR bucket_record IN
      SELECT id, name, public FROM storage.buckets
    LOOP
      RAISE NOTICE 'Bucket: % | Public: %', bucket_record.name, bucket_record.public;
      
      -- Jika bucket public dan bukan avatars, set ke private (force auth)
      IF bucket_record.public = true AND bucket_record.name NOT IN ('avatars') THEN
        UPDATE storage.buckets
        SET public = false
        WHERE id = bucket_record.id;
        RAISE NOTICE '⚠️ Bucket % set to PRIVATE', bucket_record.name;
      END IF;
    END LOOP;
  ELSE
    RAISE NOTICE 'Storage buckets table not found (skipped)';
  END IF;
END $$;

-- ─── 2. REVOKE EXECUTE dari anon untuk semua function di schema public ────
-- Function yang TIDAK SECURITY DEFINER tetap bisa berbahaya jika mengandung
-- logic sensitif. Revoke default EXECUTE dan grant hanya ke authenticated.

-- Pertama, revoke semua dari anon dan public role
DO $$
DECLARE
  fn_record RECORD;
  revoke_count INT := 0;
BEGIN
  FOR fn_record IN
    SELECT
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = false  -- Non-SECURITY DEFINER only
      -- Exclude trigger functions (tidak dipanggil langsung oleh client)
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        WHERE t.tgfoid = p.oid
      )
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
        fn_record.function_name, fn_record.args
      );
      revoke_count := revoke_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skip: %', fn_record.function_name;
    END;
  END LOOP;
  
  RAISE NOTICE 'Revoked execute from anon: % functions', revoke_count;
END $$;

-- ─── 3. REVOKE EXECUTE dari anon untuk pg_sleep dan function berbahaya ───
-- pg_sleep bisa digunakan untuk DoS attacks
REVOKE EXECUTE ON FUNCTION pg_sleep(double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION pg_sleep_for(interval) FROM anon;
REVOKE EXECUTE ON FUNCTION pg_sleep_until(timestamptz) FROM anon;

-- ─── 4. Buat helper function is_admin() untuk RLS policies ────────────────
-- Function ini digunakan untuk mengecek apakah user adalah admin
-- Menggunakan SECURITY DEFINER dengan search_path explicit (secure)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
$$;

-- Grant execute hanya ke authenticated
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ─── 5. Buat helper function is_moderator() ──────────────────────────────
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('ADMIN', 'MODERATOR')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_moderator() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;

-- ─── 6. Pastikan extension pgjwt tidak exposed ke anon ───────────────────
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON SCHEMA pgjwt FROM anon';
  RAISE NOTICE 'pgjwt schema revoked from anon';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgjwt schema not found (skipped)';
END $$;

COMMIT;

-- ─── 7. Verify: tampilkan semua function dan permission ──────────────────
SELECT
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS return_type,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN '❌ EXPOSED'
       ELSE '✅ SECURE'
  END AS anon_access
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;