-- ============================================================================
-- Supabase Storage Policies untuk Bucket: manga-images
-- ============================================================================
-- 
-- CATATAN: Sebelum menjalankan SQL ini, pastikan bucket 'manga-images' 
-- sudah dibuat di Supabase Dashboard > Storage > New bucket
-- 
-- ============================================================================

-- 1. Policy: Allow authenticated users to upload
CREATE POLICY "Allow authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'manga-images');

-- 2. Policy: Allow public to view images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'manga-images');

-- 3. Policy: Allow authenticated users to delete
CREATE POLICY "Allow authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'manga-images');

-- ============================================================================
-- Selesai! Sekarang Anda bisa upload gambar dari dashboard admin
-- ============================================================================
