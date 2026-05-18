import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const PostSchema = z.object({
  content: z.string().min(1).max(2000),
  parent_id: z.string().uuid().optional().nullable(),
});

// GET /api/v1/manga/[slug]/comments?sort=newest|oldest|popular&page=1
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get('sort') ?? 'newest';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = 20;
  const offset = (page - 1) * limit;

  const supabase = await createClient();

  // Get manga id from slug
  const { data: manga } = await supabase
    .from('manga')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!manga) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch top-level comments only (no parent)
  let query = supabase
    .from('comments')
    .select('id, content, created_at, likes_count, parent_id, user:users(id, username, avatar_url)', { count: 'exact' })
    .eq('manga_id', manga.id)
    .is('chapter_id', null)
    .is('parent_id', null)
    .range(offset, offset + limit - 1);

  if (sort === 'oldest') query = query.order('created_at', { ascending: true });
  else if (sort === 'popular') query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch replies for these comments
  let replies: unknown[] = [];
  if (data && data.length > 0) {
    const topIds = data.map(c => c.id);
    const { data: replyData } = await supabase
      .from('comments')
      .select('id, content, created_at, likes_count, parent_id, user:users(id, username, avatar_url)')
      .in('parent_id', topIds)
      .order('created_at', { ascending: true });
    replies = replyData ?? [];
  }

  // Get current user's liked comment ids (top + replies)
  const { data: { user } } = await supabase.auth.getUser();
  let likedIds: string[] = [];
  if (user && data && data.length > 0) {
    const allIds = [...data.map(c => c.id), ...(replies as { id: string }[]).map(r => r.id)];
    const { data: liked } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', user.id)
      .in('comment_id', allIds);
    likedIds = (liked ?? []).map(l => l.comment_id as string);
  }

  return NextResponse.json({
    data: data ?? [],
    replies,
    likedIds,
    total: count ?? 0,
    page,
    hasMore: offset + limit < (count ?? 0),
  });
}

// POST /api/v1/manga/[slug]/comments
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as unknown;
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { data: manga } = await supabase
    .from('manga')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!manga) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('comments')
    .insert({ manga_id: manga.id, user_id: user.id, content: parsed.data.content, parent_id: parsed.data.parent_id ?? null })
    .select('id, content, created_at, likes_count, parent_id, user:users(id, username, avatar_url)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// DELETE /api/v1/manga/[slug]/comments  body: { id }
export async function DELETE(req: NextRequest, { params: _ }: RouteContext) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // RLS ensures user can only delete own comments
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', body.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
