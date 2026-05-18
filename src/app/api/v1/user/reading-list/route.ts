import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const StatusSchema = z.enum(['reading', 'plan_to_read', 'completed', 'on_hold', 'dropped']);

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('reading_list')
    .select('id, status, updated_at, manga(id, slug, title, cover_url, status, rating, views)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (status) query = query.eq('status', status as 'reading' | 'plan_to_read' | 'completed' | 'on_hold' | 'dropped');

  const { data, error } = await query;
  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { manga_id?: string; status?: string };
  const manga_id = body.manga_id;
  const parsed = StatusSchema.safeParse(body.status ?? 'plan_to_read');
  if (!manga_id || !parsed.success) {
    return NextResponse.json({ status: 'error', error: 'Invalid input' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('reading_list')
    .upsert({ user_id: user.id, manga_id, status: parsed.data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,manga_id' })
    .select('id, status')
    .single();

  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { manga_id?: string };
  if (!body.manga_id) return NextResponse.json({ status: 'error', error: 'Missing manga_id' }, { status: 400 });

  const { error } = await supabase
    .from('reading_list')
    .delete()
    .match({ user_id: user.id, manga_id: body.manga_id });

  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success' });
}
