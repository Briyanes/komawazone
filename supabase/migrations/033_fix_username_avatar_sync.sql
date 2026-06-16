-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 033 — Fix handle_new_user(): sync username + avatar_url from OAuth
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Problem: Google OAuth users get raw email prefix as username (e.g. "muajawa")
--          and avatar_url is never populated from OAuth metadata.
-- Fix: Use OAuth name/full_name for better display username,
--      and sync avatar_url from provider metadata.

-- ── 1. Improved handle_new_user() function ───────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username text;
  v_avatar   text;
BEGIN
  -- Derive best username: explicit username > name > full_name > email prefix
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    SPLIT_PART(NEW.email, '@', 1)
  );

  -- Derive avatar from OAuth provider metadata
  v_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    NULL
  );

  INSERT INTO public.users (id, email, username, avatar_url, role)
  VALUES (NEW.id, NEW.email, v_username, v_avatar, 'USER')
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    username   = COALESCE(EXCLUDED.username, users.username),
    avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Backfill avatar_url for existing users from auth.users ────────
UPDATE public.users u
SET avatar_url = au.raw_user_meta_data->>'avatar_url'
FROM auth.users au
WHERE u.id = au.id
  AND u.avatar_url IS NULL
  AND au.raw_user_meta_data->>'avatar_url' IS NOT NULL;

-- ── 3. Backfill username from OAuth name for users with email-prefix usernames
--     (Only if the current username looks like an email prefix and the user
--      has a real name in OAuth metadata)
UPDATE public.users u
SET username = au.raw_user_meta_data->>'name'
FROM auth.users au
WHERE u.id = au.id
  AND au.raw_user_meta_data->>'name' IS NOT NULL
  AND au.raw_user_meta_data->>'name' != ''
  -- Only update if current username is null OR matches email prefix
  AND (
    u.username IS NULL
    OR u.username = SPLIT_PART(u.email, '@', 1)
  );