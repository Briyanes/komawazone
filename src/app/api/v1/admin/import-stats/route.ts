import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/v1/admin/import-stats
 * Data untuk Import Dashboard: total manga, chapter, jobs terbaru
 *
 * Uses `get_import_stats()` RPC (migration 034) for O(1) performance.
 * Falls back to pagination-based counting if RPC doesn't exist yet.
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

  // Fetch recent jobs (cheap query)
  const { data: recentJobs } = await supabase
    .from('import_jobs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);

  // ── Fast path: use RPC function (migration 034) ─────────────────────────
  // Use unknown cast (not `any`) to satisfy ESLint while calling untyped RPC
  const rpcResult = await (supabase as unknown as {
    rpc: (fn: string) => { maybeSingle: () => Promise<{ data: Record<string, number> | null; error: { message: string } | null }> };
  }).rpc('get_import_stats').maybeSingle();
  const { data: rpcData, error: rpcErr } = rpcResult;

  if (!rpcErr && rpcData) {
    return NextResponse.json({
      status: 'success',
      data: {
        totalManga: rpcData.total_manga ?? 0,
        mangaWithSource: rpcData.manga_with_source ?? 0,
        totalChapters: rpcData.total_chapters ?? 0,
        mangaWithoutChapters: rpcData.manga_without_chapters ?? 0,
        recentJobs: recentJobs ?? [],
      },
    });
  }

  // ── Fallback: pagination-based counting (legacy) ────────────────────────
  const [
    { count: totalManga },
    { count: mangaWithSource },
  ] = await Promise.all([
    supabase.from('manga').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('manga').select('id', { count: 'exact', head: true })
      .not('source_url', 'is', null).is('deleted_at', null),
  ]);

  // Fetch all active manga IDs — prevents negative counts after soft-deletes
  const activeMangaIds = new Set<string>();
  let mangaPage = 0;
  const MANGA_PAGE_SIZE = 1000;

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

  const mangaWithChaptersSet = new Set<string>();
  let activeChapterCount = 0;
  let chapPage = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data: page } = await supabase
      .from('chapters')
      .select('manga_id')
      .is('deleted_at', null)
      .range(chapPage * PAGE_SIZE, (chapPage + 1) * PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    for (const c of page) {
      if (activeMangaIds.has(c.manga_id)) {
        mangaWithChaptersSet.add(c.manga_id);
        activeChapterCount++;
      }
    }
    if (page.length < PAGE_SIZE) break;
    chapPage++;
  }

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