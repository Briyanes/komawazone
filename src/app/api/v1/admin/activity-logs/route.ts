import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

// GET: list activity logs with filters + pagination
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const page     = Math.max(1,  parseInt(url.searchParams.get('page')  ?? '1'));
  const limit    = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50')));
  const action   = url.searchParams.get('action') ?? null;
  const entity   = url.searchParams.get('entity') ?? null;
  const adminId  = url.searchParams.get('admin_id') ?? null;
  const search   = url.searchParams.get('search') ?? null;

  const offset = (page - 1) * limit;

  // Use service client to bypass RLS (admin-only route).
  // admin_activity_logs table is created by migration 052 but TS types
  // haven't been regenerated — cast to bypass strict generated types.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const serviceClient = createServiceClient();
  let query = (serviceClient as any)
    .from('admin_activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (action)  query = query.eq('action', action.toUpperCase());
  if (entity)  query = query.eq('entity_type', entity.toLowerCase());
  if (adminId) query = query.eq('admin_id', adminId);
  if (search)  query = query.ilike('path', `%${search}%`);

  const { data, error, count } = await query;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });

  return NextResponse.json({
    status: 'success',
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}