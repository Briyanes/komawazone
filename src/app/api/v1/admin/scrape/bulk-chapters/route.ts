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

  const body = await req.json() as { limit?: number; onlyMissing?: boolean; metadataOnly?: boolean } | null;
  const limit = Math.min(body?.limit ?? 50, 200);
  const onlyMissing = body?.onlyMissing ?? false;
  // metadataOnly=true: hanya simpan daftar chapter, tanpa scrape gambar (jauh lebih cepat)
  // Gambar di-fetch secara lazy saat chapter pertama kali dibuka
  const metadataOnly = body?.metadataOnly ?? true;

  // Ambil source yang aktif untuk filtering
  // Manga dengan source_id NULL (ditambah manual) tetap diproses
  // Manga dengan source_id yang nonaktif akan dilewati
  const { data: activeSources } = await supabase
    .from('manga_sources')
    .select('id')
    .eq('is_active', true);
  const activeSourceIds = (activeSources ?? []).map(s => s.id as string);

  // Ambil manga dengan source_url
  // Jika onlyMissing: ambil manga yang BELUM punya chapter sama sekali (filter di DB level)
  type MangaItem = { id: string; slug: string; title: string; source_url: string };
  let targets: MangaItem[] = [];

  // Filter sumber aktif: source_id IS NULL (manual) ATAU source_id ada di daftar aktif
  const sourceFilter = activeSourceIds.length > 0
    ? `source_id.is.null,source_id.in.(${activeSourceIds.join(',')})`
    : 'source_id.is.null'; // tidak ada sumber aktif → hanya manga manual

  if (onlyMissing) {
    // Ambil semua manga_id yang sudah punya chapter (tidak batasi — perlu tahu semua)
    const { data: withChaptersAll } = await supabase
      .from('chapters')
      .select('manga_id')
      .is('deleted_at', null);

    const hasChapters = new Set((withChaptersAll ?? []).map(c => c.manga_id as string));

    // Ambil manga dengan source_url dari sumber aktif yang belum ada di hasChapters
    const { data: allMangaWithSource, error } = await supabase
      .from('manga')
      .select('id, slug, title, source_url')
      .not('source_url', 'is', null)
      .is('deleted_at', null)
      .or(sourceFilter)
      .order('updated_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    targets = ((allMangaWithSource ?? []) as MangaItem[])
      .filter(m => !hasChapters.has(m.id))
      .slice(0, limit);
  } else {
    const { data: mangaList, error } = await supabase
      .from('manga')
      .select('id, slug, title, source_url')
      .not('source_url', 'is', null)
      .is('deleted_at', null)
      .or(sourceFilter)
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    targets = (mangaList ?? []) as MangaItem[];
  }

  if (targets.length === 0) {
    return NextResponse.json({
      status: 'success',
      message: onlyMissing ? 'Semua manga (dengan source_url) sudah punya chapters' : 'Tidak ada manga dengan source_url',
      queued: 0,
    });
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
  after(() => runBulkImport(targets, jobId ?? null, metadataOnly));

  return NextResponse.json({
    status: 'success',
    message: `Bulk import dimulai untuk ${targets.length} manga dari ${activeSourceIds.length} sumber aktif (${metadataOnly ? 'metadata only' : 'full import'})`,
    queued: targets.length,
    jobId,
    metadataOnly,
    activeSources: activeSourceIds.length,
  });
}

async function runBulkImport(
  targets: Array<{ id: string; slug: string; title: string; source_url: string }>,
  jobId: string | null,
  metadataOnly = true
) {
  const supabase = await createClient();
  const { importAllChapters } = await import('@/app/api/v1/admin/scrape/manga-chapters/route');

  let done = 0;
  let failed = 0;

  for (const manga of targets) {
    try {
      console.log(`[BulkImport] (${done + 1}/${targets.length}) ${manga.title}`);
      await importAllChapters(manga.id, manga.slug, manga.source_url, metadataOnly);
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

    // Delay antar manga (lebih pendek di metadata-only mode karena tidak ada image scraping)
    const delay = metadataOnly ? 500 + Math.random() * 500 : 2000 + Math.random() * 2000;
    await new Promise(r => setTimeout(r, delay));
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
