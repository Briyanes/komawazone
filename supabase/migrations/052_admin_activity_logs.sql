-- ============================================================
-- Migration 052: Admin Activity Log
-- ============================================================
-- Tracks all admin write actions (POST/PUT/PATCH/DELETE) for
-- security audit trail. Insert is SERVICE-ROLE only; read is
-- ADMIN-ONLY via RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action      TEXT NOT NULL,                    -- e.g. 'CREATE', 'UPDATE', 'DELETE', 'SCRAP', 'IMPORT'
  entity_type TEXT NOT NULL,                    -- e.g. 'manga', 'chapter', 'user', 'voucher', 'settings'
  entity_id   TEXT,                             -- optional: the affected record id
  method      TEXT NOT NULL DEFAULT 'POST',     -- HTTP method
  path        TEXT NOT NULL,                    -- API path
  status_code INT,                              -- HTTP response status
  details     JSONB,                           -- arbitrary metadata (sanitized)
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id   ON public.admin_activity_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_entity     ON public.admin_activity_logs (entity_type, entity_id);

-- Row Level Security
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
DROP POLICY IF EXISTS "Admins can read activity logs" ON public.admin_activity_logs;
CREATE POLICY "Admins can read activity logs"
  ON public.admin_activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- No direct INSERT/UPDATE/DELETE via anon/authenticated keys —
-- all writes go through the service-role client (server-only helper).
-- (Service role bypasses RLS, so no policy needed.)

-- ============================================================
-- Auto-cleanup: keep last 90 days of logs (run via cron daily)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_admin_logs(days_to_keep INT DEFAULT 90)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.admin_activity_logs
  WHERE created_at < now() - (days_to_keep || ' days')::INTERVAL;
END;
$$;