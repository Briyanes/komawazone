import { createClient } from '@/lib/supabase/server';
import { ChapterListClient } from '@/components/admin/ChapterListClient';

const PAGE_SIZE = 50;
type SortKey = 'release_date_desc' | 'release_date_asc' | 'created_at_desc' | 'number_desc' | 'number_asc';

interface Props {
  searchParams: Promise<{ page?: string; sort?: string; manga_id?: string; q?: string }>;
}

export default async function AdminChaptersPage({ searchParams }: Props) {
  const params  = await searchParams;
  const page    = Math.max(1, Number(params.page ?? 1));
  const sort    = (params.sort ?? 'release_date_desc') as SortKey;
  const mangaId = params.manga_id ?? '';
  const q       = (params.q ?? '').trim();
  const from    = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const sortMap: Record<SortKey, { col: string; asc: boolean }> = {
    release_date_desc: { col: 'release_date', asc: false },
    release_date_asc:  { col: 'release_date', asc: true  },
    created_at_desc:   { col: 'created_at',   asc: false },
    number_desc:       { col: 'number',        asc: false },
    number_asc:        { col: 'number',        asc: true  },
  };
  const { col, asc } = sortMap[sort] ?? sortMap.release_date_desc;

  let query = supabase
    .from('chapters')
    .select('id, number, title, manga_id, release_date, views, created_at, manga(title, slug)', { count: 'exact' })
    .is('deleted_at', null);

  if (mangaId) query = query.eq('manga_id', mangaId);
  if (q) {
    if (/^\d+$/.test(q)) query = query.eq('number', Number(q));
    else                  query = query.ilike('title', `%${q}%`);
  }

  query = query.order(col, { ascending: asc, nullsFirst: false }).range(from, from + PAGE_SIZE - 1);

  const [chaptersResult, { data: mangaOptions }] = await Promise.all([
    query,
    supabase.from('manga').select('id, title').is('deleted_at', null).order('title'),
  ]);

  type MangaRef = { title?: string; slug?: string };
  const chapters = (chaptersResult.data ?? []).map(ch => ({
    ...ch,
    manga: ch.manga as MangaRef | null,
  }));

  return (
    <ChapterListClient
      chapters={chapters}
      mangaOptions={mangaOptions ?? []}
      total={chaptersResult.count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      sort={sort}
      mangaIdFilter={mangaId}
      searchQuery={q}
    />
  );
}
