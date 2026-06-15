import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseChapterListFromHtml, scrapeChapterImages } from '@/lib/scrapers/manga-scraper';
import { buildScraperHeaders, validateScraperUrl } from '@/lib/scrapers/scraper-utils';
import { batchDownloadAndUploadToR2 } from '@/lib/storage/r2';

export const maxDuration = 300;

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

/**
 * POST /api/v1/admin/scrape/manga-chapters
 * Import ALL chapters (+ images) for a single manga from its source URL.
 * Uses after() so the HTTP response returns immediately while processing continues.
 *
 * Body: { manga_id: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { manga_id?: string };
  if (!body.manga_id) {
    return NextResponse.json({ error: 'manga_id diperlukan' }, { status: 400 });
  }

  // Fetch manga record — need source_url and id
  const { data: manga, error: mangaErr } = await supabase
    .from('manga')
    .select('id, slug, title, source_url')
    .eq('id', body.manga_id)
    .single() as unknown as { data: { id: string; slug: string; title: string; source_url: string | null } | null; error: unknown };

  if (mangaErr || !manga) {
    return NextResponse.json({ error: 'Manga tidak ditemukan' }, { status: 404 });
  }

  // Build source URL — use stored value or look up from active sources
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

  // SSRF check on source URL
  const ssrfError = validateScraperUrl(sourceUrl);
  if (ssrfError) {
    return NextResponse.json({ error: `source_url tidak valid: ${ssrfError}` }, { status: 400 });
  }
  // Return immediately, process in background
  after(() => importAllChapters(manga.id, manga.slug, sourceUrl));

  return NextResponse.json({
    status: 'success',
    message: `Import chapter dimulai untuk "${manga.title}". Proses berjalan di background.`,
    data: { manga_id: manga.id, source_url: sourceUrl },
  });
}

/**
 * GET /api/v1/admin/scrape/manga-chapters?manga_id=xxx
 * Returns progress: how many chapters exist vs how many are in source
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const mangaId = req.nextUrl.searchParams.get('manga_id');
  if (!mangaId) {
    return NextResponse.json({ error: 'manga_id diperlukan' }, { status: 400 });
  }

  const { count } = await supabase
    .from('chapters')
    .select('id', { count: 'exact', head: true })
    .eq('manga_id', mangaId)
    .is('deleted_at', null);

  return NextResponse.json({ status: 'success', data: { chapter_count: count ?? 0 } });
}

/**
 * Background: fetch chapter list from source, then optionally scrape each chapter's images.
 *
 * @param metadataOnly  When true, only insert chapter records (no image scraping).
 *                      Much faster — use for bulk imports. Images are fetched lazily
 *                      the first time a chapter is read.
 */
export async function importAllChapters(mangaId: string, slug: string, sourceUrl: string, metadataOnly = false) {
  const supabase = await createClient();

  console.log(`[ChapterImport] Starting for manga ${slug} from ${sourceUrl} (metadataOnly=${metadataOnly})`);

  try {
    // 1. Fetch manga page to get chapter list
    const pageRes = await fetch(sourceUrl, {
      headers: buildScraperHeaders(sourceUrl),
      signal: AbortSignal.timeout(20_000),
    });

    if (!pageRes.ok) {
      console.error(`[ChapterImport] Failed to fetch manga page: HTTP ${pageRes.status}`);
      return;
    }

    const html = await pageRes.text();
    const chapters = parseChapterListFromHtml(html);

    if (chapters.length === 0) {
      console.warn(`[ChapterImport] No chapters found for ${slug}`);
      return;
    }

    console.log(`[ChapterImport] Found ${chapters.length} chapters for ${slug}`);

    // 2. Get existing chapters (id + number) to check images
    const { data: existing } = await supabase
      .from('chapters')
      .select('id, number')
      .eq('manga_id', mangaId)
      .is('deleted_at', null);

    const existingMap = new Map((existing ?? []).map(c => [c.number as number, c.id as string]));
    const existingNums = new Set(existingMap.keys());

    // Deduplicate by chapter number (source may have duplicate data-num values)
    const seen = new Set<number>();
    const toImport = chapters.filter(c => {
      if (existingNums.has(c.number) || seen.has(c.number)) return false;
      seen.add(c.number);
      return true;
    });

    console.log(`[ChapterImport] ${toImport.length} new chapters to import (${existingNums.size} already exist)`);

    // 3a. Metadata-only mode: insert chapter records without scraping images (fast)
    if (metadataOnly) {
      if (toImport.length === 0) return;

      const rows = toImport.map(chapter => ({
        manga_id: mangaId,
        number: chapter.number,
        title: chapter.title || `Chapter ${chapter.number}`,
        ...(chapter.releasedAt ? { release_date: chapter.releasedAt } : {}),
      }));

      let insertedCount = 0;
      // Batch insert in groups of 50
      for (let i = 0; i < rows.length; i += 50) {
        const { error: insertErr, data: insertData } = await supabase
          .from('chapters')
          .upsert(rows.slice(i, i + 50), { onConflict: 'manga_id,number', ignoreDuplicates: true })
          .select('id');
        if (insertErr) {
          console.error(`[ChapterImport] Insert error batch ${i}-${i + 50} for ${slug}:`, insertErr.message, insertErr.code);
        } else {
          insertedCount += (insertData?.length ?? 0);
        }
      }

      console.log(`[ChapterImport] Metadata-only: inserted ${insertedCount}/${toImport.length} chapters for ${slug}`);

      // Notify readers about new chapters (digest — one notification per user)
      if (insertedCount > 0) {
        const { data: readers } = await supabase
          .from('reading_list')
          .select('user_id')
          .eq('manga_id', mangaId)
          .eq('status', 'reading');

        if (readers && readers.length > 0) {
          const notifs = readers.map((r: { user_id: string }) => ({
            user_id: r.user_id,
            type: 'new_chapter' as const,
            title: `${insertedCount} chapter baru tersedia`,
            body: `${insertedCount} chapter baru sudah bisa dibaca!`,
            manga_id: mangaId,
            read: false,
          }));
          await supabase.from('notifications').insert(notifs);
          console.log(`[ChapterImport] 🔔 Notified ${readers.length} readers about ${insertedCount} new chapters (digest)`);
        }
      }

      return;
    }

    // 3b. Full mode: scrape images for new chapters + backfill existing without images

    // Find existing chapters that have no images yet
    const existingIds = [...existingMap.values()];
    const chaptersWithImagesSet = new Set<string>();
    if (existingIds.length > 0) {
      const { data: withImgs } = await supabase
        .from('chapter_images')
        .select('chapter_id')
        .in('chapter_id', existingIds);
      for (const row of withImgs ?? []) chaptersWithImagesSet.add(row.chapter_id as string);
    }

    // Build source URL map: chapter number → source URL (for backfill)
    const sourceUrlMap = new Map(chapters.map(c => [c.number, c.url]));

    // Chapters that exist in DB but have no images — limit backfill to 100 per run
    const toBackfill: Array<{ id: string; number: number; url: string }> = [];
    for (const [num, id] of existingMap.entries()) {
      if (!chaptersWithImagesSet.has(id)) {
        const url = sourceUrlMap.get(num);
        if (url) toBackfill.push({ id, number: num, url });
      }
    }
    const backfillBatch = toBackfill.sort((a, b) => b.number - a.number).slice(0, 100);

    console.log(`[ChapterImport] Full mode: ${toImport.length} new + ${backfillBatch.length}/${toBackfill.length} existing without images`);

    if (toImport.length === 0 && backfillBatch.length === 0) return;

    let imported = 0;
    let backfilled = 0;
    let failed = 0;

    // Process new chapters: scrape images → download to R2 → insert chapter → insert images
    for (const chapter of toImport) {
      try {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

        const sourceImages = await scrapeChapterImages(chapter.url);

        if (sourceImages.length === 0) {
          console.warn(`[ChapterImport] No images for new chapter ${chapter.number}`);
          // Insert chapter record anyway (images fetched lazily later)
          await supabase.from('chapters').insert({
            manga_id: mangaId,
            number: chapter.number,
            title: chapter.title || `Chapter ${chapter.number}`,
            ...(chapter.releasedAt ? { release_date: chapter.releasedAt } : {}),
          });
          failed++;
          continue;
        }

        // Download and upload images to R2
        console.log(`[ChapterImport] Downloading ${sourceImages.length} images for ch.${chapter.number} to R2...`);
        const r2Results = await batchDownloadAndUploadToR2(sourceImages, 'pages', `${slug}-ch${chapter.number}`);

        // Filter successful uploads
        const successfulUploads = r2Results.filter(r => r.key !== null);
        const failedUploads = r2Results.filter(r => r.key === null);

        if (failedUploads.length > 0) {
          console.warn(`[ChapterImport] ${failedUploads.length}/${sourceImages.length} images failed to upload to R2, using original URLs`);
        }

        const finalImages = successfulUploads.map(r => r.url);
        // Use 5th image (index 4) as thumbnail
        const thumbnailUrl = finalImages.length >= 5
          ? finalImages[4]
          : finalImages[0] ?? r2Results[0]?.url;

        const { data: chapterRecord, error: chapterErr } = await supabase
          .from('chapters')
          .insert({
            manga_id: mangaId,
            number: chapter.number,
            title: chapter.title || `Chapter ${chapter.number}`,
            ...(chapter.releasedAt ? { release_date: chapter.releasedAt } : {}),
            thumbnail_url: thumbnailUrl,
          })
          .select('id')
          .single();

        if (chapterErr || !chapterRecord) {
          console.error(`[ChapterImport] Failed to insert chapter ${chapter.number}:`, chapterErr?.message);
          failed++;
          continue;
        }

        await supabase.from('chapter_images').insert(
          finalImages.map((url, i) => ({ chapter_id: chapterRecord.id, image_url: url, number: i + 1 }))
        );

        imported++;
        console.log(`[ChapterImport] ✓ New ch.${chapter.number} (${finalImages.length} pages, ${successfulUploads.length} to R2)`);

        // Notify users tracking this manga about the new chapter
        const { data: readers } = await supabase
          .from('reading_list')
          .select('user_id')
          .eq('manga_id', mangaId)
          .eq('status', 'reading');

        if (readers && readers.length > 0) {
          const notifs = readers.map((r: { user_id: string }) => ({
            user_id: r.user_id,
            type: 'new_chapter' as const,
            title: `Chapter baru tersedia`,
            body: `Chapter ${chapter.number} sudah bisa dibaca!`,
            manga_id: mangaId,
            chapter_id: chapterRecord.id,
            read: false,
          }));
          for (let n = 0; n < notifs.length; n += 500) {
            await supabase.from('notifications').insert(notifs.slice(n, n + 500));
          }
          console.log(`[ChapterImport] 🔔 Notified ${readers.length} readers about ch.${chapter.number}`);
        }

      } catch (err) {
        console.error(`[ChapterImport] ✗ Chapter ${chapter.number}:`, err);
        failed++;
      }
    }

    // Process backfill: scrape images → download to R2 → insert into existing chapter records
    for (const ch of backfillBatch) {
      try {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

        const sourceImages = await scrapeChapterImages(ch.url);

        if (sourceImages.length === 0) {
          console.warn(`[ChapterImport] No images for backfill ch.${ch.number}`);
          failed++;
          continue;
        }

        // Download and upload images to R2
        console.log(`[ChapterImport] Backfill: downloading ${sourceImages.length} images for ch.${ch.number} to R2...`);
        const r2Results = await batchDownloadAndUploadToR2(sourceImages, 'pages', `${slug}-ch${ch.number}`);

        // Filter successful uploads
        const successfulUploads = r2Results.filter(r => r.key !== null);
        const failedUploads = r2Results.filter(r => r.key === null);

        if (failedUploads.length > 0) {
          console.warn(`[ChapterImport] Backfill: ${failedUploads.length}/${sourceImages.length} images failed to upload to R2, using original URLs`);
        }

        const finalImages = successfulUploads.map(r => r.url);

        await supabase.from('chapter_images').insert(
          finalImages.map((url, i) => ({ chapter_id: ch.id, image_url: url, number: i + 1 }))
        );

        // Update thumbnail_url on chapter record if not set
        // Use 5th image (index 4) as thumbnail
        const backfillThumb = finalImages.length >= 5
          ? finalImages[4]
          : finalImages[0] ?? r2Results[0]?.url;
        await supabase.from('chapters')
          .update({ thumbnail_url: backfillThumb })
          .eq('id', ch.id)
          .is('thumbnail_url', null);

        backfilled++;
        console.log(`[ChapterImport] ✓ Backfill ch.${ch.number} (${finalImages.length} pages, ${successfulUploads.length} to R2)`);

      } catch (err) {
        console.error(`[ChapterImport] ✗ Backfill ch.${ch.number}:`, err);
        failed++;
      }
    }

    console.log(`[ChapterImport] Done for ${slug}: ${imported} new, ${backfilled} backfilled, ${failed} failed`);

  } catch (err) {
    console.error(`[ChapterImport] Fatal error for ${slug}:`, err);
  }
}
