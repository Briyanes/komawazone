import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportToGoogleSheet } from '@/lib/integrations/google-sheets';

import { createServiceClient } from '@/lib/supabase/service';
/**
 * POST /api/v1/admin/export/sheets
 * Export import job results to Google Sheets
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
      jobId?: string;
      tab?: string;
    };

    if (!body.jobId) {
      return NextResponse.json({
        error: 'jobId is required'
      }, { status: 400 });
    }

    // Get job details
    const jobResult = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', body.jobId)
      .single();

    if (jobResult.error || !jobResult.data) {
      return NextResponse.json({
        error: 'Job not found or invalid'
      }, { status: 404 });
    }

    const job = jobResult.data as unknown as {
      id: string;
      started_at: string;
      [key: string]: unknown;
    };

    if (!job.started_at) {
      return NextResponse.json({
        error: 'Job has no started_at date'
      }, { status: 400 });
    }

    // Get imported manga data from job — also fetch source_url
    const { data: manga } = await supabase
      .from('manga')
      .select('slug, title, type, source_url, created_at, updated_at')
      .gte('created_at', job.started_at)
      .order('created_at', { ascending: true });

    // Fetch first active source as fallback base_url
    const { data: firstSource } = await supabase
      .from('manga_sources')
      .select('base_url')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single() as unknown as { data: { base_url: string } | null };
    const fallbackBase = firstSource?.base_url?.replace(/\/$/, '') ?? 'https://04x.manhwaland.land';

    // Prepare data for export
    const exportData = (manga || []).map(m => ({
      url: m.source_url ?? `${fallbackBase}/manga/${m.slug}/`,
      slug: m.slug,
      title: m.title,
      type: m.type as 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON',
      status: 'IMPORTED' as 'NEW' | 'UPDATED' | 'EXISTING',
      lastmod: m.updated_at,
      imported: true,
      notes: `Imported via job ${job.id}`,
    }));

    // Export to Google Sheets
    const result = await exportToGoogleSheet(exportData, 'HISTORY');

    if (!result.success) {
      return NextResponse.json({
        error: result.error || 'Export failed'
      }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: {
        message: 'Exported to Google Sheets',
        rowsExported: result.rowsExported,
      },
    });

  } catch (error) {
    console.error('Google Sheets export error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
