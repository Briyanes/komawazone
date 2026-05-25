import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300;

/**
 * POST /api/v1/admin/scrape/bulk-chapters
 * Trigger import chapters untuk SEMUA manga yang punya source_url.
 * Cocok untuk admin yang mau "sync semua sekaligus" tanpa klik satu-satu.
 *
 * Body (opsional): { limit?: number; onlyMissing?: boolean }
 * - limit: max berapa manga diproses (default 50, max 200)
 * - onlyMissing: kalau true, hanya manga yang belum punya chapter sama sekali
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { limit?: number; onlyMissing?: boolean } | null;
  const limit = Math.min(body?.limit ?? 50, 200);
  const onlyMissing = body?.onlyMissing ?? false;

  // Ambil manga dengan source_url
  let query = supabase
    .from('manga')
    .select('id, slug, title, source_url')
    .not('source_url', 'is', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: true })
    .limit(limit);

  const { data: mangaList, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!mangaList || mangaList.length === 0) {
    return NextResponse.json({ status: 'success', message: 'Tidak ada manga dengan source_url', queued: 0 });
  }

  type MangaItem = { id: string; slug: string; title: string; source_url: string };
  let targets = mangaList as MangaItem[];

  if (onlyMissing) {
    // Saring hanya manga yang belum punya chapter sama sekali
    const { data: withChapters } = await supabase
      .from('chapters')
      .select('manga_id')
      .in('manga_id', targets.map(m => m.id))
      .is('deleted_at', null);

    const hasChapters = new Set((withChapters ?? []).map(c => c.manga_id));
    targets = targets.filter(m => !hasChapters.has(m.id));
  }

  if (targets.length === 0) {
    return NextResponse.json({ status: 'success', message: 'Semua manga sudah punya chapters', queued: 0 });
  }

  // Buat import job untuk tracking
  const { data: job } = await supabase
    .from('import_jobs')
    .insert({
      job_type: 'bulk_chapters',
      status: 'running',
      total_items: targets.length,
      processed_items: 0,
      new_manga: 0,
      updated_manga: 0,
      skipped_items: 0,
      created_by: user.id,
    })
    .select('id')
    .single();

  const jobId = job?.id;

  // Jalankan di background
  after(() => runBulkImport(targets, jobId ?? null));

  return NextResponse.json({
    status: 'success',
    message: `Bulk import dimulai untuk ${targets.length} manga`,
    queued: targets.length,
    jobId,
  });
}

async function runBulkImport(
  targets: Array<{ id: string; slug: string; title: string; source_url: string }>,
  jobId: string | null
) {
  const supabase = await createClient();
  const { importAllChapters } = await import('@/app/api/v1/admin/scrape/manga-chapters/route');

  let done = 0;
  let failed = 0;

  for (const manga of targets) {
    try {
      console.log(`[BulkImport] (${done + 1}/${targets.length}) ${manga.title}`);
      await importAllChapters(manga.id, manga.slug, manga.source_url);
      done++;
    } catch (err) {
      console.error(`[BulkImport] Failed ${manga.slug}:`, err);
      failed++;
    }

    // Update progress di job
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({ processed_items: done + failed, updated_manga: done })
        .eq('id', jobId);
    }

    // Delay antar manga
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
  }

  // Selesai
  if (jobId) {
    await supabase
      .from('import_jobs')
      .update({
        status: failed === targets.length ? 'failed' : 'completed',
        processed_items: targets.length,
        updated_manga: done,
        skipped_items: failed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }

  console.log(`[BulkImport] Done: ${done} succeeded, ${failed} failed`);
}
