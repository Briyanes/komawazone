-- ════════════════════════════════════════════════════════════════════════
-- VIP FREE TRIAL SYSTEM (Launch Special: Free 1-Month VIP)
-- ════════════════════════════════════════════════════════════════════════
-- Adds trial tracking to users table (1x per user, anti-abuse)
-- and an audit log table for admin monitoring.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Add trial tracking column to users ────────────────────────────────
-- trial_claimed_at: NULL = never claimed (eligible), timestamp = claimed at
-- This is the anti-abuse mechanism: each user can only claim once.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_claimed_at TIMESTAMPTZ;

-- trial_source: 'launch' | 'promo' | 'referral' (for future campaigns)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_source TEXT DEFAULT 'launch';

-- ── 2. Audit log table for trial claims (admin monitoring) ───────────────
CREATE TABLE IF NOT EXISTS vip_trial_log (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source       TEXT NOT NULL DEFAULT 'launch',
  ip_address   TEXT,
  user_agent   TEXT,
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

-- Index for fast admin queries (recent claims, user lookup)
CREATE INDEX IF NOT EXISTS idx_vip_trial_log_claimed_at ON vip_trial_log(claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vip_trial_log_user_id   ON vip_trial_log(user_id);

-- ── 3. RLS for trial log (admin-only read) ───────────────────────────────
ALTER TABLE vip_trial_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view trial log" ON vip_trial_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

CREATE POLICY "Admins can manage trial log" ON vip_trial_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- ── 4. Add comment for clarity ───────────────────────────────────────────
COMMENT ON COLUMN public.users.trial_claimed_at IS
  'Timestamp when the free VIP trial was claimed (NULL = eligible). Anti-abuse: 1x per user.';
COMMENT ON COLUMN public.users.trial_source IS
  'Campaign source for the trial: launch | promo | referral. Defaults to launch.';
COMMENT ON TABLE vip_trial_log IS
  'Audit log of all free VIP trial claims for admin monitoring and abuse detection.';