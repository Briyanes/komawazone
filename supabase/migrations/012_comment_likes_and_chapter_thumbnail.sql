-- 012: Add comment_likes table + thumbnail_url to chapters + comments updates
-- Run this in Supabase SQL Editor

-- Add thumbnail_url to chapters
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add manga_id to comments (for manga-level comments, not just chapter-level)
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS manga_id UUID REFERENCES public.manga(id) ON DELETE CASCADE;

-- Make chapter_id nullable (some comments belong to manga, not a specific chapter)
ALTER TABLE public.comments
  ALTER COLUMN chapter_id DROP NOT NULL;

-- Add likes_count denormalized counter for performance
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_comments_manga ON public.comments(manga_id);

-- Comment likes table
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment_id UUID        NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON public.comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user    ON public.comment_likes(user_id);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users insert comment like"  ON public.comment_likes;
DROP POLICY IF EXISTS "Users read own comment likes"    ON public.comment_likes;
DROP POLICY IF EXISTS "Users delete own comment likes"  ON public.comment_likes;
DROP POLICY IF EXISTS "All read comment likes"          ON public.comment_likes;

CREATE POLICY "Auth users insert comment like"
  ON public.comment_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Auth users delete comment like"
  ON public.comment_likes FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "All read comment likes"
  ON public.comment_likes FOR SELECT
  USING (true);
