import { createClient } from '@/lib/supabase/server';
import { ChapterListClient } from '@/components/admin/ChapterListClient';

export default async function AdminChaptersPage() {
  const supabase = await createClient();
  const [{ data: chapters }, { data: mangaOptions }] = await Promise.all([
    supabase
      .from('chapters')
      .select('id, number, title, manga_id, release_date, views, manga(title, slug)')
      .order('release_date', { ascending: false })
      .limit(200),
    supabase
      .from('manga')
      .select('id, title')
      .is('deleted_at', null)
      .order('title'),
  ]);

  const typedChapters = (chapters ?? []).map(ch => ({
    ...ch,
    manga: ch.manga as { title?: string; slug?: string } | null,
  }));

  return (
    <ChapterListClient
      chapters={typedChapters}
      mangaOptions={mangaOptions ?? []}
    />
  );
}
