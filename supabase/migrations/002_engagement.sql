-- ============================================================
-- 002: Chapter engagement tables (likes, comments, reports)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Chapter likes / votes
CREATE TABLE IF NOT EXISTS public.chapter_likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chapter_id UUID        NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chapter_id)
);

-- Chapter comments
CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chapter_id UUID        NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chapter reports (broken/wrong chapters)
CREATE TABLE IF NOT EXISTS public.chapter_reports (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  chapter_id UUID        NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  reason     TEXT        NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chapter_likes_chapter ON public.chapter_likes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_comments_chapter      ON public.comments(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_reports_chap  ON public.chapter_reports(chapter_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.chapter_likes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_reports ENABLE ROW LEVEL SECURITY;

-- chapter_likes
DROP POLICY IF EXISTS "Anyone reads chapter likes"          ON public.chapter_likes;
DROP POLICY IF EXISTS "Auth users manage own chapter likes" ON public.chapter_likes;
CREATE POLICY "Anyone reads chapter likes"
  ON public.chapter_likes FOR SELECT USING (true);
CREATE POLICY "Auth users manage own chapter likes"
  ON public.chapter_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- comments
DROP POLICY IF EXISTS "Anyone reads comments"          ON public.comments;
DROP POLICY IF EXISTS "Auth users insert comments"     ON public.comments;
DROP POLICY IF EXISTS "Auth users delete own comments" ON public.comments;
CREATE POLICY "Anyone reads comments"
  ON public.comments FOR SELECT USING (true);
CREATE POLICY "Auth users insert comments"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users delete own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);

-- chapter_reports
DROP POLICY IF EXISTS "Auth users report chapters" ON public.chapter_reports;
DROP POLICY IF EXISTS "Admins view reports"        ON public.chapter_reports;
CREATE POLICY "Auth users report chapters"
  ON public.chapter_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view reports"
  ON public.chapter_reports FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'ADMIN')
  );
