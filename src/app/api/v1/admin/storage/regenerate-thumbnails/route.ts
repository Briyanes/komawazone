import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

/**
 * POST /api/v1/admin/storage/regenerate-thumbnails
 *
 * Regenerate chapter thumbnails using the 5th image (index 4) from chapter_images.
 * If a chapter has fewer than 5 images, falls back to the first image.
 *
 * Body: { mangaId?: string, limit?: number }
 * - mangaId: if provided, only process chapters for this specific manga
 * - limit: max chapters to process (default 500, max 2000)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json() as { mangaId?: string; limit?: number } | null;
    const mangaId = body?.mangaId;
    const limit = Math.min(body?.limit ?? 500, 2000);

    const adminSupabase = createAdminClient();

    // Find chapters that have images but thumbnail_url may be wrong/missing
    const query = adminSupabase
      .from('chapters')
      .select('id, number, manga_id')
      .is('deleted_at', null)
      .order('number');

    const { data: chapters, error } = mangaId
      ? await query.eq('manga_id', mangaId).limit(limit)
      : await query.limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ status: 'success', message: 'No chapters found' });
    }

    // Create import job for tracking
    const { data: job } = await adminSupabase
      .from('import_jobs')
      .insert({
        job_type: 'regenerate_thumbnails',
        status: 'running',
        total_items: chapters.length,
        processed_items: 0,
        new_manga: 0,
        updated_manga: 0,
        skipped_items: 0,
        created_by: user.id,
      })
      .select('id')
      .single();

    const jobId = job?.id ?? null;

    // Run in background
    after(() => runRegenerate(jobId, chapters));

    return NextResponse.json({
      status: 'success',
      message: `Regenerate thumbnails job started for ${chapters.length} chapters`,
      jobId,
      total: chapters.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Regenerate failed' },
      { status: 500 }
    );
  }
}

// ── Background worker ────────────────────────────────────────────────────────
async function runRegenerate(
  jobId: string | null,
  chapters: Array<{ id: string; number: number; manga_id: string }>
) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`[RegenerateThumbnails] Processing ${chapters.length} chapters...`);

  try {
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      try {
        // Fetch all images for this chapter, ordered by number
        const { data: images, error: imgErr } = await adminSupabase
          .from('chapter_images')
          .select('id, image_url, number')
          .eq('chapter_id', chapter.id)
          .order('number', { ascending: true });

        if (imgErr) {
          console.error(`[RegenerateThumbnails] Error fetching images for ch.${chapter.number}:`, imgErr.message);
          failed++;
          continue;
        }

        if (!images || images.length === 0) {
          skipped++;
          continue;
        }

        // Use 5th image (index 4) as thumbnail, fallback to first
        const thumbnailUrl = images.length >= 5 ? images[4].image_url : images[0].image_url;

        const { error: updateErr } = await adminSupabase
          .from('chapters')
          .update({ thumbnail_url: thumbnailUrl })
          .eq('id', chapter.id);

        if (updateErr) {
          console.error(`[RegenerateThumbnails] Error updating ch.${chapter.number}:`, updateErr.message);
          failed++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`[RegenerateThumbnails] Error ch.${chapter.number}:`, err);
        failed++;
      }

      // Update job progress in batches (every 10 chapters) to reduce DB writes
      if (jobId && (i + 1) % 10 === 0) {
        await supabase
          .from('import_jobs')
          .update({
            processed_items: i + 1,
            updated_manga: updated,
            skipped_items: skipped + failed,
          })
          .eq('id', jobId);
      }
    }

    // Complete job
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({
          status: 'completed',
          processed_items: chapters.length,
          updated_manga: updated,
          skipped_items: skipped + failed,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    console.log(`[RegenerateThumbnails] Done: ${updated} updated, ${skipped} skipped (no images), ${failed} failed`);
  } catch (error) {
    console.error('[RegenerateThumbnails] Fatal error:', error);
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', jobId);
    }
  }
}

/**
 * GET /api/v1/admin/storage/regenerate-thumbnails
 *
 * Get stats about thumbnail regeneration potential
 */
export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();

  // Count total chapters
  const { count: totalChapters } = await adminSupabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  // Count chapters with null thumbnail
  const { count: nullThumbnails } = await adminSupabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .is('thumbnail_url', null);

  // Check for running job
  const { data: runningJob } = await adminSupabase
    .from('import_jobs')
    .select('id, processed_items, total_items, status, created_at')
    .eq('job_type', 'regenerate_thumbnails')
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    status: 'success',
    data: {
      total_chapters: totalChapters ?? 0,
      null_thumbnails: nullThumbnails ?? 0,
      running_job: runningJob ?? null,
    },
  });
}