-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 017 — Performance Indexes untuk optimized queries
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 1. Content rating filter (untuk non-VIP users) ───────────────────────
CREATE INDEX IF NOT EXISTS idx_manga_content_rating_deleted
  ON public.manga(content_rating, deleted_at)
  WHERE deleted_at IS NULL;

-- ── 2. Genre search (array overlap) ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_manga_genres
  ON public.manga USING GIN (genres);

-- ── 3. User-specific queries (bookmarks, likes, progress) ────────────────
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created
  ON public.bookmarks(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_user_created
  ON public.likes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reading_progress_user_updated
  ON public.reading_progress(user_id, last_read_at DESC);

-- ── 4. Chapter queries ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chapters_manga_number
  ON public.chapters(manga_id, number DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chapters_release_date
  ON public.chapters(release_date DESC)
  WHERE deleted_at IS NULL;

-- ── 5. Comments ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_comments_manga_created
  ON public.comments(manga_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON public.comments(parent_id, created_at ASC)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comment_likes_user
  ON public.comment_likes(user_id, comment_id);

-- ── 6. VIP users query (sering di-check di RLS) ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_vip_expires
  ON public.users(vip_expires_at)
  WHERE vip_expires_at IS NOT NULL;

-- ── 7. Search queries (require pg_trgm extension) ───────────────────────────
-- Enable extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_manga_title_trgm
  ON public.manga USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_manga_author_trgm
  ON public.manga USING GIN (author gin_trgm_ops);
