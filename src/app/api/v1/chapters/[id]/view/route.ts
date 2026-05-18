import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Get current chapter to find manga_id
    const { data: chapter, error: fetchErr } = await supabase
      .from('chapters')
      .select('id, manga_id, views')
      .eq('id', id)
      .single();

    if (fetchErr || !chapter) {
      return NextResponse.json({ status: 'error', error: 'Not found' }, { status: 404 });
    }

    // Increment chapter views
    const { error: chErr } = await supabase
      .from('chapters')
      .update({ views: (chapter.views ?? 0) + 1 } as never)
      .eq('id', id);

    // Increment manga views
    const { data: manga } = await supabase
      .from('manga')
      .select('views')
      .eq('id', chapter.manga_id)
      .single();

    if (manga) {
      await supabase
        .from('manga')
        .update({ views: (manga.views ?? 0) + 1 } as never)
        .eq('id', chapter.manga_id);
    }

    if (chErr) {
      return NextResponse.json({ status: 'error', error: chErr.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'success' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
