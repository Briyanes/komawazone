-- Migration 015: Add content_rating to manga table
-- Run in Supabase SQL Editor

-- Add content_rating column
ALTER TABLE public.manga
  ADD COLUMN IF NOT EXISTS content_rating TEXT NOT NULL DEFAULT 'general'
  CHECK (content_rating IN ('general', 'mature'));

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_manga_content_rating ON public.manga(content_rating);
