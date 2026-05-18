-- 010: Add manga_id to comments for manga-level comments
-- Run this in Supabase SQL Editor

-- Add manga_id column (nullable, so existing chapter comments still work)
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS manga_id UUID REFERENCES public.manga(id) ON DELETE CASCADE;

-- Make chapter_id nullable (was NOT NULL before, now either manga_id or chapter_id)
ALTER TABLE public.comments
  ALTER COLUMN chapter_id DROP NOT NULL;

-- Add likes_count column for sorting by popularity
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS likes_count INT NOT NULL DEFAULT 0;

-- Index for manga comments
CREATE INDEX IF NOT EXISTS idx_comments_manga ON public.comments(manga_id);

-- Create comment_likes table for per-comment likes
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, comment_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads comment likes"      ON public.comment_likes;
DROP POLICY IF EXISTS "Auth users manage comment likes" ON public.comment_likes;

CREATE POLICY "Anyone reads comment likes"
  ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY "Auth users manage comment likes"
  ON public.comment_likes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to auto-update likes_count
CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comment_likes_count ON public.comment_likes;
CREATE TRIGGER trg_comment_likes_count
  AFTER INSERT OR DELETE ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION update_comment_likes_count();
