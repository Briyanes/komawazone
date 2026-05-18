import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as {
      manga_id: string;
      chapter_id: string;
      page_number: number;
      read_percentage: number;
    };

    const { manga_id, chapter_id, page_number, read_percentage } = body;
    if (!manga_id || !chapter_id) {
      return NextResponse.json({ status: 'error', error: 'Missing fields' }, { status: 400 });
    }

    const { error } = await supabase
      .from('reading_progress')
      .upsert(
        {
          user_id: user.id,
          manga_id,
          chapter_id,
          page_number: page_number ?? 1,
          read_percentage: read_percentage ?? 0,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,manga_id' }
      );

    if (error) throw error;
    return NextResponse.json({ status: 'success' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('reading_progress')
      .select(`
        manga_id, chapter_id, page_number, read_percentage, last_read_at,
        manga(id, slug, title, cover_url)
      `)
      .eq('user_id', user.id)
      .order('last_read_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[progress GET error]', error);
      throw error;
    }
    return NextResponse.json({ status: 'success', data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[progress GET catch]', err);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
