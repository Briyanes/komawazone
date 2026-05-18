-- ============================================================
-- 003: Site settings (key-value store for admin config)
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Public can read settings
DROP POLICY IF EXISTS "Public reads settings" ON public.site_settings;
CREATE POLICY "Public reads settings"
  ON public.site_settings FOR SELECT
  USING (true);

-- Only admins can write settings
DROP POLICY IF EXISTS "Admins write settings" ON public.site_settings;
CREATE POLICY "Admins write settings"
  ON public.site_settings FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'ADMIN')
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'ADMIN')
  );

-- Seed default banner (inactive)
INSERT INTO public.site_settings (key, value)
VALUES (
  'announcement_banner',
  '{"active": false, "message": "", "type": "info"}'
)
ON CONFLICT (key) DO NOTHING;

-- NOTIFY pgrst, 'reload schema';
