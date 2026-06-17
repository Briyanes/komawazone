import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { importAllChapters } from '@/app/api/v1/admin/scrape/manga-chapters/route';

export const maxDuration = 300;

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

/**
 * POST /api/v1/admin/scrape/batch-incomplete
 * Find all manga with chapters that have no thumbnail_url (belum di-scrape),
 * then import chapters for each manga sequentially in the background.
 *
 * Body (optional):
 *   { limit?: number }  — max manga to process (default: 200)
 *   { offset?: number } — skip first N manga (for pagination)
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { limit?: number; offset?: number };
  const limit = Math.min(body.limit ?? 200, 500);
  const offset = body.offset ?? 0;

  // Query manga yang punya chapter tanpa thumbnail (belum di-scrape)
  // Gunakan chapters table untuk identifikasi manga unik
  const { data: incompleteManga, error } = await supabase
    .from('chapters')
    .select('manga_id')
    .is('thumbnail_url', null)
    .is('deleted_at', null)
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: `Query error: ${error.message}` }, { status: 500 });
  }

  // Deduplicate manga IDs
  const mangaIdSet = new Set<string>();
  for (const row of incompleteManga ?? []) {
    if (row.manga_id) mangaIdSet.add(row.manga_id as string);
  }

  const mangaIds = [...mangaIdSet].slice(offset, offset + limit);

  if (mangaIds.length === 0) {
    return NextResponse.json({
      status: 'success',
      message: 'Tidak ada manga yang perlu di-download. Semua sudah lengkap!',
      data: { count: 0 },
    });
  }

  // Get manga details (slug, title, source_url)
  const { data: mangaRecords } = await supabase
    .from('manga')
    .select('id, slug, title, source_url')
    .in('id', mangaIds) as unknown as { data: Array<{ id: string; slug: string; title: string; source_url: string | null }> | null };

  const mangaList = mangaRecords ?? [];

  // Create a master job for tracking
  const adminSupabase = createAdminClient();
  const { data: job } = await adminSupabase
    .from('import_jobs')
    .insert({
      job_type: 'batch_incomplete',
      status: 'running',
      total_items: mangaList.length,
      processed_items: 0,
      new_manga: 0,
      updated_manga: 0,
      skipped_items: 0,
      created_by: user.id,
    })
    .select('id')
    .single();

  const jobId = job?.id ?? null;

  // Process in background
  after(() => processBatchIncomplete(mangaList, jobId));

  return NextResponse.json({
    status: 'success',
    message: `Batch download dimulai untuk ${mangaList.length} manga yang belum lengkap. Proses berjalan di background.`,
    data: { count: mangaList.length, jobId },
  });
}

/**
 * Background processor: loop through manga sequentially.
 * Each manga uses importAllChapters with backfill mode.
 */
async function processBatchIncomplete(
  mangaList: Array<{ id: string; slug: string; title: string; source_url: string | null }>,
  jobId: string | null
) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  console.log(`[BatchImport] Starting for ${mangaList.length} manga (jobId=${jobId})`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateJob = async (updates: any) => {
    if (!jobId) return;
    try {
      await adminSupabase.from('import_jobs').update(updates).eq('id', jobId);
    } catch {
      // non-critical
    }
  };

  let processed = 0;
  let totalFailed = 0;

  for (const manga of mangaList) {
    try {
      // Build source URL
      let sourceUrl = manga.source_url;
      if (!sourceUrl) {
        const { data: firstSource } = await supabase
          .from('manga_sources')
          .select('base_url')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .single() as unknown as { data: { base_url: string } | null };
        const baseUrl = firstSource?.base_url?.replace(/\/$/, '') ?? 'https://04x.manhwaland.land';
        sourceUrl = `${baseUrl}/manga/${manga.slug}/`;
      }

      console.log(`[BatchImport] Processing ${processed + 1}/${mangaList.length}: ${manga.slug}`);

      // Create sub-job for this manga (optional — for individual tracking)
      const { data: subJob } = await adminSupabase
        .from('import_jobs')
        .insert({
          job_type: 'scrape_manga_chapters',
          status: 'running',
          total_items: 0,
          processed_items: 0,
          new_manga: 0,
          updated_manga: 0,
          skipped_items: 0,
          created_by: null,
          // Link to parent via metadata column if exists
        })
        .select('id')
        .single();

      // Run import (backfill mode — fetches images for existing chapters)
      await importAllChapters(manga.id, manga.slug, sourceUrl, false, subJob?.id ?? null);

      // Mark sub-job as completed (importAllChapters already does this, but just in case)
      processed++;
      await updateJob({
        processed_items: processed,
        // Don't update new/updated counts here — importAllChapters handles sub-job
      });

      // Brief pause between manga to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.error(`[BatchImport] Error processing ${manga.slug}:`, err);
      totalFailed++;
      processed++;
      await updateJob({
        processed_items: processed,
        skipped_items: totalFailed,
      });
    }
  }

  console.log(`[BatchImport] Done: ${processed} manga processed`);

  await updateJob({
    status: 'completed',
    processed_items: processed,
    completed_at: new Date().toISOString(),
  });
}