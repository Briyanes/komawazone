import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

const GrantSchema = z.object({
  user_id: z.string().uuid(),
  duration_days: z.number().int().min(1).max(3650),
  payment_method: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// GET: list subscriptions OR find user by email (?find_user=email)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const findUser = url.searchParams.get('find_user');

  if (findUser) {
    const { data } = await supabase
      .from('users')
      .select('id, email, username, avatar_url, vip_expires_at')
      .ilike('email', findUser.trim())
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ status: 'success', data: data ?? null });
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, users(email, username)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data: data ?? [] });
}

// POST: grant VIP to a user
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as unknown;
  const parsed = GrantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', error: parsed.error.flatten() }, { status: 400 });
  }

  const { user_id, duration_days, payment_method, notes } = parsed.data;

  // Use admin client to bypass RLS — admin needs to read/update other users' rows
  const adminClient = createAdminClient();

  const { data: user, error: userError } = await adminClient
    .from('users')
    .select('id, vip_expires_at')
    .eq('id', user_id)
    .single();

  if (userError || !user) {
    return NextResponse.json({ status: 'error', error: 'User not found' }, { status: 404 });
  }

  // Extend from current active VIP, or start from now
  const base = user.vip_expires_at && new Date(user.vip_expires_at) > new Date()
    ? new Date(user.vip_expires_at)
    : new Date();
  const expiresAt = new Date(base);
  expiresAt.setDate(expiresAt.getDate() + duration_days);

  await adminClient
    .from('users')
    .update({ vip_expires_at: expiresAt.toISOString() })
    .eq('id', user_id);

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id,
      plan: 'vip',
      amount: 15000,
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      status: 'active',
      payment_method: payment_method ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data }, { status: 201 });
}
