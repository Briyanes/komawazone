-- ============================================================================
-- DIAGNOSTIC & FIX untuk Storage Policies
-- ============================================================================

-- STEP 1: Check apakah bucket ada
SELECT * FROM storage.buckets WHERE id = 'manga-images';
-- Harusnya return 1 row dengan public = true

-- STEP 2: Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
-- Jika ada policy dengan nama yang sama, kita perlu drop dulu

-- STEP 3: Drop existing policies (jika ada konflik)
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete" ON storage.objects;

-- STEP 4: Enable RLS (jika belum)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- STEP 5: Create policies dengan nama unik
CREATE POLICY "manga_images_authenticated_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'manga-images');

CREATE POLICY "manga_images_public_access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'manga-images');

CREATE POLICY "manga_images_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'manga-images');

CREATE POLICY "manga_images_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'manga-images');

-- STEP 6: Verify policies created
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE 'manga_images%';

-- ============================================================================
-- Expected result: 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- ============================================================================
