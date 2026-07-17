-- ═══════════════════════════════════════════════════════════════════════════
-- 🚨 CRITICAL FIX: RLS Infinite Recursion on users table
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: Migration 050 created policy "Admins can manage all users" which
--          does a subquery on public.users — but RLS on users table triggers
--          the same policy again → infinite recursion → error 500.
--
-- FIX:     1. Create a SECURITY DEFINER function is_admin() that checks role
--             WITHOUT triggering RLS (bypasses RLS internally).
--          2. Drop the recursive policy.
--          3. Recreate using is_admin() instead of inline subquery.
--
-- ⚠️  RUN THIS IN SUPABASE SQL EDITOR after migration 050.
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Create SECURITY DEFINER function to check admin role
-- This function bypasses RLS so it won't cause recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('ADMIN', 'MODERATOR')
  );
$$;

-- Step 2: Drop the recursive admin policy
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;

-- Step 3: Recreate admin policy using is_admin() function (no recursion)
CREATE POLICY "Admins can manage all users"
  ON public.users FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Step 4: Grant execute on is_admin to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verify
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  policy_count INT;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'users' AND schemaname = 'public';

  RAISE NOTICE 'Total RLS policies on public.users: %', policy_count;
  RAISE NOTICE 'Expected: 4 policies (read own, insert own, update own, admin all)';
END $$;