import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mangaId = searchParams.get('manga_id');
  if (!mangaId) return NextResponse.json({ status: 'error', error: 'manga_id required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'success', data: null });

  const { data } = await supabase
    .from('user_ratings')
    .select('rating')
    .eq('user_id', user.id)
    .eq('manga_id', mangaId)
    .maybeSingle();

  return NextResponse.json({ status: 'success', data: data?.rating ?? null });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { manga_id?: string; rating?: number };
  const { manga_id, rating } = body;
  if (!manga_id || typeof rating !== 'number' || rating < 1 || rating > 5) {
    return NextResponse.json({ status: 'error', error: 'Invalid rating' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_ratings')
    .upsert(
      { user_id: user.id, manga_id, rating, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,manga_id' }
    );

  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success' });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mangaId = searchParams.get('manga_id');
  if (!mangaId) return NextResponse.json({ status: 'error', error: 'manga_id required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });

  await supabase
    .from('user_ratings')
    .delete()
    .eq('user_id', user.id)
    .eq('manga_id', mangaId);

  return NextResponse.json({ status: 'success' });
}
