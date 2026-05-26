-- Migration: Tambah kolom source_id ke tabel manga
-- Menghubungkan setiap manga ke sumber scraping-nya (manga_sources)
-- Digunakan untuk bulk import yang filter berdasarkan sumber aktif/nonaktif
-- Jalankan di Supabase SQL Editor

ALTER TABLE public.manga
  ADD COLUMN IF NOT EXISTS source_id UUID
    REFERENCES public.manga_sources(id) ON DELETE SET NULL;

-- Index untuk performa query filter
CREATE INDEX IF NOT EXISTS idx_manga_source_id ON public.manga(source_id);

-- Backfill: isi source_id untuk manga yang sudah ada berdasarkan kecocokan source_url
-- dengan base_url dari manga_sources (source_url harus diawali dengan base_url)
UPDATE public.manga m
SET source_id = ms.id
FROM public.manga_sources ms
WHERE m.source_id IS NULL
  AND m.source_url IS NOT NULL
  AND m.deleted_at IS NULL
  AND m.source_url LIKE ms.base_url || '%';
