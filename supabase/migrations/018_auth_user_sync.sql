-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 018 — Sync Auth User ke public.users (auto-create on signup)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 1. Function untuk handle new user signup ───────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, username, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    'USER'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    username = COALESCE(EXCLUDED.username, users.username);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Trigger untuk auto-create user di public.users ────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 3. Sync existing auth users ke public.users ───────────────────
INSERT INTO public.users (id, email, username, role)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'username', SPLIT_PART(email, '@', 1)),
  'USER'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  username = COALESCE(EXCLUDED.username, users.username);
