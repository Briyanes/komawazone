-- ============================================================
-- 006: User notifications
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL DEFAULT 'new_chapter',
  title      TEXT        NOT NULL,
  body       TEXT,
  manga_id   UUID        REFERENCES public.manga(id) ON DELETE CASCADE,
  chapter_id UUID        REFERENCES public.chapters(id) ON DELETE CASCADE,
  read       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins insert notifications"    ON public.notifications;
DROP POLICY IF EXISTS "Service insert notifications"   ON public.notifications;

CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'ADMIN')
  );
