import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(50, Number(searchParams.get('limit') ?? 20));

  let query = supabase
    .from('notifications')
    .select('id, type, title, body, manga_id, chapter_id, read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('read', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });

  const unreadCount = (data ?? []).filter(n => !n.read).length;
  return NextResponse.json({ status: 'success', data: data ?? [], unreadCount });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });

  const { ids } = await request.json() as { ids?: string[] };

  if (ids && ids.length > 0) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', ids)
      .eq('user_id', user.id);
  } else {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
  }

  return NextResponse.json({ status: 'success' });
}
