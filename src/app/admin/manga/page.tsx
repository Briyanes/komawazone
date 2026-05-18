import { createClient } from '@/lib/supabase/server';
import { MangaListClient } from '@/components/admin/MangaListClient';

export default async function AdminMangaPage() {
  const supabase = await createClient();
  const { data: mangaList } = await supabase
    .from('manga')
    .select('id, slug, title, status, views, rating, is_featured, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  return <MangaListClient mangaList={mangaList ?? []} />;
}
