import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadAndUploadToR2, isR2Url } from '@/lib/storage/r2';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

/**
 * POST /api/v1/admin/storage/backfill-public
 *
 * Download and upload covers for manga
 *
 * Body: { limit?: number, offset?: number }
 * - limit: max manga to process (default 50, max 200)
 * - offset: skip first N manga that are already in R2
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json() as { limit?: number; offset?: number } | null;
    const limit = Math.min(body?.limit ?? 50, 200);
    const offset = body?.offset ?? 0;

    const adminSupabase = createAdminClient();

    // Create import job for tracking
    const { data: job } = await adminSupabase
      .from('import_jobs')
      .insert({
        job_type: 'r2_backfill_public',
        status: 'running',
        total_items: 0,
        processed_items: 0,
        new_manga: 0,
        updated_manga: 0,
        skipped_items: 0,
        created_by: user.id,
      })
      .select('id')
      .single();

    const jobId = job?.id;

    // Run in background
    after(() => runBackfill(jobId ?? null, limit, offset));

    return NextResponse.json({
      status: 'success',
      message: `Backfill job started for ${limit} manga (offset: ${offset})`,
      jobId,
      limit,
    });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 }
    );
  }
}

async function runBackfill(jobId: string | null, limit: number, offset: number) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  let success = 0;
  const skipped = 0;
  let failed = 0;

  try {
    // Get all manga with covers
    const { data: allManga } = await adminSupabase
      .from('manga')
      .select('id, slug, title, cover_url')
      .is('deleted_at', null)
      .not('cover_url', 'is', null)
      .order('created_at', { ascending: false });

    if (!allManga || allManga.length === 0) {
      if (jobId) {
        await supabase
          .from('import_jobs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', jobId);
      }
      console.log('[Backfill Public] No manga found');
      return;
    }

    // Filter out those already in R2, then apply offset
    const needBackfill = allManga.filter(m => !isR2Url(m.cover_url!));
    const toProcess = needBackfill.slice(offset, offset + limit);

    console.log(`[Backfill Public] Processing ${toProcess.length} manga (offset: ${offset}, total needing: ${needBackfill.length})`);

    // Update job total
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({ total_items: toProcess.length })
        .eq('id', jobId);
    }

    // Process each manga
    for (let i = 0; i < toProcess.length; i++) {
      const manga = toProcess[i];

      try {
        console.log(`[Backfill Public] (${i + 1}/${toProcess.length}) ${manga.title}`);
        const r2Result = await downloadAndUploadToR2(manga.cover_url!, 'covers', manga.slug);

        if (r2Result.key) {
          await adminSupabase
            .from('manga')
            .update({ cover_url: r2Result.url })
            .eq('id', manga.id);
          success++;
          console.log(`[Backfill Public] ✓ ${manga.title}`);
        } else {
          failed++;
          console.log(`[Backfill Public] ✗ ${manga.title} - download failed`);
        }

        // Update progress
        if (jobId) {
          await supabase
            .from('import_jobs')
            .update({ processed_items: i + 1, updated_manga: success })
            .eq('id', jobId);
        }

        // Delay between requests
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));

      } catch (err) {
        failed++;
        console.error(`[Backfill Public] Error ${manga.title}:`, err);
      }
    }

    // Complete job
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({
          status: 'completed',
          processed_items: toProcess.length,
          updated_manga: success,
          skipped_items: skipped,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    console.log(`[Backfill Public] Done: ${success} succeeded, ${skipped} skipped, ${failed} failed`);

  } catch (error) {
    console.error('[Backfill Public] Fatal error:', error);
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', jobId);
    }
  }
}

/**
 * GET /api/v1/admin/storage/backfill-public
 *
 * Get status of public page manga covers
 */
export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();

  const { data: mangaList } = await adminSupabase
    .from('manga')
    .select('id, slug, title, cover_url, content_rating')
    .is('deleted_at', null)
    .not('cover_url', 'is', null);

  const withR2 = (mangaList ?? []).filter(m => m.cover_url && isR2Url(m.cover_url));
  const withoutR2 = (mangaList ?? []).filter(m => m.cover_url && !isR2Url(m.cover_url));

  return NextResponse.json({
    status: 'success',
    data: {
      total: mangaList?.length ?? 0,
      in_r2: withR2.length,
      need_backfill: withoutR2.length,
      without_r2: withoutR2.slice(0, 10).map(m => ({  // Only show first 10
        id: m.id,
        title: m.title,
        cover_url: m.cover_url,
      })),
    },
  });
}
