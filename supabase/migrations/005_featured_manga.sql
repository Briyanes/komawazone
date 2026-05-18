-- ============================================================
-- 005: Featured manga flag
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.manga ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_manga_featured ON public.manga(is_featured) WHERE is_featured = true;
