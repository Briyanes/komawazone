import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

const ALLOWED_KEYS = [
  'announcement_banner',
  'site_name',
  'site_desc',
  'ga_code',
  'header_code',
  'body_code',
];

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ALLOWED_KEYS);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }
  return NextResponse.json({ status: 'success', data: settings });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as Record<string, unknown>;

  // Only allow whitelisted keys
  const upserts = Object.entries(body)
    .filter(([key]) => ALLOWED_KEYS.includes(key))
    .map(([key, value]) => ({
      key,
      value: value as import('@/types/database').Json,
      updated_at: new Date().toISOString(),
    }));

  if (upserts.length === 0) {
    return NextResponse.json({ status: 'error', error: 'No valid keys provided' }, { status: 400 });
  }

  const { error } = await supabase
    .from('site_settings')
    .upsert(upserts, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'success' });
}
