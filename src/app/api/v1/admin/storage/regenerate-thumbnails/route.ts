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

    // Step 1: Prioritize chapters with NULL thumbnail (most critical)
    let q1 = adminSupabase
      .from('chapters')
      .select('id, number, manga_id')
      .is('deleted_at', null)
      .is('thumbnail_url', null);
    if (mangaId) q1 = q1.eq('manga_id', mangaId);
    const nullResult = await q1.order('number').limit(limit);

    if (nullResult.error) {
      return NextResponse.json({ error: nullResult.error.message }, { status: 500 });
    }

    let chapters = nullResult.data ?? [];
    const nullCount = chapters.length;

    // Step 2: If fewer than limit, fill with chapters that have thumbnails (fix wrong ones)
    if (chapters.length < limit) {
      const remaining = limit - chapters.length;
      let q2 = adminSupabase
        .from('chapters')
        .select('id, number, manga_id')
        .is('deleted_at', null)
        .not('thumbnail_url', 'is', null);
      if (mangaId) q2 = q2.eq('manga_id', mangaId);
      const fillResult = await q2.order('number').limit(remaining);

      if (fillResult.data && fillResult.data.length > 0) {
        chapters = [...chapters, ...fillResult.data];
      }
    }

    if (chapters.length === 0) {
      return NextResponse.json({ status: 'success', message: 'No chapters found to process' });
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
      message: `Regenerate thumbnails job started for ${chapters.length} chapters (${nullCount} new + ${chapters.length - nullCount} re-fix)`,
      jobId,
      total: chapters.length,
      nullThumbnails: nullCount,
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

        // Use 5th image (index 4) as thumbnail, fallback to LAST image
        const thumbnailUrl = images.length >= 5 ? images[4].image_url : images[images.length - 1].image_url;

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
 * Get stats about thumbnail regeneration potential.
 *
 * Query params:
 *  - detailed=1  → sample up to 100 chapters with their current thumbnail + expected (5th image) for visual audit
 *  - mangaId=xxx → filter by manga
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get('detailed') === '1';
  const mangaId = searchParams.get('mangaId');

  // Count total chapters
  let totalQ = adminSupabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);
  if (mangaId) totalQ = totalQ.eq('manga_id', mangaId);
  const { count: totalChapters } = await totalQ;

  // Count chapters with null thumbnail
  let nullQ = adminSupabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .is('thumbnail_url', null);
  if (mangaId) nullQ = nullQ.eq('manga_id', mangaId);
  const { count: nullThumbnails } = await nullQ;

  // Count "wrong" thumbnails: thumbnail_url != 5th image's URL
  // We need to sample chapters and check their images
  let wrongCount = 0;
  const auditedSample: Array<{
    chapter_id: string;
    chapter_number: number;
    manga_id: string;
    current_thumbnail: string | null;
    expected_thumbnail: string | null;
    image_count: number;
    is_wrong: boolean;
    is_null: boolean;
  }> = [];

  if (detailed || totalChapters) {
    // Fetch chapters (sample of 200 for stats accuracy, or all if detailed)
    let chapterQ = adminSupabase
      .from('chapters')
      .select('id, number, manga_id, thumbnail_url')
      .is('deleted_at', null)
      .order('number');
    if (mangaId) chapterQ = chapterQ.eq('manga_id', mangaId);
    if (detailed) {
      chapterQ = chapterQ.limit(100);
    } else {
      chapterQ = chapterQ.limit(200);
    }
    const { data: chaptersSample } = await chapterQ;

    if (chaptersSample && chaptersSample.length > 0) {
      // Batch fetch images for these chapters
      const chapterIds = chaptersSample.map(c => c.id);
      const { data: images } = await adminSupabase
        .from('chapter_images')
        .select('chapter_id, image_url, number')
        .in('chapter_id', chapterIds)
        .order('number', { ascending: true });

      // Group images by chapter_id
      const imagesByChapter = new Map<string, Array<{ image_url: string; number: number }>>();
      for (const img of images ?? []) {
        const arr = imagesByChapter.get(img.chapter_id as string) ?? [];
        arr.push({ image_url: img.image_url, number: img.number as number });
        imagesByChapter.set(img.chapter_id as string, arr);
      }

      for (const ch of chaptersSample) {
        const imgs = imagesByChapter.get(ch.id) ?? [];
        const expected = imgs.length >= 5 ? imgs[4].image_url : imgs[imgs.length - 1]?.image_url ?? null;
        const current = ch.thumbnail_url;
        const isNull = !current;
        // "Wrong" = has a thumbnail but it doesn't match the expected 5th (or 1st if <5 imgs)
        const isWrong = !isNull && expected !== null && current !== expected;

        if (isWrong) wrongCount++;
        if (detailed) {
          auditedSample.push({
            chapter_id: ch.id,
            chapter_number: ch.number as number,
            manga_id: ch.manga_id as string,
            current_thumbnail: current,
            expected_thumbnail: expected,
            image_count: imgs.length,
            is_wrong: isWrong,
            is_null: isNull,
          });
        }
      }
    }
  }

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
      wrong_thumbnails_sampled: wrongCount,
      audited: auditedSample.length,
      sample: detailed ? auditedSample : undefined,
      running_job: runningJob ?? null,
    },
  });
}
