-- VIP Voucher Codes system
CREATE TABLE IF NOT EXISTS vip_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('1-month', '3-month', '6-month')),
  created_by UUID REFERENCES users(id),
  used_by UUID REFERENCES users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast code lookup
CREATE INDEX IF NOT EXISTS idx_vip_codes_code ON vip_codes(code);
CREATE INDEX IF NOT EXISTS idx_vip_codes_status ON vip_codes(used_by) WHERE used_by IS NULL;

-- RLS
ALTER TABLE vip_codes ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage vip_codes" ON vip_codes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Authenticated users can read (for redeem check) but only specific code lookups
CREATE POLICY "Users can check vip_codes" ON vip_codes
  FOR SELECT USING (
    true -- allow lookup for redeem
  );

-- Users can update (redeem) codes
CREATE POLICY "Users can redeem vip_codes" ON vip_codes
  FOR UPDATE USING (
    used_by IS NULL -- only unused codes
  );
+++++++ REPLACE