-- 058: View counter atomik + aman (audit dashboard 2026-10-03)
--
-- Masalah lama: /api/v1/chapters/[id]/view melakukan read-modify-write
-- (baca views → +1 → tulis) non-atomik: race condition kehilangan hitungan
-- pada traffic bersamaan, dan bot bisa menggelembungkan views tanpa batas.
--
-- Solusi: fungsi SECURITY DEFINER yang melakukan increment atomik dalam
-- satu statement SQL, mengabaikan chapter yang di-soft-delete, dan
-- menaikkan views manga terkait sekali saja.

CREATE OR REPLACE FUNCTION public.increment_chapter_views(p_chapter_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chapters
     SET views = COALESCE(views, 0) + 1
   WHERE id = p_chapter_id
     AND deleted_at IS NULL;

  UPDATE manga
     SET views = COALESCE(views, 0) + 1
   WHERE id = (SELECT manga_id FROM chapters WHERE id = p_chapter_id AND deleted_at IS NULL);
END;
$$;

-- Panggil dari PostgREST dengan anon/authenticated key (reader publik)
GRANT EXECUTE ON FUNCTION public.increment_chapter_views(uuid) TO anon, authenticated;
