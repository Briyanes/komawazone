-- ============================================================================
-- Migration 045: Enable RLS + Policies untuk Semua Tabel
-- ============================================================================
-- Supabase Advisor menunjukkan beberapa tabel belum enable RLS atau tidak
-- punya policy sama sekali. Ini sangat berbahaya karena dengan anon key,
-- siapa pun bisa membaca/menulis data sensitive (payments, vip_codes, dll).
--
-- Tabel yang teridentifikasi bermasalah:
--   1. subscriptions       — belum enable RLS sama sekali
--   2. manga_reviews       — belum enable RLS sama sekali
--   3. import_jobs         — RLS enabled, tapi tidak ada policy
--   4. payments            — RLS enabled, tapi tidak ada policy
--   5. vip_codes           — RLS enabled, tapi tidak ada policy
--
-- Migration ini idempotent (safe untuk re-run) dan transactional.
-- ============================================================================

BEGIN;

-- ─── 0. Helper: cek apakah tabel ada sebelum apply RLS ─────────────────────
-- Pattern: ALTER TABLE IF EXISTS + DROP POLICY IF EXISTS + CREATE POLICY

-- ─── 1. subscriptions ──────────────────────────────────────────────────────
-- Tabel subscription user (VIP status tracking)
ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop old policies if exist
DROP POLICY IF EXISTS "Users can read own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;

-- Users can only read their own subscriptions
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'MODERATOR')
    )
  );

-- ─── 2. manga_reviews ─────────────────────────────────────────────────────
-- Tabel review manga oleh user
ALTER TABLE IF EXISTS public.manga_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read reviews" ON public.manga_reviews;
DROP POLICY IF EXISTS "Users can manage own reviews" ON public.manga_reviews;
DROP POLICY IF EXISTS "Admins can manage reviews" ON public.manga_reviews;

-- Anyone can read published reviews
CREATE POLICY "Public can read reviews"
  ON public.manga_reviews FOR SELECT
  USING (true);

-- Users can create/update/delete their own reviews
CREATE POLICY "Users can manage own reviews"
  ON public.manga_reviews FOR ALL
  USING (auth.uid() = user_id);

-- Admins can manage all reviews (moderation)
CREATE POLICY "Admins can manage reviews"
  ON public.manga_reviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'MODERATOR')
    )
  );

-- ─── 3. import_jobs ────────────────────────────────────────────────────────
-- Tabel tracking job import manga (admin-only)
ALTER TABLE IF EXISTS public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage import_jobs" ON public.import_jobs;

-- Only admins/moderators can access import jobs
CREATE POLICY "Admins can manage import_jobs"
  ON public.import_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'MODERATOR')
    )
  );

-- ─── 4. payments ──────────────────────────────────────────────────────────
-- Tabel pembayaran VIP (sangat sensitive!)
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;

-- Users can only read their own payment records
CREATE POLICY "Users can read own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

-- Only admins can insert/update/delete payment records
CREATE POLICY "Admins can manage payments"
  ON public.payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- ─── 5. vip_codes ─────────────────────────────────────────────────────────
-- Tabel voucher/kode VIP (admin-only, sensitive!)
ALTER TABLE IF EXISTS public.vip_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage vip_codes" ON public.vip_codes;

-- Only admins can access VIP codes
CREATE POLICY "Admins can manage vip_codes"
  ON public.vip_codes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- ─── 6. Double-check: Enable RLS untuk SEMUA tabel yang mungkin terlewat ──
-- Gunakan DO block agar tidak error jika tabel tidak ada
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users', 'user_settings', 'manga', 'chapters', 'chapter_images',
    'genres', 'authors', 'manga_genres', 'manga_authors',
    'bookmarks', 'likes', 'reading_progress', 'reading_list',
    'ad_providers', 'ad_zones', 'ad_campaigns', 'ad_analytics',
    'audit_logs', 'comments', 'comment_likes', 'chapter_likes',
    'manga_reports', 'chapter_reports', 'site_settings',
    'notifications', 'user_ratings', 'manga_sources', 'file_assets',
    'subscriptions', 'manga_reviews', 'import_jobs', 'payments', 'vip_codes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS enabled on: %', tbl;
    ELSE
      RAISE NOTICE 'Table not found (skipped): %', tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ─── 7. Verify: tampilkan status RLS untuk semua tabel ────────────────────
SELECT
  tablename AS table_name,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;