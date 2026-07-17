import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

import { createServiceClient } from '@/lib/supabase/service';
/**
 * GET /api/v1/admin/voucher-codes
 * List all voucher codes with optional filters
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status'); // 'active', 'used'
  const plan = searchParams.get('plan');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('vip_codes')
    .select('*, users!vip_codes_used_by_fkey(id, email, username)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === 'active') {
    query = query.is('used_by', null);
  } else if (status === 'used') {
    query = query.not('used_by', 'is', null);
  }

  if (plan) {
    query = query.eq('plan', plan as '1-month' | '3-month' | '6-month');
  }

  const { data: codes, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    codes: codes ?? [],
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

/**
 * POST /api/v1/admin/voucher-codes
 * Generate batch voucher codes
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  type Plan = '1-month' | '3-month' | '6-month';
  const body = await req.json() as { plan?: string; count?: number };
  const plan = (body.plan || '1-month') as Plan;
  const count = Math.min(Math.max(body.count || 10, 1), 100);

  if (!['1-month', '3-month', '6-month'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Generate unique codes
  const codes: string[] = [];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0,O,1,I)

  for (let i = 0; i < count; i++) {
    let code: string;
    do {
      const seg1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const seg2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      code = `OLLUQ-${seg1}-${seg2}`;
    } while (codes.includes(code));
    codes.push(code);
  }

  // Insert into database
  const rows = codes.map(code => ({
    code,
    plan,
    created_by: user.id,
  }));

  const { data: inserted, error } = await supabase
    .from('vip_codes')
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    codes: inserted,
    count: inserted?.length ?? 0,
  });
}

/**
 * DELETE /api/v1/admin/voucher-codes
 * Delete unused voucher code(s)
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  // Only allow deleting unused codes
  const { error } = await supabase
    .from('vip_codes')
    .delete()
    .eq('id', body.id)
    .is('used_by', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
