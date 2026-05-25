-- Migration: Tambah tabel manga_sources untuk manajemen sumber scraping
-- Jalankan di Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.manga_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  base_url    TEXT NOT NULL UNIQUE,
  sitemap_urls TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  type        TEXT CHECK (type IN ('MANHWA', 'MANGA', 'MANHUA', 'MIXED')) DEFAULT 'MANHWA',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: sumber default (manhwaland)
INSERT INTO public.manga_sources (name, base_url, sitemap_urls, is_active, type, notes)
VALUES (
  'ManhwaLand',
  'https://04x.manhwaland.land',
  ARRAY[
    'https://04x.manhwaland.land/manga-sitemap.xml',
    'https://04x.manhwaland.land/manga-sitemap2.xml',
    'https://04x.manhwaland.land/manga-sitemap3.xml',
    'https://04x.manhwaland.land/manga-sitemap4.xml',
    'https://04x.manhwaland.land/manga-sitemap5.xml',
    'https://04x.manhwaland.land/manga-sitemap6.xml',
    'https://04x.manhwaland.land/manga-sitemap7.xml'
  ],
  true,
  'MANHWA',
  'Sumber utama manhwa'
)
ON CONFLICT (base_url) DO NOTHING;

-- RLS: hanya admin yang bisa baca/tulis
ALTER TABLE public.manga_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_manga_sources" ON public.manga_sources
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_manga_sources_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_manga_sources_updated_at
  BEFORE UPDATE ON public.manga_sources
  FOR EACH ROW EXECUTE FUNCTION update_manga_sources_updated_at();
