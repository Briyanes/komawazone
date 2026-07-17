import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseChapterListFromHtml, scrapeChapterImages } from '@/lib/scrapers/manga-scraper';
import { buildScraperHeaders, validateScraperUrl } from '@/lib/scrapers/scraper-utils';
import { batchDownloadAndUploadToR2 } from '@/lib/storage/r2';

import { createServiceClient } from '@/lib/supabase/service';
export const maxDuration = 300;

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await serviceClient
    .from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

/**
 * POST /api/v1/admin/scrape/manga-chapters
 * Import ALL chapters (+ images) for a single manga from its source URL.
 *
 * Processes synchronously (no after()) with a time budget.
 * If time runs out, job stays "running" and cron import-advance will resume it.
 *
 * Body: { manga_id: string, metadata_only?: boolean }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { manga_id?: string; metadata_only?: boolean };
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

  const metadataOnly = body.metadata_only ?? false;

  // Create import job for tracking
  const adminSupabase = createAdminClient();
  const { data: job } = await adminSupabase
    .from('import_jobs')
    .insert({
      job_type: 'scrape_manga_chapters',
      status: 'running',
      total_items: 0,
      processed_items: 0,
      new_manga: 0,
      updated_manga: 0,
      skipped_items: 0,
      created_by: user.id,
      config: {
        manga_id: manga.id,
        slug: manga.slug,
        source_url: sourceUrl,
        metadata_only: metadataOnly,
      },
    })
    .select('id')
    .single();

  const jobId = job?.id ?? null;

  // Process synchronously with a time budget (40s from the 60s Vercel Hobby limit)
  const result = await importAllChapters(manga.id, manga.slug, sourceUrl, metadataOnly, jobId, 40_000);

  return NextResponse.json({
    status: 'success',
    message: result.done
      ? `Import chapter selesai untuk "${manga.title}". ${result.imported} chapter baru, ${result.backfilled} di-backfill.`
      : `Import chapter sedang berjalan untuk "${manga.title}". ${result.imported}/${result.total} diproses. Cron akan melanjutkan otomatis.`,
    data: {
      manga_id: manga.id,
      source_url: sourceUrl,
      ...result,
    },
    jobId,
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

export interface ChapterImportResult {
  done: boolean;
  imported: number;
  backfilled: number;
  failed: number;
  total: number;
}

/**
 * Import chapters for a manga. Can be called from POST handler or cron import-advance.
 * Resumable: checks existing chapters in DB and skips them.
 *
 * @param timeBudgetMs  Max processing time before returning (partial). Default 40s.
 */
export async function importAllChapters(
  mangaId: string,
  slug: string,
  sourceUrl: string,
  metadataOnly = false,
  jobId: string | null = null,
  timeBudgetMs = 40_000,
): Promise<ChapterImportResult> {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const startTime = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateJob = async (updates: any) => {
    if (!jobId) return;
    try {
      await adminSupabase.from('import_jobs').update(updates).eq('id', jobId);
    } catch {
      // non-critical
    }
  };

  const result: ChapterImportResult = {
    done: false,
    imported: 0,
    backfilled: 0,
    failed: 0,
    total: 0,
  };

  try {
    // 1. Fetch manga page to get chapter list
    const pageRes = await fetch(sourceUrl, {
      headers: buildScraperHeaders(sourceUrl),
      signal: AbortSignal.timeout(20_000),
    });

    if (!pageRes.ok) {
      console.error(`[ChapterImport] Failed to fetch manga page: HTTP ${pageRes.status}`);
      await updateJob({ status: 'failed', completed_at: new Date().toISOString(), error_message: `HTTP ${pageRes.status}` });
      return { ...result, done: true };
    }

    const html = await pageRes.text();
    const chapters = parseChapterListFromHtml(html);

    if (chapters.length === 0) {
      console.warn(`[ChapterImport] No chapters found for ${slug}`);
      await updateJob({ status: 'completed', completed_at: new Date().toISOString(), total_items: 0 });
      return { ...result, done: true };
    }

    console.log(`[ChapterImport] Found ${chapters.length} chapters for ${slug}`);

    // 2. Get existing chapters to skip
    const { data: existing } = await supabase
      .from('chapters')
      .select('id, number')
      .eq('manga_id', mangaId)
      .is('deleted_at', null);

    const existingMap = new Map((existing ?? []).map(c => [c.number as number, c.id as string]));
    const existingNums = new Set(existingMap.keys());

    // Deduplicate by chapter number
    const seen = new Set<number>();
    const toImport = chapters.filter(c => {
      if (existingNums.has(c.number) || seen.has(c.number)) return false;
      seen.add(c.number);
      return true;
    });

    console.log(`[ChapterImport] ${toImport.length} new chapters to import (${existingNums.size} already exist)`);

    // 3a. Metadata-only mode (fast — just insert chapter records)
    if (metadataOnly) {
      if (toImport.length === 0) {
        await updateJob({ status: 'completed', completed_at: new Date().toISOString(), total_items: 0, processed_items: 0 });
        return { ...result, done: true, total: 0 };
      }

      const rows = toImport.map(chapter => ({
        manga_id: mangaId,
        number: chapter.number,
        title: chapter.title || `Chapter ${chapter.number}`,
        ...(chapter.releasedAt ? { release_date: chapter.releasedAt } : {}),
      }));

      let insertedCount = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const { error: insertErr, data: insertData } = await supabase
          .from('chapters')
          .upsert(rows.slice(i, i + 50), { onConflict: 'manga_id,number', ignoreDuplicates: true })
          .select('id');
        if (insertErr) {
          console.error(`[ChapterImport] Insert error batch ${i}:`, insertErr.message);
        } else {
          insertedCount += (insertData?.length ?? 0);
        }
      }

      result.imported = insertedCount;
      result.total = toImport.length;
      result.done = true;

      await updateJob({
        status: 'completed',
        total_items: toImport.length,
        processed_items: insertedCount,
        new_manga: insertedCount,
        skipped_items: toImport.length - insertedCount,
        completed_at: new Date().toISOString(),
      });

      // Notify readers
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
        }
      }

      return result;
    }

    // 3b. Full mode: scrape images for new chapters + backfill existing without images
    const existingIds = [...existingMap.values()];
    const chaptersWithImagesSet = new Set<string>();
    if (existingIds.length > 0) {
      const { data: withImgs } = await supabase
        .from('chapter_images')
        .select('chapter_id')
        .in('chapter_id', existingIds);
      for (const row of withImgs ?? []) chaptersWithImagesSet.add(row.chapter_id as string);
    }

    const sourceUrlMap = new Map(chapters.map(c => [c.number, c.url]));

    const toBackfill: Array<{ id: string; number: number; url: string }> = [];
    for (const [num, id] of existingMap.entries()) {
      if (!chaptersWithImagesSet.has(id)) {
        const url = sourceUrlMap.get(num);
        if (url) toBackfill.push({ id, number: num, url });
      }
    }
    const backfillBatch = toBackfill.sort((a, b) => b.number - a.number).slice(0, 100);

    const totalWork = toImport.length + backfillBatch.length;
    result.total = totalWork;
    console.log(`[ChapterImport] Full mode: ${toImport.length} new + ${backfillBatch.length} backfill (budget: ${timeBudgetMs}ms)`);

    await updateJob({ total_items: totalWork });

    if (totalWork === 0) {
      await updateJob({ status: 'completed', completed_at: new Date().toISOString() });
      return { ...result, done: true };
    }

    let processedTotal = 0;
    let imported = 0;
    let backfilled = 0;
    let failed = 0;

    // Process new chapters
    for (const chapter of toImport) {
      // Check time budget
      if (Date.now() - startTime > timeBudgetMs) {
        console.log(`[ChapterImport] Time budget exceeded after ${processedTotal}/${totalWork}. Job will resume via cron.`);
        await updateJob({
          processed_items: processedTotal,
          new_manga: imported,
          updated_manga: backfilled,
          skipped_items: failed,
        });
        result.imported = imported;
        result.backfilled = backfilled;
        result.failed = failed;
        return result; // NOT done — cron will resume
      }

      try {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        const sourceImages = await scrapeChapterImages(chapter.url);

        if (sourceImages.length === 0) {
          console.warn(`[ChapterImport] No images for new chapter ${chapter.number}`);
          await supabase.from('chapters').insert({
            manga_id: mangaId,
            number: chapter.number,
            title: chapter.title || `Chapter ${chapter.number}`,
            ...(chapter.releasedAt ? { release_date: chapter.releasedAt } : {}),
          });
          failed++;
          processedTotal++;
          continue;
        }

        console.log(`[ChapterImport] Downloading ${sourceImages.length} images for ch.${chapter.number} to R2...`);
        const r2Results = await batchDownloadAndUploadToR2(sourceImages, 'pages', `${slug}-ch${chapter.number}`);
        const finalImages = r2Results.map(r => r.url);

        const thumbnailUrl = r2Results.length >= 5
          ? r2Results[r2Results.length - 5].url
          : r2Results[0]?.url;

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
          processedTotal++;
          continue;
        }

        await supabase.from('chapter_images').insert(
          finalImages.map((url, i) => ({ chapter_id: chapterRecord.id, image_url: url, number: i + 1 }))
        );

        imported++;
        processedTotal++;
        console.log(`[ChapterImport] ✓ New ch.${chapter.number} (${finalImages.length} pages)`);

        // Update job progress every 3 chapters
        if (processedTotal % 3 === 0) {
          await updateJob({
            processed_items: processedTotal,
            new_manga: imported,
            updated_manga: backfilled,
            skipped_items: failed,
          });
        }

        // Notify readers
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
        }

      } catch (err) {
        console.error(`[ChapterImport] ✗ Chapter ${chapter.number}:`, err);
        failed++;
        processedTotal++;
      }
    }

    // Process backfill
    for (const ch of backfillBatch) {
      if (Date.now() - startTime > timeBudgetMs) {
        console.log(`[ChapterImport] Time budget exceeded during backfill. Job will resume via cron.`);
        await updateJob({
          processed_items: processedTotal,
          new_manga: imported,
          updated_manga: backfilled,
          skipped_items: failed,
        });
        result.imported = imported;
        result.backfilled = backfilled;
        result.failed = failed;
        return result;
      }

      try {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        const sourceImages = await scrapeChapterImages(ch.url);

        if (sourceImages.length === 0) {
          failed++;
          processedTotal++;
          continue;
        }

        const r2Results = await batchDownloadAndUploadToR2(sourceImages, 'pages', `${slug}-ch${ch.number}`);
        const finalImages = r2Results.map(r => r.url);

        await supabase.from('chapter_images').insert(
          finalImages.map((url, i) => ({ chapter_id: ch.id, image_url: url, number: i + 1 }))
        );

        const backfillThumb = r2Results.length >= 5
          ? r2Results[r2Results.length - 5].url
          : r2Results[0]?.url;
        await supabase.from('chapters').update({ thumbnail_url: backfillThumb }).eq('id', ch.id);

        backfilled++;
        processedTotal++;
        console.log(`[ChapterImport] ✓ Backfill ch.${ch.number} (${finalImages.length} pages)`);

        if (processedTotal % 3 === 0) {
          await updateJob({
            processed_items: processedTotal,
            new_manga: imported,
            updated_manga: backfilled,
            skipped_items: failed,
          });
        }

      } catch (err) {
        console.error(`[ChapterImport] ✗ Backfill ch.${ch.number}:`, err);
        failed++;
        processedTotal++;
      }
    }

    console.log(`[ChapterImport] Done for ${slug}: ${imported} new, ${backfilled} backfilled, ${failed} failed`);

    result.imported = imported;
    result.backfilled = backfilled;
    result.failed = failed;
    result.done = true;

    await updateJob({
      status: 'completed',
      processed_items: processedTotal,
      new_manga: imported,
      updated_manga: backfilled,
      skipped_items: failed,
      completed_at: new Date().toISOString(),
    });

  } catch (err) {
    console.error(`[ChapterImport] Fatal error for ${slug}:`, err);
    await updateJob({
      status: 'failed',
      completed_at: new Date().toISOString(),
    });
    result.done = true;
  }

  return result;
}