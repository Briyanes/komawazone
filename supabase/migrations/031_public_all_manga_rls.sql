-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 031 — Remove mature content filtering from RLS
--
-- Logic change: ALL manga (general + mature) now visible to ALL users
-- (guest, non-VIP, VIP, admin) at the database level.
--
-- Mature gating is now handled entirely in the application layer:
--   - Chapter reader: 3 free preview chapters, chapter 4+ requires VIP
--   - MangaCard shows 18+ badge for mature content
--
-- This fixes the issue where guests couldn't see mature manga on the
-- homepage, even though they should be able to see them (with preview).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 1. Drop the old restrictive manga policy ─────────────────────────────
DROP POLICY IF EXISTS "Users can read manga based on VIP status" ON public.manga;

-- ── 2. New permissive policy: everyone can read all non-deleted manga ────
CREATE POLICY "Public can read all manga"
  ON public.manga FOR SELECT
  USING (deleted_at IS NULL);

-- ── 3. Drop the old restrictive chapters policy ──────────────────────────
DROP POLICY IF EXISTS "Users can read chapters based on manga VIP status" ON public.chapters;

-- ── 4. New permissive policy: everyone can read all non-deleted chapters ─
CREATE POLICY "Public can read all chapters"
  ON public.chapters FOR SELECT
  USING (deleted_at IS NULL);

-- ── 5. Note: Admins policy ("Admins can manage manga") remains unchanged ─
-- It uses FOR ALL and grants full access to ADMIN role users.