import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadBufferToR2 } from '@/lib/storage/r2';
import { buildScraperHeaders, parseChapterImages } from '@/lib/scrapers/scraper-utils';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

// ── Dead CDN hosts (URLs from these are skipped automatically) ───────────────
const DEAD_CDN_HOSTS = new Set([
  'cdn-go-wd.gmbr.pro', 'cdn-okto.gmbr.pro', 'gmbr.manhwaland.in',
  'gmbr.manhwaland.com', 'gmbr-in.gmbr.pro', 'go.gmbar.xyz', 'go.gmbar.pro',
  'go.uwakjawa.xyz',
]);

function isDeadCdn(url: string): boolean {
  try { return DEAD_CDN_HOSTS.has(new URL(url).hostname); } catch { return false; }
}

function isBlockedPage(html: string): boolean {
  return html.length < 2000 || html.includes('Just a moment') || html.includes('cf_chl_opt')
    || html.includes('Enable JavaScript and cookies to continue');
}

// ── Build candidate chapter URLs from manga source_url ───────────────────────
function buildCandidateUrls(sourceUrl: string, chapterNumber: number): string[] {
  const sourceParsed = new URL(sourceUrl);
  const pathParts = sourceParsed.pathname.replace(/\/$/, '').split('/');
  const slug = pathParts[pathParts.length - 1];
  const intNum = Math.floor(chapterNumber);
  const paddedNum = String(intNum).padStart(2, '0');

  if (intNum !== chapterNumber) {
    return [`${sourceParsed.origin}/${slug}-chapter-${chapterNumber}/`];
  } else if (intNum < 100) {
    return [
      `${sourceParsed.origin}/${slug}-chapter-${intNum}/`,
      `${sourceParsed.origin}/${slug}-chapter-${paddedNum}/`,
    ];
  }
  return [`${sourceParsed.origin}/${slug}-chapter-${intNum}/`];
}

// ── Fetch chapter page HTML ──────────────────────────────────────────────────
async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    const res = await fetch(url, {
      headers: buildScraperHeaders(url),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    if (isBlockedPage(html)) return null;
    return html;
  } catch {
    return null;
  }
}

// ── Download image ───────────────────────────────────────────────────────────
async function downloadImage(url: string, referer: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, {
      headers: {
        ...buildScraperHeaders(referer),
        'Accept': 'image/*,*/*',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!ct.startsWith('image/')) return null;
    return { buffer, contentType: ct };
  } catch {
    return null;
  }
}

function getExtension(url: string, contentType: string): string {
  const fromUrl = url.split('/').pop()?.split('?')[0]?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromUrl && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(fromUrl)) return fromUrl === 'jpeg' ? 'jpg' : fromUrl;
  const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
  return MIME_EXT[contentType] || 'jpg';
}

/**
 * POST /api/v1/admin/storage/retry-failed-images
 *
 * Re-scrape chapter pages to get fresh CDN image URLs, then download & upload to R2.
 * Finds chapters that have 0 images and tries to recover them.
 *
 * Body: { limit?: number }
 * - limit: max chapters to process (default 50, max 200)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json() as { limit?: number } | null;
    const limit = Math.min(body?.limit ?? 50, 200);

    const adminSupabase = createAdminClient();

    // Find chapters with 0 images
    const { data: chapters } = await adminSupabase
      .from('chapters')
      .select('id, number, manga_id')
      .is('deleted_at', null)
      .order('number')
      .limit(limit * 2); // Over-fetch since we filter in app

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ status: 'success', message: 'No chapters found' });
    }

    // Filter to chapters with 0 images
    const chaptersNeedingImages: typeof chapters = [];
    for (const ch of chapters) {
      if (chaptersNeedingImages.length >= limit) break;
      const { count } = await adminSupabase
        .from('chapter_images')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', ch.id);
      if (count === 0) chaptersNeedingImages.push(ch);
    }

    if (chaptersNeedingImages.length === 0) {
      return NextResponse.json({
        status: 'success',
        message: 'All chapters already have images',
        processed: 0,
      });
    }

    // Create import job for tracking
    const { data: job } = await adminSupabase
      .from('import_jobs')
      .insert({
        job_type: 'retry_failed_images',
        status: 'running',
        total_items: chaptersNeedingImages.length,
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
    after(() => runRetry(jobId, chaptersNeedingImages));

    return NextResponse.json({
      status: 'success',
      message: `Retry job started for ${chaptersNeedingImages.length} chapters`,
      jobId,
      total: chaptersNeedingImages.length,
    });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Retry failed' },
      { status: 500 }
    );
  }
}

// ── Background worker ────────────────────────────────────────────────────────
async function runRetry(jobId: string | null, chapters: Array<{ id: string; number: number; manga_id: string }>) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  let repaired = 0;
  let totalImages = 0;
  let failed = 0;

  try {
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      // Get manga source_url
      const { data: manga } = await adminSupabase
        .from('manga')
        .select('id, title, source_url')
        .eq('id', chapter.manga_id)
        .single();

      if (!manga?.source_url) {
        failed++;
        continue;
      }

      try {
        const candidateUrls = buildCandidateUrls(manga.source_url, chapter.number);

        // Scrape chapter page
        let chapterHtml: string | null = null;
        let workingUrl: string | null = null;
        for (const tryUrl of candidateUrls) {
          chapterHtml = await fetchPageHtml(tryUrl);
          if (chapterHtml && parseChapterImages(chapterHtml).length > 0) {
            workingUrl = tryUrl;
            break;
          }
        }

        if (!chapterHtml || !workingUrl) {
          failed++;
          console.log(`[Retry Images] (${i + 1}/${chapters.length}) Ch.${chapter.number} — page fetch failed`);
          continue;
        }

        const imageUrls = parseChapterImages(chapterHtml);
        if (imageUrls.length === 0) {
          failed++;
          continue;
        }

        // Download & upload each image
        const imageRecords: Array<{ chapter_id: string; number: number; image_url: string; width: number; height: number }> = [];
        let chapterFailed = 0;

        for (let j = 0; j < imageUrls.length; j++) {
          const imgUrl = imageUrls[j];
          const pageIdx = j + 1;

          if (isDeadCdn(imgUrl)) { chapterFailed++; continue; }

          const imageData = await downloadImage(imgUrl, workingUrl);
          if (!imageData) { chapterFailed++; continue; }

          try {
            const ext = getExtension(imgUrl, imageData.contentType);
            const { url } = await uploadBufferToR2({
              buffer: imageData.buffer,
              contentType: imageData.contentType,
              fileName: `${pageIdx}.${ext}`,
              folder: 'chapters',
            });
            // uploadBufferToR2 generates its own key, but we want a specific path
            // We need to use the returned URL directly
            imageRecords.push({ chapter_id: chapter.id, number: pageIdx, image_url: url, width: 0, height: 0 });
          } catch {
            chapterFailed++;
          }

          // Small delay between images
          if (j < imageUrls.length - 1) await new Promise(r => setTimeout(r, 300));
        }

        // Upsert images to DB
        if (imageRecords.length > 0) {
          await adminSupabase
            .from('chapter_images')
            .upsert(imageRecords, { onConflict: 'chapter_id,number' });

          // Update thumbnail (5th image or first)
          const thumb = imageRecords.length >= 5 ? imageRecords[4] : imageRecords[0];
          await adminSupabase
            .from('chapters')
            .update({ thumbnail_url: thumb.image_url })
            .eq('id', chapter.id);

          repaired++;
          totalImages += imageRecords.length;
          console.log(`[Retry Images] (${i + 1}/${chapters.length}) Ch.${chapter.number} — ${imageRecords.length} images (${chapterFailed} failed)`);
        } else {
          failed++;
          console.log(`[Retry Images] (${i + 1}/${chapters.length}) Ch.${chapter.number} — all ${imageUrls.length} downloads failed`);
        }

        // Update job progress
        if (jobId) {
          await supabase
            .from('import_jobs')
            .update({ processed_items: i + 1, new_manga: repaired, updated_manga: totalImages, skipped_items: failed })
            .eq('id', jobId);
        }

        // Delay between chapters
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        failed++;
        console.error(`[Retry Images] Error Ch.${chapter.number}:`, err);
      }
    }

    // Complete job
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({
          status: 'completed',
          processed_items: chapters.length,
          new_manga: repaired,
          updated_manga: totalImages,
          skipped_items: failed,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    console.log(`[Retry Images] Done: ${repaired} chapters repaired, ${totalImages} images uploaded, ${failed} failed`);

  } catch (error) {
    console.error('[Retry Images] Fatal error:', error);
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', jobId);
    }
  }
}

/**
 * GET /api/v1/admin/storage/retry-failed-images
 *
 * Get count of chapters with 0 images
 */
export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();

  // Count chapters with 0 images using a left join approach
  await adminSupabase.rpc('get_chapter_image_stats' as never);

  // Fallback: just count total chapters
  const { count: totalChapters } = await adminSupabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  const { count: totalImages } = await adminSupabase
    .from('chapter_images')
    .select('*', { count: 'exact', head: true });

  // Check for running job
  const { data: runningJob } = await adminSupabase
    .from('import_jobs')
    .select('id, processed_items, total_items, status, created_at')
    .eq('job_type', 'retry_failed_images')
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    status: 'success',
    data: {
      total_chapters: totalChapters ?? 0,
      total_images: totalImages ?? 0,
      running_job: runningJob ?? null,
    },
  });
}