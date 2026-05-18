-- ============================================================================
-- STEP 1: Check kolom yang ada di tabel manga
-- (Jalankan ini dulu, lihat hasilnya)
-- ============================================================================
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'manga'
ORDER BY ordinal_position;
