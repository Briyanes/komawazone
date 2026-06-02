-- Migration 025: Tambah kolom content_rating ke manga_sources
-- Setiap sumber dapat memiliki rating konten: 'general' (default) atau 'mature'.
-- Manga yang diimport dari sumber tersebut secara otomatis mendapat rating ini.

ALTER TABLE public.manga_sources
  ADD COLUMN IF NOT EXISTS content_rating TEXT NOT NULL DEFAULT 'general'
    CHECK (content_rating IN ('general', 'mature'));

COMMENT ON COLUMN public.manga_sources.content_rating IS
  'Rating konten sumber: general (default) atau mature. Manga yang diimport akan mendapat rating ini.';
