import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runBackfill } from '@/app/api/v1/admin/storage/backfill/route';

export const maxDuration = 300;

/**
 * GET /api/cron/storage-backfill
 *
 * Scheduled cron (02:30 UTC) — migrates chapter images from third-party CDNs
 * to R2 storage automatically (oldest-first, ±20 chapters per run). Over time
 * all images move off source CDNs, making the site resilient to source
 * domain rotation (images keep working even when the source dies).
 *
 * Query params:
 *   - type:  'manga' | 'chapters' | 'all'  (default: 'chapters')
 *   - limit: max items to process          (default 20, max 50)
 *
 * Auth: Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;

  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = (req.nextUrl.searchParams.get('type') ?? 'chapters') as 'manga' | 'chapters' | 'all';
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 20) || 20, 50);

  // Cron has no user session — use service-role admin client (bypasses RLS)
  const adminSupabase = createAdminClient();

  // Use an ADMIN account for job tracking (created_by)
  const { data: adminUser } = await adminSupabase
    .from('users')
    .select('id')
    .eq('role', 'ADMIN')
    .limit(1)
    .single();

  if (!adminUser?.id) {
    return NextResponse.json({ error: 'No admin user found for job tracking' }, { status: 500 });
  }

  const { data: job } = await adminSupabase
    .from('import_jobs')
    .insert({
      job_type: 'r2_backfill',
      status: 'running',
      total_items: 0,
      processed_items: 0,
      new_manga: 0,
      updated_manga: 0,
      skipped_items: 0,
      created_by: adminUser.id,
    })
    .select('id')
    .single();

  const jobId = job?.id ?? null;

  // Run the actual backfill in background (within maxDuration window)
  after(() => runBackfill(jobId, type, limit));

  return NextResponse.json({
    status: 'success',
    message: `Storage backfill scheduled (type=${type}, limit=${limit})`,
    jobId,
  });
}