-- ============================================================
-- 004: User ratings for manga (1-5 stars)
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_ratings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id   UUID        NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, manga_id)
);

CREATE INDEX IF NOT EXISTS idx_user_ratings_manga ON public.user_ratings(manga_id);

ALTER TABLE public.user_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads ratings"     ON public.user_ratings;
DROP POLICY IF EXISTS "Auth users manage rating" ON public.user_ratings;

CREATE POLICY "Anyone reads ratings"
  ON public.user_ratings FOR SELECT USING (true);

CREATE POLICY "Auth users manage rating"
  ON public.user_ratings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to recompute manga.rating and manga.rating_count after any rating change
CREATE OR REPLACE FUNCTION public.update_manga_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_manga_id UUID;
BEGIN
  target_manga_id := COALESCE(NEW.manga_id, OLD.manga_id);
  UPDATE public.manga
  SET
    rating       = COALESCE((SELECT AVG(rating)::NUMERIC(3,2) FROM public.user_ratings WHERE manga_id = target_manga_id), 0),
    rating_count = (SELECT COUNT(*) FROM public.user_ratings WHERE manga_id = target_manga_id)
  WHERE id = target_manga_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_manga_rating ON public.user_ratings;
CREATE TRIGGER trg_update_manga_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.user_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_manga_rating();
