-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Setup Admin Account untuk OLLUQ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Step 1: Insert admin user ke public.users table
-- Email: admin@olluq.com
-- Password: (akan diset di Supabase Auth)
-- Role: ADMIN (full access)

INSERT INTO public.users (id, email, username, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@olluq.com',
  'admin',
  'ADMIN'
)
ON CONFLICT (email) DO UPDATE SET
  role = 'ADMIN',
  username = 'admin';

-- Step 2: Set VIP status untuk admin (lifetime VIP)
UPDATE public.users
SET vip_expires_at = '2099-12-31 23:59:59+00'
WHERE email = 'admin@olluq.com';

-- Verify admin created
SELECT id, email, username, role, vip_expires_at
FROM public.users
WHERE email = 'admin@olluq.com';
