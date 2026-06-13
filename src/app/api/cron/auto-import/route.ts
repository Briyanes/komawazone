import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseAllSitemaps } from '@/lib/scrapers/sitemap-parser';
import { scrapeMangaFromUrl } from '@/lib/scrapers/manga-scraper';
import { buildScraperHeaders } from '@/lib/scrapers/scraper-utils';
import { downloadAndUploadToR2, isR2Url } from '@/lib/storage/r2';

export const maxDuration = 300;

/**
 * GET /api/cron/auto-import
 *
 * Scheduled cron (every 6 hours) that:
 *  1. Fetches all active manga sources from DB
 *  2. Parses each source's sitemap
 *  3. For NEW manga: scrape metadata → upload cover to R2 → insert to DB with correct content_rating
 *  4. For EXISTING manga: check if source has more chapters → trigger chapter import
 *
 * Content rating logic:
 *   - Source with content_rating='general' → manga is general (all users)
 *   - Source with content_rating='mature'  → manga is mature (VIP only)
 *
 * Security: CRON_SECRET must match.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  // Fetch all active sources
  const { data: sources, error: srcError } = await supabase
    .from('manga_sources')
    .select('id, name, base_url, sitemap_urls, sitemap_content_ratings, content_rating, type')
    .eq('is_active', true);

  if (srcError || !sources || sources.length === 0) {
    return NextResponse.json({
      status: 'success',
      message: 'No active sources configured',
    });
  }

  // Run in background
  after(() => runAutoImport(sources as ActiveSource[]));

  return NextResponse.json({
    status: 'success',
    message: `Auto-import scheduled for ${sources.length} sources`,
    sources: sources.map(s => s.name),
  });
}

interface ActiveSource {
  id: string;
  name: string;
  base_url: string;
  sitemap_urls: string[];
  sitemap_content_ratings: Record<string, 'general' | 'mature'> | null;
  content_rating: 'general' | 'mature';
  type: string;
}

async function runAutoImport(sources: ActiveSource[]) {
  const supabase = await createClient();

  let totalNew = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // Get admin user ID for uploaded_by field
  const { data: adminUser } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'ADMIN')
    .limit(1)
    .single();
  const adminId = adminUser?.id;

  if (!adminId) {
    console.error('[AutoImport] No admin user found — cannot import');
    return;
  }

  for (const source of sources) {
    console.log(`\n[AutoImport] ─── Processing source: ${source.name} ───`);

    const sitemapUrls: string[] = source.sitemap_urls ?? [];
    if (sitemapUrls.length === 0) {
      console.log(`[AutoImport] ${source.name}: no sitemap_urls, skipping`);
      continue;
    }

    // Parse sitemap
    let parsed;
    try {
      parsed = await parseAllSitemaps(sitemapUrls, {
        timeout: 15_000,
        includeLastmod: true,
      });
    } catch (err) {
      console.error(`[AutoImport] ${source.name}: sitemap parse failed:`, err);
      totalFailed += 10; // estimate
      continue;
    }

    console.log(`[AutoImport] ${source.name}: found ${parsed.total} manga in sitemap`);

    // Limit per source per run (avoid timeout)
    const MAX_NEW_PER_SOURCE = 30;
    const MAX_CHECK_PER_SOURCE = 50;
    let newThisSource = 0;
    let checkedThisSource = 0;

    for (const item of parsed.mangas) {
      if (newThisSource >= MAX_NEW_PER_SOURCE && checkedThisSource >= MAX_CHECK_PER_SOURCE) {
        console.log(`[AutoImport] ${source.name}: reached limits (new=${newThisSource}, checked=${checkedThisSource})`);
        break;
      }

      try {
        // Determine content rating from sitemap_content_ratings or source default
        const sitemapRatings = source.sitemap_content_ratings ?? {};
        // Match the manga URL to its originating sitemap to get the correct rating
        let contentRating: 'general' | 'mature' = source.content_rating;
        const matchedSitemap = Object.keys(sitemapRatings).find(
          (sitemapUrl) => item.url.startsWith(sitemapUrl) || item.originSitemap?.startsWith(sitemapUrl),
        );
        if (matchedSitemap) {
          contentRating = sitemapRatings[matchedSitemap];
        }

        // Check if manga already exists
        const { data: existing } = await supabase
          .from('manga')
          .select('id, slug, updated_at, source_url')
          .or(`slug.eq.${item.slug},source_url.eq.${item.url}`)
          .is('deleted_at', null)
          .maybeSingle();

        if (!existing) {
          // NEW manga — check limit
          if (newThisSource >= MAX_NEW_PER_SOURCE) {
            totalSkipped++;
            continue;
          }

          const result = await importNewManga(item.url, item.slug, source.id, adminId, contentRating, source.type);
          if (result === 'new') { totalNew++; newThisSource++; }
          else if (result === 'failed') totalFailed++;
          else totalSkipped++;

          // Delay between new manga imports
          await sleep(2000 + Math.random() * 2000);
        } else {
          // EXISTING manga — check for chapter updates
          if (checkedThisSource >= MAX_CHECK_PER_SOURCE) {
            totalSkipped++;
            continue;
          }
          checkedThisSource++;

          // Check if source has new chapters
          const { count: dbCount } = await supabase
            .from('chapters')
            .select('id', { count: 'exact', head: true })
            .eq('manga_id', existing.id)
            .is('deleted_at', null);

          // Fetch source page to count chapters
          const chapterRes = await fetch(item.url, {
            headers: buildScraperHeaders(item.url),
            signal: AbortSignal.timeout(15_000),
          });

          if (chapterRes.ok) {
            const html = await chapterRes.text();
            const { parseChapterListFromHtml } = await import('@/lib/scrapers/manga-scraper');
            const sourceChapters = parseChapterListFromHtml(html);

            if (sourceChapters.length > (dbCount ?? 0)) {
              console.log(`[AutoImport] ${item.slug}: source=${sourceChapters.length}, db=${dbCount} → importing new chapters`);
              const { importAllChapters } = await import('@/app/api/v1/admin/scrape/manga-chapters/route');
              await importAllChapters(existing.id, item.slug, item.url, true); // metadata-only for speed
              totalUpdated++;
            } else {
              totalSkipped++;
            }
          } else {
            totalSkipped++;
          }

          // Delay between chapter checks
          await sleep(1500 + Math.random() * 1500);
        }
      } catch (err) {
        console.error(`[AutoImport] Error for ${item.slug}:`, err);
        totalFailed++;
      }
    }

    console.log(`[AutoImport] ${source.name} done: new=${newThisSource}, checked=${checkedThisSource}`);
  }

  console.log(`\n[AutoImport] ═══ COMPLETE ═══`);
  console.log(`  New manga:      ${totalNew}`);
  console.log(`  Updated:        ${totalUpdated}`);
  console.log(`  Skipped:        ${totalSkipped}`);
  console.log(`  Failed:         ${totalFailed}`);
}

async function importNewManga(
  url: string,
  slug: string,
  sourceId: string,
  adminId: string,
  contentRating: 'general' | 'mature',
  sourceType: string,
): Promise<'new' | 'skipped' | 'failed'> {
  const supabase = await createClient();

  try {
    const scraped = await scrapeMangaFromUrl(url);
    if (!scraped?.title) return 'skipped';

    // Upload cover to R2
    let finalCoverUrl = scraped.cover_url;
    if (scraped.cover_url && !isR2Url(scraped.cover_url)) {
      const r2 = await downloadAndUploadToR2(scraped.cover_url, 'covers', scraped.title, {
        maxRetries: 1,
        timeout: 12_000,
      });
      if (r2.key) finalCoverUrl = r2.url;
    }

    const insertData = {
      slug,
      title: scraped.title,
      description: scraped.description,
      cover_url: finalCoverUrl || null,
      type: (scraped.type || sourceType || 'MANHWA') as 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON',
      status: (scraped.status || 'ONGOING') as 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED',
      author: scraped.author || null,
      artist: scraped.artist || null,
      genres: scraped.genres || [],
      source_url: url,
      source_id: sourceId,
      uploaded_by: adminId,
      content_rating: contentRating,
    };

    const { data, error } = await supabase
      .from('manga')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(insertData as any, { onConflict: 'slug', ignoreDuplicates: true })
      .select('id')
      .single();

    if (error) {
      console.warn(`[AutoImport] Upsert error for ${slug}:`, error.message);
      return 'skipped'; // probably duplicate
    }

    if (data) {
      console.log(`[AutoImport] ✓ New manga: ${scraped.title} (${contentRating})`);
      return 'new';
    }

    return 'skipped';
  } catch (err) {
    console.error(`[AutoImport] Failed to import ${slug}:`, err);
    return 'failed';
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}