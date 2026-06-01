import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/v1/admin/import-stats
 * Data untuk Import Dashboard: total manga, chapter, jobs terbaru
 */
export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [
    { count: totalManga },
    { count: mangaWithSource },
    { count: totalChapters },
    { data: chaptersGrouped },
    { data: recentJobs },
  ] = await Promise.all([
    supabase.from('manga').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('manga').select('id', { count: 'exact', head: true })
      .not('source_url', 'is', null).is('deleted_at', null),
    supabase.from('chapters').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    // Manga yang punya chapters → hitung yang belum punya
    supabase.from('chapters').select('manga_id').is('deleted_at', null),
    supabase.from('import_jobs').select('*').order('started_at', { ascending: false }).limit(50),
  ]);

  const mangaWithChaptersSet = new Set((chaptersGrouped ?? []).map(c => c.manga_id));
  const { data: allMangaIds } = await supabase
    .from('manga').select('id').is('deleted_at', null);
  const mangaWithoutChapters = (allMangaIds ?? []).filter(m => !mangaWithChaptersSet.has(m.id)).length;

  return NextResponse.json({
    status: 'success',
    data: {
      totalManga: totalManga ?? 0,
      mangaWithSource: mangaWithSource ?? 0,
      totalChapters: totalChapters ?? 0,
      mangaWithoutChapters,
      recentJobs: recentJobs ?? [],
    },
  });
}
