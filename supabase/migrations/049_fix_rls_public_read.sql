-- ═══════════════════════════════════════════════════════════════════════════
-- 🚨 CRITICAL FIX: RLS Policies Blocking Public Read Access
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- PROBLEM: Website (olluq.com) shows empty pages despite DB having 3,555 manga
--          and 43,052 chapters. Anon key returns 0 rows for all tables.
-- CAUSE:   RLS policies are blocking public (anon) SELECT access.
-- FIX:     Create permissive public read policies for all content tables.
--
-- ⚠️  RUN THIS IN SUPABASE SQL EDITOR:
--     https://supabase.com/dashboard/project/qxevzzxjpdoryupeborm/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Enable RLS on all content tables
ALTER TABLE IF EXISTS public.manga ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chapter_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.manga_genres ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL conflicting/old policies on manga
DROP POLICY IF EXISTS "Public can read all manga" ON public.manga;
DROP POLICY IF EXISTS "Users can read manga based on VIP status" ON public.manga;
DROP POLICY IF EXISTS "Public manga read" ON public.manga;
DROP POLICY IF EXISTS "Anyone can read manga" ON public.manga;

-- Step 3: Drop ALL conflicting/old policies on chapters
DROP POLICY IF EXISTS "Public can read all chapters" ON public.chapters;
DROP POLICY IF EXISTS "Users can read chapters based on manga VIP status" ON public.chapters;
DROP POLICY IF EXISTS "Public chapters read" ON public.chapters;

-- Step 4: Drop old policies on other tables
DROP POLICY IF EXISTS "Public can read chapter_images" ON public.chapter_images;
DROP POLICY IF EXISTS "Public can read genres" ON public.genres;
DROP POLICY IF EXISTS "Public can read manga_genres" ON public.manga_genres;

-- Step 5: Create permissive public read policies
-- Manga: public can read all non-deleted manga
CREATE POLICY "Public can read all manga" 
  ON public.manga FOR SELECT 
  USING (deleted_at IS NULL);

-- Chapters: public can read all non-deleted chapters
CREATE POLICY "Public can read all chapters" 
  ON public.chapters FOR SELECT 
  USING (deleted_at IS NULL);

-- Chapter images: public can read all
CREATE POLICY "Public can read chapter_images" 
  ON public.chapter_images FOR SELECT 
  USING (true);

-- Genres: public can read all
CREATE POLICY "Public can read genres" 
  ON public.genres FOR SELECT 
  USING (true);

-- Manga-genres junction: public can read all
CREATE POLICY "Public can read manga_genres" 
  ON public.manga_genres FOR SELECT 
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (run after to confirm fix):
--   SELECT count(*) FROM manga;      -- should return 3555
--   SELECT count(*) FROM chapters;   -- should return 43052
-- ═══════════════════════════════════════════════════════════════════════════