-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Debug: Cek semua users untuk troubleshooting
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Cek semua users di public.users
SELECT 'PUBLIC USERS' as source, id, email, username, role, created_at
FROM public.users
ORDER BY created_at DESC;

-- 2. Cek semua users di auth.users
SELECT 'AUTH USERS' as source, id, email, raw_user_meta_data->>'username' as username, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- 3. Cek apakah admin@olluq.com ada di auth.users
SELECT
  id,
  email,
  raw_user_meta_data->>'username' as username,
  confirmed_at,
  created_at
FROM auth.users
WHERE email = 'admin@olluq.com';
