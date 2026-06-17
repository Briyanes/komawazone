import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, RateLimits } from '@/lib/rate-limit';

const PER_PAGE = 20;

export async function GET(request: NextRequest) {
  // Rate limit: 60 requests per minute per IP (browse/search)
  const rl = await rateLimit(request, RateLimits.search);
  if (!rl.success) {
    return NextResponse.json(
      { status: 'error', error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
      { status: 429, headers: { 'X-RateLimit-Reset': rl.resetAt.toISOString() } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const params = await Promise.resolve(searchParams);
    const q         = params.get('q')          ?? '';
    const status    = params.get('status')     ?? '';
    const genre     = params.get('genre')      ?? '';
    const sort      = params.get('sort')       ?? 'latest';
    const page      = Math.max(1, Number(params.get('page')       ?? '1'));
    const author    = params.get('author')     ?? '';
    const type      = params.get('type')       ?? '';
    const year      = params.get('year')       ?? '';
    const minRating = Number(params.get('min_rating') ?? '0');
    const from      = (page - 1) * PER_PAGE;
    const to        = from + PER_PAGE - 1;

    const supabase = await createClient();

    // All manga (general + mature) visible at search/browse level.
    // Mature gating is enforced in the reader (preview limit) and MangaCard (18+ badge).
    let query = supabase
      .from('manga')
      .select('id, slug, title, cover_url, status, rating, views, content_rating', { count: 'exact' })
      .is('deleted_at', null)
      .range(from, to);

    if (q)              query = query.ilike('title', `%${q}%`);
    if (status)         query = query.eq('status', status as 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED');
    if (genre)          query = query.contains('genres', [genre]);
    if (author)         query = query.ilike('author', `%${author}%`);
    if (type)           query = query.eq('type', type as 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON');
    if (year)           query = query.eq('release_year', Number(year));
    if (minRating > 0)  query = query.gte('rating', minRating);

    const sortMap: Record<string, { column: string; ascending: boolean }> = {
      latest:  { column: 'updated_at', ascending: false },
      popular: { column: 'views',      ascending: false },
      rating:  { column: 'rating',     ascending: false },
      title:   { column: 'title',      ascending: true  },
    };
    const s = sortMap[sort] ?? sortMap.latest;
    query = query.order(s.column, { ascending: s.ascending });

    const { data, count, error } = await query;
    if (error) throw error;

    const response = NextResponse.json({
      status: 'success',
      data: data ?? [],
      meta: {
        page,
        perPage: PER_PAGE,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / PER_PAGE),
        timestamp: new Date().toISOString(),
      },
    });

    // Cache public search results for 60s, allow stale for 300s
    if (!q && !author) {
      response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

