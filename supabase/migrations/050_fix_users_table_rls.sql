-- ═══════════════════════════════════════════════════════════════════════════
-- 🚨 CRITICAL FIX: RLS Policies for users table
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- PROBLEM: Profile page (/profile) returns error after Google OAuth login.
--          User can authenticate but cannot read/update own profile data.
-- CAUSE:   RLS was enabled on public.users (migration 045) but NO policies
--          were created — so ALL access is denied (default-deny).
-- FIX:     Create RLS policies so users can read/update their own row,
--          and admins can manage all rows.
--
-- This is idempotent (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Public can read usernames" ON public.users;

-- ═══════════════════════════════════════════════════════════════════════════
-- Policy 1: Users can READ their own profile
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Policy 2: Users can INSERT their own profile (for OAuth trigger/callback)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Policy 3: Users can UPDATE their own profile
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Policy 4: Admins can manage ALL users (for admin dashboard)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Admins can manage all users"
  ON public.users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'MODERATOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'MODERATOR')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Policy 5: Public (anon) can read basic public profile info
-- Limited to id, username, avatar_url for comments/profile display
-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE: We don't create a separate anon SELECT policy because the users table
-- contains sensitive data (email, vip_expires_at, etc). Admin/moderator
-- policies above cover the case where admin needs to read all users.
-- For public profile display (comments, etc), use a dedicated RPC or view.

-- ═══════════════════════════════════════════════════════════════════════════
-- Verify policies were created
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  policy_count INT;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'users' AND schemaname = 'public';
  
  RAISE NOTICE 'Total RLS policies on public.users: %', policy_count;
  RAISE NOTICE 'Expected: 4 policies (read, insert, update, admin)';
END $$;