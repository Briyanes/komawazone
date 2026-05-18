import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteContext {
  params: Promise<{ commentId: string }>;
}

// POST /api/v1/comments/[commentId]/like  — toggle like
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { commentId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if already liked
  const { data: existing } = await supabase
    .from('comment_likes')
    .select('id')
    .eq('user_id', user.id)
    .eq('comment_id', commentId)
    .single();

  if (existing) {
    await supabase.from('comment_likes').delete().eq('id', existing.id);
  } else {
    await supabase.from('comment_likes').insert({ user_id: user.id, comment_id: commentId });
  }

  // Sync likes_count from actual count
  const { count } = await supabase
    .from('comment_likes')
    .select('*', { count: 'exact', head: true })
    .eq('comment_id', commentId);
  await supabase.from('comments').update({ likes_count: count ?? 0 }).eq('id', commentId);

  return NextResponse.json({ liked: !existing });
}
