import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadAndUploadToR2, batchDownloadAndUploadToR2, isR2Url } from '@/lib/storage/r2';

export const maxDuration = 300;

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

/**
 * POST /api/v1/admin/storage/backfill
 *
 * Backfill existing manga/chapters images to R2 storage
 *
 * Body: { type: 'manga' | 'chapters' | 'all', limit?: number, mangaId?: string }
 *
 * - type: 'manga' = backfill manga covers only
 * - type: 'chapters' = backfill chapter images only
 * - type: 'all' = backfill both (default)
 * - limit: max number of items to process (default 50, max 200)
 * - mangaId: if provided, only backfill this specific manga
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      type?: 'manga' | 'chapters' | 'all';
      limit?: number;
      mangaId?: string;
    };

    const type = body.type ?? 'all';
    const limit = Math.min(body.limit ?? 50, 200);
    const mangaId = body.mangaId;

    // Create import job for tracking
    const { data: job } = await supabase
      .from('import_jobs')
      .insert({
        job_type: 'r2_backfill',
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
    after(() => runBackfill(jobId ?? null, type, limit, mangaId));

    return NextResponse.json({
      status: 'success',
      message: `Backfill job started for type: ${type}${mangaId ? ` (manga: ${mangaId})` : ''}`,
      jobId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/admin/storage/backfill?mangaId=xxx
 *
 * Check backfill status for a specific manga
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const mangaId = request.nextUrl.searchParams.get('mangaId');
  if (!mangaId) {
    return NextResponse.json({ error: 'mangaId required' }, { status: 400 });
  }

  // Check backfill status
  const adminSupabase = createAdminClient();

  const [{ data: manga }, { data: chapters }, { data: chapterImages }] = await Promise.all([
    adminSupabase
      .from('manga')
      .select('id, title, cover_url, banner_url')
      .eq('id', mangaId)
      .single(),
    adminSupabase
      .from('chapters')
      .select('id, number, thumbnail_url')
      .eq('manga_id', mangaId)
      .is('deleted_at', null),
    adminSupabase
      .from('chapter_images')
      .select('chapter_id, image_url')
      .in('chapter_id',
        (await adminSupabase
          .from('chapters')
          .select('id')
          .eq('manga_id', mangaId)
          .is('deleted_at', null)
        ).data?.map(c => c.id) ?? []
      ),
  ]);

  // Calculate R2 usage
  const coverInR2 = manga?.cover_url && isR2Url(manga.cover_url);
  const bannerInR2 = manga?.banner_url && isR2Url(manga.banner_url);
  const thumbnailsInR2 = chapters?.filter(c => c.thumbnail_url && isR2Url(c.thumbnail_url)).length ?? 0;
  const imagesInR2 = chapterImages?.filter(img => isR2Url(img.image_url)).length ?? 0;

  return NextResponse.json({
    status: 'success',
    data: {
      manga: {
        id: manga?.id,
        title: manga?.title,
        cover_url: manga?.cover_url,
        cover_in_r2: coverInR2 ?? false,
        banner_url: manga?.banner_url,
        banner_in_r2: bannerInR2 ?? false,
      },
      chapters: {
        total: chapters?.length ?? 0,
        thumbnails_in_r2: thumbnailsInR2,
      },
      images: {
        total: chapterImages?.length ?? 0,
        in_r2: imagesInR2,
      },
    },
  });
}

async function runBackfill(
  jobId: string | null,
  type: 'manga' | 'chapters' | 'all',
  limit: number,
  mangaId?: string
) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  let processed = 0;
  let success = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Backfill manga covers
    if (type === 'manga' || type === 'all') {
      const { data: mangaList } = await adminSupabase
        .from('manga')
        .select('id, slug, title, cover_url, banner_url')
        .is('deleted_at', null)
        .not('cover_url', 'is', null)
        .limit(mangaId ? 1 : limit);

      const toProcess = mangaId
        ? (mangaList ?? []).filter(m => m.id === mangaId)
        : (mangaList ?? []);

      for (const manga of toProcess) {
        try {
          // Process cover
          if (manga.cover_url && !isR2Url(manga.cover_url)) {
            console.log(`[Backfill] Downloading cover for ${manga.title}...`);
            const r2Result = await downloadAndUploadToR2(manga.cover_url, 'covers', manga.slug);

            if (r2Result.key) {
              await adminSupabase
                .from('manga')
                .update({ cover_url: r2Result.url })
                .eq('id', manga.id);
              console.log(`[Backfill] ✓ Cover uploaded for ${manga.title}`);
              success++;
            } else {
              console.log(`[Backfill] ✗ Cover failed for ${manga.title}`);
              failed++;
            }
          } else {
            skipped++;
          }

          // Process banner if exists
          if (manga.banner_url && !isR2Url(manga.banner_url)) {
            console.log(`[Backfill] Downloading banner for ${manga.title}...`);
            const r2Result = await downloadAndUploadToR2(manga.banner_url, 'banners', `${manga.slug}-banner`);

            if (r2Result.key) {
              await adminSupabase
                .from('manga')
                .update({ banner_url: r2Result.url })
                .eq('id', manga.id);
              console.log(`[Backfill] ✓ Banner uploaded for ${manga.title}`);
            }
          }

          processed++;
          if (jobId) {
            await supabase
              .from('import_jobs')
              .update({ processed_items: processed, updated_manga: success })
              .eq('id', jobId);
          }

          // Delay between requests
          await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        } catch (err) {
          console.error(`[Backfill] Error for ${manga.title}:`, err);
          failed++;
          processed++;
        }
      }
    }

    // Backfill chapter images
    if (type === 'chapters' || type === 'all') {
      const baseQuery = adminSupabase
        .from('chapter_images')
        .select('chapter_id, image_url, number, chapters!inner(manga_id, manga!inner(slug, title))')
        .is('deleted_at', null);

      const { data: images } = mangaId
        ? await baseQuery.eq('chapters.manga_id', mangaId)
        : await baseQuery.limit(limit);

      // Group by chapter
      type ChapterImage = { chapter_id: string; image_url: string; number: number; manga: { title: string; slug: string } | null };
      type ImageWithRelations = { chapter_id: string; image_url: string; number: number; chapters?: { manga: { title: string; slug: string } | null } | null };
      const byChapter = new Map<string, Array<ChapterImage>>();
      for (const img of ((images as ImageWithRelations[] | null) ?? [])) {
        const chapterId = img.chapter_id;
        if (!byChapter.has(chapterId)) {
          byChapter.set(chapterId, []);
        }
        byChapter.get(chapterId)!.push({
          chapter_id: chapterId,
          image_url: img.image_url,
          number: img.number,
          manga: img.chapters?.manga ?? null,
        });
      }

      for (const [chapterId, imgs] of byChapter) {
        try {
          // Filter non-R2 images
          const toDownload = imgs.filter(img => !isR2Url(img.image_url));
          if (toDownload.length === 0) {
            skipped++;
            continue;
          }

          console.log(`[Backfill] Downloading ${toDownload.length} images for chapter ${chapterId}...`);

          const r2Results = await batchDownloadAndUploadToR2(
            toDownload.map(img => img.image_url),
            'pages',
            `${toDownload[0].manga?.slug || 'manga'}-ch${chapterId}`
          );

          // Update successful uploads
          for (const result of r2Results) {
            if (result.key) {
              await adminSupabase
                .from('chapter_images')
                .update({ image_url: result.url })
                .eq('image_url', result.originalUrl);
              success++;
            } else {
              failed++;
            }
          }

          // Update thumbnail: use 5th image (index 4) if available, fallback to first
          const successfulResults = r2Results.filter(r => r.key);
          const thumbResult = successfulResults.length >= 5
            ? successfulResults[4]
            : successfulResults[0];
          if (thumbResult?.key) {
            await adminSupabase
              .from('chapters')
              .update({ thumbnail_url: thumbResult.url })
              .eq('id', chapterId);
          }

          processed++;
          if (jobId) {
            await supabase
              .from('import_jobs')
              .update({ processed_items: processed, updated_manga: success })
              .eq('id', jobId);
          }

          // Delay between requests
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        } catch (err) {
          console.error(`[Backfill] Error for chapter ${chapterId}:`, err);
          failed++;
          processed++;
        }
      }
    }

    // Complete job
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({
          status: 'completed',
          processed_items: processed,
          updated_manga: success,
          skipped_items: skipped,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    console.log(`[Backfill] Done: ${success} succeeded, ${skipped} skipped, ${failed} failed`);
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', jobId);
    }
  }
}