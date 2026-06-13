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
    { data: recentJobs },
  ] = await Promise.all([
    supabase.from('manga').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('manga').select('id', { count: 'exact', head: true })
      .not('source_url', 'is', null).is('deleted_at', null),
    supabase.from('import_jobs').select('*').order('started_at', { ascending: false }).limit(50),
  ]);

  // Fetch all active (non-soft-deleted) manga IDs so we only count chapters
  // belonging to active manga — prevents negative counts after soft-deletes
  const activeMangaIds = new Set<string>();
  let mangaPage = 0;
  const MANGA_PAGE_SIZE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: mPage } = await supabase
      .from('manga')
      .select('id')
      .is('deleted_at', null)
      .range(mangaPage * MANGA_PAGE_SIZE, (mangaPage + 1) * MANGA_PAGE_SIZE - 1);
    if (!mPage || mPage.length === 0) break;
    for (const m of mPage) activeMangaIds.add(m.id);
    if (mPage.length < MANGA_PAGE_SIZE) break;
    mangaPage++;
  }

  // Count active manga WITH chapters + total active chapters
  // using pagination-aware approach
  const mangaWithChaptersSet = new Set<string>();
  let activeChapterCount = 0;
  let chapPage = 0;
  const PAGE_SIZE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: page } = await supabase
      .from('chapters')
      .select('manga_id')
      .is('deleted_at', null)
      .range(chapPage * PAGE_SIZE, (chapPage + 1) * PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    for (const c of page) {
      // Only count if the manga is still active (not soft-deleted)
      if (activeMangaIds.has(c.manga_id)) {
        mangaWithChaptersSet.add(c.manga_id);
        activeChapterCount++;
      }
    }
    if (page.length < PAGE_SIZE) break;
    chapPage++;
  }

  // Count manga WITHOUT chapters — only among active manga
  const mangaWithoutChapters = (totalManga ?? 0) - mangaWithChaptersSet.size;

  return NextResponse.json({
    status: 'success',
    data: {
      totalManga: totalManga ?? 0,
      mangaWithSource: mangaWithSource ?? 0,
      totalChapters: activeChapterCount,
      mangaWithoutChapters,
      recentJobs: recentJobs ?? [],
    },
  });
}
