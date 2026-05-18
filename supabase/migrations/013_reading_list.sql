-- 013: Reading list with status + chapter notifications + follows
-- Run this in Supabase SQL Editor

-- ── Reading List ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reading_list (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id   UUID        NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'plan_to_read'
               CHECK (status IN ('reading','plan_to_read','completed','on_hold','dropped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, manga_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_list_user   ON public.reading_list(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_list_status ON public.reading_list(user_id, status);

ALTER TABLE public.reading_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reading list" ON public.reading_list;
DROP POLICY IF EXISTS "Users read own reading list"   ON public.reading_list;

CREATE POLICY "Users manage own reading list"
  ON public.reading_list FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Manga Follows (for chapter new notifications) ────────────────────────────
-- Reuse reading_list: users who have status = 'reading' get notified.
-- notifications table already exists from migration 006.
-- Add manga_id + chapter_id foreign key columns to notifications if not present.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS manga_id   UUID REFERENCES public.manga(id)    ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_manga ON public.notifications(manga_id)
  WHERE manga_id IS NOT NULL;
