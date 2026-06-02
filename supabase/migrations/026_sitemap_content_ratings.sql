-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 026 — Per-sitemap content_rating override
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Setiap sitemap URL dalam satu sumber bisa punya rating berbeda.
-- Contoh: sitemap-manhwa.xml = general, sitemap-mature.xml = mature
-- Format: { "https://example.com/sitemap-mature.xml": "mature" }
-- Jika URL tidak ada di kolom ini, pakai source.content_rating sebagai default.

ALTER TABLE public.manga_sources
  ADD COLUMN IF NOT EXISTS sitemap_content_ratings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.manga_sources.sitemap_content_ratings IS
  'Map dari sitemap URL ke content_rating override. Format: { "url": "general"|"mature" }. URL yang tidak ada di map akan menggunakan source.content_rating sebagai default.';
