-- 019 — Payments table for QRIS integration
-- This migration adds payments table to track all payment transactions
-- Supports Tripay integration for QRIS payments

-- ── 1. Create payments table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  -- Payment details
  amount BIGINT NOT NULL, -- in IDR
  payment_method TEXT NOT NULL DEFAULT 'qris',
  payment_channel TEXT, -- qris, gopay, ovo, shopeepay, dana, bca, mandiri, etc
  payment_status TEXT NOT NULL DEFAULT 'pending'
                     CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),

  -- Tripay specific
  tripay_transaction_id TEXT UNIQUE,
  tripay_payment_url TEXT,
  tripay_qr_string TEXT, -- For QRIS QR code
  tripay_status TEXT, -- Raw status from Tripay

  -- Payment metadata
  fraud_status TEXT DEFAULT 'safe',
  paid_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ NOT NULL,
  metadata JSONB, -- Store additional data (plan, promo_code, etc)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Create indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(payment_status);
CREATE INDEX IF NOT EXISTS payments_tripay_id_idx ON public.payments(tripay_transaction_id);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments(created_at DESC);

-- ── 3. Update subscriptions table (add payment reference) ─────────────
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;

-- Add auto-renewal flag for future use
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false;

-- ── 4. Enable Row Level Security ─────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can do everything on payments
CREATE POLICY "Admins can manage all payments"
  ON public.payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

-- ── 5. Function to update updated_at timestamp ──────────────────────────
CREATE OR REPLACE FUNCTION public.update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 6. Create trigger to auto-update updated_at ───────────────────────────
DROP TRIGGER IF EXISTS payments_updated_at_trigger ON public.payments;
CREATE TRIGGER payments_updated_at_trigger
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payments_updated_at();

-- ── 7. Add helpful comments ───────────────────────────────────────────────
COMMENT ON TABLE public.payments IS 'Stores all payment transactions including QRIS payments via Tripay';
COMMENT ON COLUMN public.payments.payment_method IS 'Payment method: qris, manual, or other gateway';
COMMENT ON COLUMN public.payments.payment_channel IS 'Specific payment channel: gopay, ovo, shopeepay, dana, bca, etc';
COMMENT ON COLUMN public.payments.tripay_transaction_id IS 'Unique transaction ID from Tripay';
COMMENT ON COLUMN public.payments.tripay_qr_string IS 'QR code string for QRIS payments';
COMMENT ON COLUMN public.payments.metadata IS 'Additional data like plan selection, promo codes, etc';

-- ── 8. Create view for payment analytics ───────────────────────────────────
CREATE OR REPLACE VIEW public.payment_analytics AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  payment_method,
  payment_status,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount
FROM public.payments
GROUP BY DATE_TRUNC('day', created_at), payment_method, payment_status;

COMMENT ON VIEW public.payment_analytics IS 'Aggregated payment data for analytics dashboard';
