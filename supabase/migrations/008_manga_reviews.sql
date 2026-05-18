-- User reviews for manga
CREATE TABLE IF NOT EXISTS public.manga_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(manga_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_manga_reviews_manga_id ON public.manga_reviews(manga_id);
CREATE INDEX IF NOT EXISTS idx_manga_reviews_user_id ON public.manga_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_manga_reviews_created ON public.manga_reviews(created_at DESC);

-- Insert dummy reviews for testing
INSERT INTO public.manga_reviews (manga_id, user_id, rating, text, created_at) 
SELECT 
  m.id as manga_id,
  u.id as user_id,
  5,
  'joss banget',
  NOW() - INTERVAL '2 days'
FROM public.manga m, public.users u
WHERE m.slug = 'sword-of-the-undying' AND u.username = 'briyanes'
ON CONFLICT (manga_id, user_id) DO NOTHING;

INSERT INTO public.manga_reviews (manga_id, user_id, rating, text, created_at) 
SELECT 
  m.id as manga_id,
  u.id as user_id,
  4,
  'Cerita yang seru dengan karakter yang menarik. Recommended!',
  NOW() - INTERVAL '1 day'
FROM public.manga m, public.users u
WHERE m.slug = 'sword-of-the-undying' AND u.username != 'briyanes'
LIMIT 1
ON CONFLICT (manga_id, user_id) DO NOTHING;
