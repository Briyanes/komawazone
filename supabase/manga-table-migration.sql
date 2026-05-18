-- ============================================================================
-- Migration: Add Missing Columns to manga table
-- ============================================================================
-- Jalankan SQL ini di Supabase SQL Editor untuk menambahkan kolom yang hilang
-- ============================================================================

-- Tambah kolom genres (array of text, dengan default empty array)
ALTER TABLE manga 
  ADD COLUMN IF NOT EXISTS genres text[] DEFAULT '{}' NOT NULL;

-- Tambah kolom type
ALTER TABLE manga 
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'MANGA' NOT NULL;

-- Tambah kolom author
ALTER TABLE manga 
  ADD COLUMN IF NOT EXISTS author text;

-- Tambah kolom artist
ALTER TABLE manga 
  ADD COLUMN IF NOT EXISTS artist text;

-- Tambah kolom banner_url
ALTER TABLE manga 
  ADD COLUMN IF NOT EXISTS banner_url text;

-- Tambah kolom alt_title
ALTER TABLE manga 
  ADD COLUMN IF NOT EXISTS alt_title text;

-- Tambah kolom release_year
ALTER TABLE manga 
  ADD COLUMN IF NOT EXISTS release_year integer;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify kolom sudah ada
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'manga'
ORDER BY ordinal_position;
