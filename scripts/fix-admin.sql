-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Set Admin Role untuk admin@olluq.com
-- Run ini SETELAH migration 018
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Update role menjadi ADMIN dan beri lifetime VIP
UPDATE public.users
SET role = 'ADMIN',
    vip_expires_at = '2099-12-31 23:59:59+00'
WHERE email = 'admin@olluq.com';

-- Verify admin created
SELECT
  id,
  email,
  username,
  role,
  vip_expires_at,
  created_at
FROM public.users
WHERE email = 'admin@olluq.com';
