import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PUBLIC genres endpoint — no admin auth required.
 * Used by SearchContent and other public pages.
 *
 * Response is cached at the edge for 1 hour (genres rarely change).
 */
export const revalidate = 3600; // 1 hour ISR

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('genres')
    .select('id, name, slug, description, is_mature')
    .order('name');

  if (error) {
    return NextResponse.json(
      { status: 'error', error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { status: 'success', data: data ?? [] },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}