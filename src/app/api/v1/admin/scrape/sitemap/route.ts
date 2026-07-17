import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processImportChunk } from '@/lib/scrapers/sitemap-import';

import { createServiceClient } from '@/lib/supabase/service';
// Allow up to 300s on Vercel Pro; background work runs via after()
// processImportChunk handles chunking automatically — setiap invokasi proses IMPORT_CHUNK_SIZE item
// lalu auto-trigger /resume untuk melanjutkan, sehingga job bisa berjalan jauh lebih lama dari 300 detik.
export const maxDuration = 300;

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

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
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
      sourceId?: string;
      options?: {
        importNew?: boolean;
        importUpdates?: boolean;
        batchSize?: number;
        contentRating?: 'general' | 'mature';
        sitemapContentRatings?: Record<string, 'general' | 'mature'>;
      };
    };

    const { sitemapUrls, sourceId, options = {} } = body;

    // Validate input
    if (!sitemapUrls || !Array.isArray(sitemapUrls) || sitemapUrls.length === 0) {
      return NextResponse.json({
        error: 'sitemapUrls is required and must be a non-empty array'
      }, { status: 400 });
    }

    const {
      importNew = true,
      importUpdates = true,
      // Hard-cap at 5 regardless of client request to prevent CloudFlare rate-limiting
      batchSize = 3,
      contentRating = 'general',
      sitemapContentRatings = {},
    } = options;
    const safeBatchSize = Math.min(batchSize, 5);

    // Full options — disimpan di config agar cron /api/cron/import-advance bisa melanjutkan
    const importOptions = {
      importNew,
      importUpdates,
      batchSize: safeBatchSize,
      userId: user.id,
      sourceId: sourceId ?? null,
      contentRating,
      sitemapContentRatings,
    };

    // Create import job
    const result = await supabase
      .from('import_jobs')
      .insert({
        job_type: 'sitemap_import',
        status: 'running',
        total_items: 0, // Will update after parsing
        processed_items: 0,
        new_manga: 0,
        updated_manga: 0,
        skipped_items: 0,
        errors: [],
        config: { sitemapUrls, options: importOptions },
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

    // Kick off chunk pertama segera via after() agar import mulai tanpa harus menunggu cron.
    // Chunk berikutnya dilanjutkan oleh /api/cron/import-advance setiap 5 menit.
    after(() =>
      processImportChunk(jobData.id, sitemapUrls, importOptions, 0).catch(error => {
        console.error('Sitemap import error (chunk 0):', error);
      })
    );

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
