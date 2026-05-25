import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type ReviewInsert = Database['public']['Tables']['manga_reviews']['Insert'];
type ReviewUpdate = Database['public']['Tables']['manga_reviews']['Update'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const limit = Math.min(10, Number(url.searchParams.get('limit') ?? 5));
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    // Get manga ID from slug
    const { data: manga, error: mangaErr } = await supabase
      .from('manga')
      .select('id')
      .eq('slug', slug)
      .single();

    if (mangaErr || !manga) {
      return NextResponse.json({ status: 'error', error: 'Manga not found' }, { status: 404 });
    }

    // Fetch reviews with user info
    const { data: reviews, error, count } = await supabase
      .from('manga_reviews')
      .select(`
        id, rating, text, created_at,
        users(id, username, avatar_url)
      `, { count: 'exact' })
      .eq('manga_id', manga.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: reviews,
      meta: { total: count ?? 0, page, limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
    }

    // Get manga ID from slug
    const { data: manga, error: mangaErr } = await supabase
      .from('manga')
      .select('id')
      .eq('slug', slug)
      .single();

    if (mangaErr || !manga) {
      return NextResponse.json({ status: 'error', error: 'Manga not found' }, { status: 404 });
    }

    const body = await request.json() as unknown;
    const { rating, text } = body as { rating?: number; text?: string };

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ status: 'error', error: 'Rating must be 1-5' }, { status: 400 });
    }

    // Try to find existing review
    const { data: existingReview } = await supabase
      .from('manga_reviews')
      .select('id')
      .eq('manga_id', manga.id)
      .eq('user_id', user.id)
      .single();

    let data, error;

    if (existingReview && typeof existingReview === 'object' && 'id' in existingReview) {
      // Update existing review
      const result = await supabase
        .from('manga_reviews')
        .update({ rating, text: text || null, updated_at: new Date().toISOString() } as ReviewUpdate)
        .eq('id', (existingReview as { id: string }).id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert new review
      const result = await supabase
        .from('manga_reviews')
        .insert([{ manga_id: manga.id, user_id: user.id, rating, text: text || null } as ReviewInsert])
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Review error:', error);
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
