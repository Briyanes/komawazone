import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseAllSitemaps } from '@/lib/scrapers/sitemap-parser';
import { detectMangaSource } from '@/lib/scrapers/detector';

/**
 * POST /api/v1/admin/scrape/sitemap
 * Batch import manga from sitemap URLs
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify admin access
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as {
      sitemapUrls?: string[];
      options?: {
        importNew?: boolean;
        importUpdates?: boolean;
        batchSize?: number;
      };
    };

    const { sitemapUrls, options = {} } = body;

    // Validate input
    if (!sitemapUrls || !Array.isArray(sitemapUrls) || sitemapUrls.length === 0) {
      return NextResponse.json({
        error: 'sitemapUrls is required and must be a non-empty array'
      }, { status: 400 });
    }

    const {
      importNew = true,
      importUpdates = true,
      batchSize = 15, // Default aggressive: 15 concurrent
    } = options;

    // Create import job
    const result = await supabase
      .from('import_jobs' as any)
      .insert({
        job_type: 'sitemap_import',
        status: 'running',
        total_items: 0, // Will update after parsing
        processed_items: 0,
        new_manga: 0,
        updated_manga: 0,
        skipped_items: 0,
        errors: [],
        config: { sitemapUrls, options },
        created_by: user.id,
      })
      .select()
      .single();

    // Handle potential errors
    if (!result) {
      return NextResponse.json({
        error: 'Failed to create import job'
      }, { status: 500 });
    }

    const jobData = result.data as unknown as { id: string };
    if (!jobData.id) {
      return NextResponse.json({
        error: 'Failed to create import job - no ID returned'
      }, { status: 500 });
    }

    // Start background processing (don't await)
    processSitemapImport(jobData.id, sitemapUrls, {
      importNew,
      importUpdates,
      batchSize,
      userId: user.id,
    }).catch(error => {
      console.error('Sitemap import error:', error);
    });

    return NextResponse.json({
      status: 'success',
      data: {
        jobId: jobData.id,
        message: 'Import job started',
        status: 'running',
      },
    });

  } catch (error) {
    console.error('Sitemap import API error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * Background job to process sitemap import
 */
async function processSitemapImport(
  jobId: string,
  sitemapUrls: string[],
  options: {
    importNew: boolean;
    importUpdates: boolean;
    batchSize: number;
    userId: string;
  }
) {
  const supabase = await createClient();
  const errors: Array<{ url: string; error: string }> = [];
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  try {
    // Parse all sitemaps
    console.log(`[Job ${jobId}] Parsing ${sitemapUrls.length} sitemaps...`);
    const parseResult = await parseAllSitemaps(sitemapUrls, {
      timeout: 15000,
      includeLastmod: true,
    });

    console.log(`[Job ${jobId}] Found ${parseResult.total} manga URLs`);

    // Update job with total items
    await supabase
      .from('import_jobs' as any)
      .update({ total_items: parseResult.total })
      .eq('id', jobId);

    if (parseResult.total === 0) {
      await completeJob(jobId, 0, 0, 0, errors);
      return;
    }

    // Check which manga already exist
    const slugs = parseResult.mangas.map(m => m.slug);
    const { data: existingManga } = await supabase
      .from('manga')
      .select('id, slug, updated_at')
      .in('slug', slugs);

    const existingMap = new Map(
      (existingManga || []).map(m => [m.slug, m])
    );

    // Categorize manga
    const newManga = parseResult.mangas.filter(m => !existingMap.has(m.slug));
    const existingMangaList = parseResult.mangas.filter(m => existingMap.has(m.slug));

    console.log(`[Job ${jobId}] New: ${newManga.length}, Existing: ${existingMangaList.length}`);

    // Process new manga (if enabled)
    if (options.importNew && newManga.length > 0) {
      console.log(`[Job ${jobId}] Processing ${newManga.length} new manga...`);

      for (let i = 0; i < newManga.length; i += options.batchSize) {
        const batch = newManga.slice(i, i + options.batchSize);
        const results = await Promise.allSettled(
          batch.map(manga => scrapeAndCreateManga(manga.url, options.userId))
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const manga = batch[j];

          if (result.status === 'fulfilled' && result.value) {
            newCount++;
          } else {
            errors.push({
              url: manga.url,
              error: result.status === 'rejected'
                ? result.reason?.message || 'Unknown error'
                : 'Failed to scrape',
            });
          }

          // Update progress
          const processed = i + j + 1;
          await updateJobProgress(jobId, processed, newCount, updatedCount);
        }

        // Small delay between batches to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Process existing manga (if updates enabled)
    if (options.importUpdates && existingMangaList.length > 0) {
      console.log(`[Job ${jobId}] Checking ${existingMangaList.length} existing manga for updates...`);

      for (let i = 0; i < existingMangaList.length; i += options.batchSize) {
        const batch = existingMangaList.slice(i, i + options.batchSize);
        const results = await Promise.allSettled(
          batch.map(async (manga) => {
            const existing = existingMap.get(manga.slug)!;

            // Check if update is needed (compare lastmod)
            if (manga.lastModified && new Date(manga.lastModified) <= new Date(existing.updated_at)) {
              return { skipped: true };
            }

            return await scrapeAndUpdateManga(manga.url, existing.id);
          })
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const manga = batch[j];

          if (result.status === 'fulfilled') {
            if (result.value?.skipped) {
              skippedCount++;
            } else if (result.value) {
              updatedCount++;
            }
          } else {
            errors.push({
              url: manga.url,
              error: result.status === 'rejected'
                ? result.reason?.message || 'Unknown error'
                : 'Failed to update',
            });
          }

          // Update progress
          const processed = newManga.length + i + j + 1;
          await updateJobProgress(jobId, processed, newCount, updatedCount);
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Complete job
    await completeJob(jobId, newCount, updatedCount, skippedCount, errors);

    console.log(`[Job ${jobId}] Completed: ${newCount} new, ${updatedCount} updated, ${skippedCount} skipped`);

  } catch (error) {
    console.error(`[Job ${jobId}] Fatal error:`, error);

    // Mark job as failed
    await supabase
      .from('import_jobs' as any)
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [...errors, { error: error instanceof Error ? error.message : 'Unknown error' }],
      })
      .eq('id', jobId);
  }
}

/**
 * Scrape manga from URL and create in database
 */
async function scrapeAndCreateManga(url: string, userId: string) {
  const supabase = await createClient();

  try {
    // Use shared scraping function directly (no HTTP call)
    const { scrapeMangaFromUrl } = await import('@/lib/scrapers/manga-scraper');
    const scraped = await scrapeMangaFromUrl(url);

    if (!scraped.title) {
      throw new Error('Invalid scrape response');
    }

    // Generate slug from URL if not provided
    const slug = extractSlugFromUrl(url);

    // Create manga in database
    const { data: manga } = await supabase
      .from('manga')
      .insert({
        slug,
        title: scraped.title,
        description: scraped.description,
        cover_url: scraped.cover_url,
        type: scraped.type || 'MANHWA',
        status: scraped.status || 'ONGOING',
        author: scraped.author,
        artist: scraped.artist,
        genres: scraped.genres || [],
        uploaded_by: userId, // System import by admin user
      })
      .select()
      .single();

    if (!manga) {
      throw new Error('Failed to create manga');
    }

    return manga;
  } catch (error) {
    console.error('Error scraping manga:', url, error);
    throw error;
  }
}

/**
 * Scrape and update existing manga
 */
async function scrapeAndUpdateManga(url: string, mangaId: string): Promise<{ skipped?: boolean } | null> {
  const supabase = await createClient();

  try {
    // Use shared scraping function directly (no HTTP call)
    const { scrapeMangaFromUrl } = await import('@/lib/scrapers/manga-scraper');
    const scraped = await scrapeMangaFromUrl(url);

    if (!scraped) {
      throw new Error('Invalid scrape response');
    }

    // Update manga
    const { data: manga } = await supabase
      .from('manga')
      .update({
        description: scraped.description,
        cover_url: scraped.cover_url,
        status: scraped.status,
        genres: scraped.genres,
      })
      .eq('id', mangaId)
      .select()
      .single();

    return manga ? { skipped: false } : null;
  } catch (error) {
    console.error('Error updating manga:', url, error);
    throw error;
  }
}

/**
 * Extract slug from manga URL
 */
function extractSlugFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.replace(/\/$/, '').split('/').filter(Boolean);
    return parts[parts.length - 1].replace(/^manga-/, '');
  } catch {
    return '';
  }
}

/**
 * Update job progress
 */
async function updateJobProgress(
  jobId: string,
  processed: number,
  newManga: number,
  updatedManga: number
) {
  const supabase = await createClient();

  await supabase
    .from('import_jobs' as any)
    .update({
      processed_items: processed,
      new_manga: newManga,
      updated_manga: updatedManga,
    })
    .eq('id', jobId);
}

/**
 * Mark job as completed
 */
async function completeJob(
  jobId: string,
  newManga: number,
  updatedManga: number,
  skipped: number,
  errors: Array<{ url: string; error: string }>
) {
  const supabase = await createClient();

  await supabase
    .from('import_jobs' as any)
    .update({
      status: 'completed',
      processed_items: newManga + updatedManga + skipped,
      new_manga: newManga,
      updated_manga: updatedManga,
      skipped_items: skipped,
      errors: errors.slice(0, 100), // Limit error storage
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}