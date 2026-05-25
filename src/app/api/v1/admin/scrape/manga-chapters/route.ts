import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseChapterListFromHtml, scrapeChapterImages } from '@/lib/scrapers/manga-scraper';
import { SCRAPER_HEADERS, validateScraperUrl } from '@/lib/scrapers/scraper-utils';

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

  // Build source URL if not stored (reconstruct from slug for manhwaland)
  const sourceUrl = manga.source_url ?? `https://04x.manhwaland.land/manga/${manga.slug}/`;

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
      headers: SCRAPER_HEADERS,
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

    // 2. Get existing chapter numbers to skip already-imported ones
    const { data: existing } = await supabase
      .from('chapters')
      .select('number')
      .eq('manga_id', mangaId)
      .is('deleted_at', null);

    const existingNums = new Set((existing ?? []).map(c => c.number));

    // Deduplicate by chapter number (source may have duplicate data-num values)
    const seen = new Set<number>();
    const toImport = chapters.filter(c => {
      if (existingNums.has(c.number) || seen.has(c.number)) return false;
      seen.add(c.number);
      return true;
    });

    console.log(`[ChapterImport] ${toImport.length} new chapters to import (${existingNums.size} already exist)`);

    if (toImport.length === 0) return;

    // 3a. Metadata-only mode: insert chapter records without scraping images (fast)
    if (metadataOnly) {
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
      return;
    }

    // 3b. Full mode: scrape images for each chapter
    let imported = 0;
    let failed = 0;

    for (const chapter of toImport) {
      try {
        // Random delay between requests (1–3s)
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

        const images = await scrapeChapterImages(chapter.url);

        if (images.length === 0) {
          console.warn(`[ChapterImport] No images for chapter ${chapter.number}`);
          failed++;
          continue;
        }

        // Create chapter record
        const { data: chapterRecord, error: chapterErr } = await supabase
          .from('chapters')
          .insert({
            manga_id: mangaId,
            number: chapter.number,
            title: chapter.title || `Chapter ${chapter.number}`,
            ...(chapter.releasedAt ? { release_date: chapter.releasedAt } : {}),
            thumbnail_url: images[0] ?? null,
          })
          .select('id')
          .single();

        if (chapterErr || !chapterRecord) {
          console.error(`[ChapterImport] Failed to insert chapter ${chapter.number}:`, chapterErr?.message);
          failed++;
          continue;
        }

        // Insert chapter images
        const imageRows = images.map((url, i) => ({
          chapter_id: chapterRecord.id,
          image_url: url,
          number: i + 1,
        }));

        await supabase.from('chapter_images').insert(imageRows);

        imported++;
        console.log(`[ChapterImport] ✓ Chapter ${chapter.number} (${images.length} pages)`);

      } catch (err) {
        console.error(`[ChapterImport] ✗ Chapter ${chapter.number}:`, err);
        failed++;
      }
    }

    console.log(`[ChapterImport] Done for ${slug}: ${imported} imported, ${failed} failed`);

  } catch (err) {
    console.error(`[ChapterImport] Fatal error for ${slug}:`, err);
  }
}
