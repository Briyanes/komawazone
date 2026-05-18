import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('bookmarks')
      .select(`
        id, created_at,
        manga(id, slug, title, cover_url, status, rating, views)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ status: 'success', data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
    }

    const { manga_id } = await request.json() as { manga_id: string };
    if (!manga_id) {
      return NextResponse.json({ status: 'error', error: 'Missing manga_id' }, { status: 400 });
    }

    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .match({ user_id: user.id, manga_id });

    if (error) throw error;
    return NextResponse.json({ status: 'success' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
