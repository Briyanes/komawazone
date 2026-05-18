import { NextResponse } from 'next/server';
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

export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const [
    { count: mangaCount },
    { count: chapterCount },
    { count: userCount },
    { data: topManga },
    { count: providerCount },
  ] = await Promise.all([
    supabase.from('manga').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('chapters').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('manga').select('id, title, cover_url, views').order('views', { ascending: false }).limit(5),
    supabase.from('ad_providers').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  return NextResponse.json({
    status: 'success',
    data: {
      manga_count: mangaCount ?? 0,
      chapter_count: chapterCount ?? 0,
      user_count: userCount ?? 0,
      active_ad_providers: providerCount ?? 0,
      top_manga: topManga ?? [],
    },
  });
}
