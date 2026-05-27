import { createClient } from '@/lib/supabase/server';
import { MangaListClient } from '@/components/admin/MangaListClient';
import type { Database } from '@/types/database';

type MangaRow = Pick<
  Database['public']['Tables']['manga']['Row'],
  'id' | 'slug' | 'title' | 'status' | 'content_rating' | 'views' | 'rating' | 'is_featured' | 'updated_at'
>;

export default async function AdminMangaPage() {
  const supabase = await createClient();

  // PostgREST default max-rows = 1000, pakai range pagination untuk ambil semua data
  const BATCH = 1000;
  const fields = 'id, slug, title, status, content_rating, views, rating, is_featured, updated_at';
  const mangaList: MangaRow[] = [];

  for (let page = 0; page < 10; page++) {
    const from = page * BATCH;
    const { data } = await supabase
      .from('manga')
      .select(fields)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    mangaList.push(...(data as MangaRow[]));
    if (data.length < BATCH) break;
  }

  return <MangaListClient mangaList={mangaList} />;
}
