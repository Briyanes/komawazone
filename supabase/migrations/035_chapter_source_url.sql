-- Add source_url column to chapters table
-- This stores the original URL of the chapter on the source site (e.g. manhwaland)
-- Used for reliable lazy-loading of images when chapter_images is empty or dead.
--
-- Before this, the lazy-loader guessed the URL from manga.source_url + chapter number,
-- which was fragile (different sites use different URL patterns).
-- Now the import scripts can store the exact source URL per chapter.

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS source_url text;

-- Index for faster lookups when backfilling
CREATE INDEX IF NOT EXISTS idx_chapters_source_url ON public.chapters(source_url) WHERE source_url IS NOT NULL;

COMMENT ON COLUMN public.chapters.source_url IS 'Original chapter URL from source site (e.g. manhwaland). Used for lazy-loading images.';