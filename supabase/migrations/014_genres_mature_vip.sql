-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 014 — Genres is_mature flag + seed data + VIP subscription system
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 1. Add is_mature to genres ─────────────────────────────────────
ALTER TABLE public.genres
  ADD COLUMN IF NOT EXISTS is_mature BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Seed genres (upsert so it's idempotent) ─────────────────────
INSERT INTO public.genres (name, slug, is_mature) VALUES
  ('Action',        'action',        false),
  ('Adaptation',    'adaptation',    false),
  ('Adult',         'adult',         true),
  ('Adventure',     'adventure',     false),
  ('Comedy',        'comedy',        false),
  ('Cooking',       'cooking',       false),
  ('Crime',         'crime',         false),
  ('Demon',         'demon',         false),
  ('Demons',        'demons',        false),
  ('Drama',         'drama',         false),
  ('Ecchi',         'ecchi',         true),
  ('Fantasy',       'fantasy',       false),
  ('Fight',         'fight',         false),
  ('Game',          'game',          false),
  ('Gender Bender', 'gender-bender', false),
  ('Harem',         'harem',         false),
  ('Historical',    'historical',    false),
  ('Horror',        'horror',        false),
  ('Isekai',        'isekai',        false),
  ('Josei',         'josei',         false),
  ('Love',          'love',          false),
  ('Magic',         'magic',         false),
  ('Martial Arts',  'martial-arts',  false),
  ('Mature',        'mature',        true),
  ('Mecha',         'mecha',         false),
  ('Medical',       'medical',       false),
  ('Murim',         'murim',         false),
  ('Mystery',       'mystery',       false),
  ('Philosophical', 'philosophical', false),
  ('Psychological', 'psychological', false),
  ('Regression',    'regression',    false),
  ('Revenge',       'revenge',       false),
  ('Romance',       'romance',       false),
  ('School Life',   'school-life',   false),
  ('Sci-fi',        'sci-fi',        false),
  ('Seinen',        'seinen',        false),
  ('Shoujo',        'shoujo',        false),
  ('Shounen',       'shounen',       false),
  ('Slice of Life', 'slice-of-life', false),
  ('Smut',          'smut',          true),
  ('Sports',        'sports',        false),
  ('Supernatural',  'supernatural',  false),
  ('Supranatural',  'supranatural',  false),
  ('Thriller',      'thriller',      false),
  ('Tragedy',       'tragedy',       false),
  ('Violence',      'violence',      false),
  ('Wuxia',         'wuxia',         false)
ON CONFLICT (slug) DO UPDATE
  SET is_mature = EXCLUDED.is_mature,
      name      = EXCLUDED.name;

-- ── 3. VIP: add vip_expires_at to users ────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ;

-- ── 4. Subscriptions table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan           TEXT        NOT NULL DEFAULT 'vip',
  amount         INTEGER     NOT NULL DEFAULT 15000,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'expired', 'cancelled')),
  payment_method TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx  ON public.subscriptions(status);

-- ── 5. RLS for subscriptions ───────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Admins can do everything
CREATE POLICY "Admins manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );
