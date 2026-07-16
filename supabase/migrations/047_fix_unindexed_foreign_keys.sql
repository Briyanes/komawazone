-- ============================================================================
-- Migration 047: Fix Unindexed Foreign Keys (SAFE — column existence check)
-- ============================================================================
-- Supabase Advisor: "Unindexed Foreign Key"
-- Foreign keys tanpa index memperlambat JOIN, DELETE, dan UPDATE CASCADE.
--
-- Strategy: CREATE INDEX IF NOT EXISTS untuk semua FK columns.
-- SAFETY: Setiap statement dicek dulu apakah kolomnya ada di tabel,
--          kalau tidak ada → SKIP (tidak error). Ini mengatasi perbedaan
--          schema antara dev & production DB.
-- ============================================================================

BEGIN;

-- ─── Helper: Create index hanya jika column ada ────────────────────────────
-- Pattern: DO $$ ... IF EXISTS (SELECT 1 FROM information_schema.columns
--          WHERE table_name = 'X' AND column_name = 'Y') THEN CREATE INDEX...

-- ─── chapters ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapters' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chapters_manga_id ON public.chapters(manga_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapters' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_chapters_created_at ON public.chapters(created_at DESC);
  END IF;
END $$;

-- ─── chapter_images ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapter_images' AND column_name='chapter_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chapter_images_chapter_id ON public.chapter_images(chapter_id);
  END IF;
END $$;

-- ─── bookmarks ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookmarks' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookmarks' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_bookmarks_manga_id ON public.bookmarks(manga_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookmarks' AND column_name='user_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookmarks' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user_manga ON public.bookmarks(user_id, manga_id);
  END IF;
END $$;

-- ─── likes ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='likes' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='likes' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_likes_manga_id ON public.likes(manga_id);
  END IF;
END $$;

-- ─── reading_progress ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reading_progress' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_reading_progress_user_id ON public.reading_progress(user_id);
  END IF;
  -- reading_progress uses last_chapter_id, not chapter_id
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reading_progress' AND column_name='last_chapter_id') THEN
    CREATE INDEX IF NOT EXISTS idx_reading_progress_last_chapter_id ON public.reading_progress(last_chapter_id);
  END IF;
END $$;

-- ─── reading_list ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reading_list' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_reading_list_user_id ON public.reading_list(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reading_list' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_reading_list_manga_id ON public.reading_list(manga_id);
  END IF;
END $$;

-- ─── comments ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_comments_manga_id ON public.comments(manga_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='chapter_id') THEN
    CREATE INDEX IF NOT EXISTS idx_comments_chapter_id ON public.comments(chapter_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='parent_id') THEN
    CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at DESC);
  END IF;
END $$;

-- ─── comment_likes ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comment_likes' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON public.comment_likes(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comment_likes' AND column_name='comment_id') THEN
    CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON public.comment_likes(comment_id);
  END IF;
END $$;

-- ─── chapter_likes ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapter_likes' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chapter_likes_user_id ON public.chapter_likes(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapter_likes' AND column_name='chapter_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chapter_likes_chapter_id ON public.chapter_likes(chapter_id);
  END IF;
END $$;

-- ─── user_ratings ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_ratings' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_user_ratings_user_id ON public.user_ratings(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_ratings' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_user_ratings_manga_id ON public.user_ratings(manga_id);
  END IF;
END $$;

-- ─── notifications ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
  END IF;
END $$;

-- ─── subscriptions ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
  END IF;
END $$;

-- ─── payments ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);
  END IF;
END $$;

-- ─── manga_genres ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_genres' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_genres_manga_id ON public.manga_genres(manga_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_genres' AND column_name='genre_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_genres_genre_id ON public.manga_genres(genre_id);
  END IF;
END $$;

-- ─── manga_authors ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_authors' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_authors_manga_id ON public.manga_authors(manga_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_authors' AND column_name='author_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_authors_author_id ON public.manga_authors(author_id);
  END IF;
END $$;

-- ─── manga_sources ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_sources' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_sources_manga_id ON public.manga_sources(manga_id);
  END IF;
END $$;

-- ─── manga_reports ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_reports' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_reports_manga_id ON public.manga_reports(manga_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_reports' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_reports_user_id ON public.manga_reports(user_id);
  END IF;
END $$;

-- ─── chapter_reports ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapter_reports' AND column_name='chapter_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chapter_reports_chapter_id ON public.chapter_reports(chapter_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapter_reports' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chapter_reports_user_id ON public.chapter_reports(user_id);
  END IF;
END $$;

-- ─── audit_logs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
  END IF;
END $$;

-- ─── ad_campaigns ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ad_campaigns' AND column_name='provider_id') THEN
    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_provider_id ON public.ad_campaigns(provider_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ad_campaigns' AND column_name='zone_id') THEN
    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_zone_id ON public.ad_campaigns(zone_id);
  END IF;
END $$;

-- ─── ad_analytics ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ad_analytics' AND column_name='campaign_id') THEN
    CREATE INDEX IF NOT EXISTS idx_ad_analytics_campaign_id ON public.ad_analytics(campaign_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ad_analytics' AND column_name='zone_id') THEN
    CREATE INDEX IF NOT EXISTS idx_ad_analytics_zone_id ON public.ad_analytics(zone_id);
  END IF;
END $$;

-- ─── manga_reviews ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_reviews' AND column_name='manga_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_reviews_manga_id ON public.manga_reviews(manga_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga_reviews' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_reviews_user_id ON public.manga_reviews(user_id);
  END IF;
END $$;

-- ─── Additional performance indexes untuk manga table ─────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga' AND column_name='status') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_status ON public.manga(status);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga' AND column_name='content_rating') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_content_rating ON public.manga(content_rating);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga' AND column_name='is_vip') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_is_vip ON public.manga(is_vip) WHERE is_vip = true;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga' AND column_name='deleted_at') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_deleted_at ON public.manga(deleted_at) WHERE deleted_at IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga' AND column_name='slug') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_slug ON public.manga(slug);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manga' AND column_name='updated_at') THEN
    CREATE INDEX IF NOT EXISTS idx_manga_updated_at ON public.manga(updated_at DESC);
  END IF;
END $$;

COMMIT;

-- ─── Verify: tampilkan indexes yang ada ───────────────────────────────────
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;