import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('manga')
      .select(`
        *,
        chapters(id, number, title, release_date, views)
      `)
      .eq('slug', slug)
      .is('deleted_at', null)
      .lte('chapters.release_date', new Date().toISOString())
      .order('number', { referencedTable: 'chapters', ascending: false })
      .single();

    if (error || !data) {
      return NextResponse.json({ status: 'error', error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
