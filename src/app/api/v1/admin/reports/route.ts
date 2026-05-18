import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase))
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });

  const { data } = await supabase
    .from('chapter_reports')
    .select('id, reason, notes, created_at, user_id, chapter_id, chapter:chapters(id, number, title, manga:manga(title, slug)), reporter:users(username, email)')
    .order('created_at', { ascending: false })
    .limit(200);

  return NextResponse.json({ status: 'success', data: data ?? [] });
}
