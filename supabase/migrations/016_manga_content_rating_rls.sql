-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 016 — RLS untuk content_rating: filter mature content untuk non-VIP
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 1. Helper function untuk cek VIP status (handle NULL untuk guest) ────
CREATE OR REPLACE FUNCTION public.is_user_vip(user_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    vip_expires_at > NOW(),
    false
  ) FROM public.users WHERE id = user_uid;
$$ LANGUAGE sql STABLE;

-- ── 2. Drop old policy ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can read manga" ON public.manga;

-- ── 3. New policy: Guest + Non-VIP see general only, VIP + Admin see all ──
CREATE POLICY "Users can read manga based on VIP status"
  ON public.manga FOR SELECT
  USING (
    deleted_at IS NULL AND (
      -- Admins can see everything
      EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'ADMIN'
      )
      OR
      -- VIP users can see everything
      (auth.uid() IS NOT NULL AND public.is_user_vip(auth.uid()))
      OR
      -- Guests (not logged in) and Non-VIP users can only see general content
      content_rating = 'general'
    )
  );

-- ── 4. Update Admins policy to ensure they bypass all restrictions ───────
DROP POLICY IF EXISTS "Admins can manage manga" ON public.manga;
CREATE POLICY "Admins can manage manga"
  ON public.manga FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- ── 5. Similar policy for chapters ───────────────────────────────────────
-- Chapters should also respect content_rating of their parent manga
DROP POLICY IF EXISTS "Public can read chapters" ON public.chapters;
CREATE POLICY "Users can read chapters based on manga VIP status"
  ON public.chapters FOR SELECT
  USING (
    deleted_at IS NULL AND (
      -- Admins can see everything
      EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'ADMIN'
      )
      OR
      -- VIP users can see everything
      (auth.uid() IS NOT NULL AND public.is_user_vip(auth.uid()))
      OR
      -- Guests and Non-VIP users can only see chapters from general content
      EXISTS (
        SELECT 1 FROM public.manga
        WHERE id = chapters.manga_id
          AND manga.content_rating = 'general'
          AND manga.deleted_at IS NULL
      )
    )
  );
