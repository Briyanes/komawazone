-- 011: Add reply support to comments + manga reports table
-- Run this in Supabase SQL Editor

-- Add parent_id to comments for threaded replies
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;

-- Index for fetching replies
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_id);

-- Manga reports table
CREATE TABLE IF NOT EXISTS public.manga_reports (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  manga_id   UUID        NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  reason     TEXT        NOT NULL,
  notes      TEXT,
  status     TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, manga_id)  -- one report per user per manga
);

CREATE INDEX IF NOT EXISTS idx_manga_reports_manga  ON public.manga_reports(manga_id);
CREATE INDEX IF NOT EXISTS idx_manga_reports_status ON public.manga_reports(status);

ALTER TABLE public.manga_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users insert manga report"  ON public.manga_reports;
DROP POLICY IF EXISTS "Admins read manga reports"       ON public.manga_reports;

CREATE POLICY "Auth users insert manga report"
  ON public.manga_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own reports"
  ON public.manga_reports FOR SELECT
  USING (auth.uid() = user_id);
