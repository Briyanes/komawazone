import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/v1/admin/import-jobs/[id]/cancel
 * Manually cancel a stuck/running import job.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, status')
    .eq('id', id)
    .single();

  if (!job) return NextResponse.json({ error: 'Job tidak ditemukan' }, { status: 404 });
  if (job.status !== 'running') {
    return NextResponse.json({ error: 'Job tidak dalam status running' }, { status: 400 });
  }

  const { error } = await supabase
    .from('import_jobs')
    .update({ status: 'cancelled', error_message: 'Dibatalkan oleh admin' })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: 'success', message: 'Job berhasil dibatalkan' });
}
