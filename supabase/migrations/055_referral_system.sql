-- ════════════════════════════════════════════════════════════════════════
-- REFERRAL SYSTEM (Double-Sided: Inviter +7d, Invitee +7d bonus)
-- ════════════════════════════════════════════════════════════════════════
-- Each user gets a unique referral_code for sharing.
-- referrals table tracks who invited whom + reward status.
-- Anti-abuse: max 5 successful referrals per user, 1 referral per invitee.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Add referral columns to users ─────────────────────────────────────
-- referral_code: unique shareable code (e.g. OLLUQ-AB12CD), generated lazily
-- referred_by: the referral_code of the person who invited this user (nullable)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- Index for fast referral_code lookups (share link → find inviter)
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by   ON public.users(referred_by);

-- ── 2. Referrals tracking table ──────────────────────────────────────────
-- One row per successful referral conversion (invitee claims trial).
CREATE TABLE IF NOT EXISTS referrals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('pending', 'completed', 'rewarded')),
  reward_days     INT NOT NULL DEFAULT 7,
  referrer_rewarded_at TIMESTAMPTZ,
  referred_rewarded_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_id)  -- each user can only be referred ONCE
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_created_at  ON referrals(created_at DESC);

-- ── 3. RLS for referrals ─────────────────────────────────────────────────
-- Users can only see their own referrals (as referrer or referred).
-- Admins can see all.
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals" ON referrals
  FOR SELECT USING (
    auth.uid() = referrer_id
    OR auth.uid() = referred_id
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

CREATE POLICY "Admins can manage referrals" ON referrals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- ── 4. Comments for clarity ──────────────────────────────────────────────
COMMENT ON COLUMN public.users.referral_code IS
  'Unique shareable referral code (format: OLLUQ-XXXXXX). Generated lazily on first VIP page visit.';
COMMENT ON COLUMN public.users.referred_by IS
  'Referral code of the user who invited this person (set at trial claim time, immutable).';
COMMENT ON TABLE referrals IS
  'Tracks referral conversions for the double-sided referral program. Max 5 per referrer.';