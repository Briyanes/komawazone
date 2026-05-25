-- 021 — Add source_url to manga table
-- Stores the original scrape URL so chapters can be imported later

ALTER TABLE public.manga
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS type       TEXT CHECK (type IN ('MANGA','MANHWA','MANHUA','WEBTOON'));

COMMENT ON COLUMN public.manga.source_url IS 'Original URL from the source site (manhwaland, etc.) used for chapter scraping';
COMMENT ON COLUMN public.manga.type       IS 'Manga type: MANGA, MANHWA, MANHUA, WEBTOON';

CREATE INDEX IF NOT EXISTS idx_manga_source_url ON public.manga(source_url) WHERE source_url IS NOT NULL;
