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
    supabase.from('import_jobs').select('*').order('started_at', { ascending: false }).limit(20),
  ]);

  const mangaWithChaptersSet = new Set((chaptersGrouped ?? []).map(c => c.manga_id));
  const { data: allMangaIds } = await supabase
    .from('manga').select('id').is('deleted_at', null);
  const mangaWithoutChapters = (allMangaIds ?? []).filter(m => !mangaWithChaptersSet.has(m.id)).length;

  // Auto-cancel zombie jobs: RUNNING jobs older than 15 minutes are considered timed out
  const TIMEOUT_MS = 15 * 60 * 1000;
  const zombieJobs = (recentJobs ?? []).filter(j => {
    if (j.status !== 'running') return false;
    const age = Date.now() - new Date(j.started_at as string).getTime();
    return age > TIMEOUT_MS;
  });
  if (zombieJobs.length > 0) {
    await Promise.all(
      zombieJobs.map(j =>
        supabase
          .from('import_jobs')
          .update({ status: 'failed', error_message: 'Timed out (auto-cancelled after 15 min)', completed_at: new Date().toISOString() })
          .eq('id', j.id)
      )
    );
    // Reflect updated status in the response
    for (const job of recentJobs ?? []) {
      if (zombieJobs.some(z => z.id === job.id)) {
        (job as Record<string, unknown>).status = 'failed';
        (job as Record<string, unknown>).error_message = 'Timed out (auto-cancelled after 15 min)';
      }
    }
  }

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
