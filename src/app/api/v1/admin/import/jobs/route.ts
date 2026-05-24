import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/v1/admin/import/jobs
 * List import jobs with pagination and filtering
 */
export async function GET(req: NextRequest) {
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
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status');
    const jobType = searchParams.get('job_type');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('import_jobs' as any)
      .select('*')
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (jobType) {
      query = query.eq('job_type', jobType);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get total count
    const { count } = await supabase
      .from('import_jobs' as any)
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      status: 'success',
      data: {
        jobs: jobs || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
        },
      },
    });

  } catch (error) {
    console.error('Error fetching import jobs:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/admin/import/jobs
 * Cancel a running import job
 */
export async function DELETE(req: NextRequest) {
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
    const body = await req.json() as { jobId?: string };

    if (!body.jobId) {
      return NextResponse.json({
        error: 'jobId is required'
      }, { status: 400 });
    }

    // Update job status to cancelled
    const { error } = await supabase
      .from('import_jobs' as any)
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', body.jobId)
      .eq('status', 'running'); // Only cancel running jobs

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      message: 'Job cancelled successfully',
    });

  } catch (error) {
    console.error('Error cancelling job:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}