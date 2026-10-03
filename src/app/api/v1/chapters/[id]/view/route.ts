import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 30 view-increments per minute per IP (prevent view inflation spam)
  const rl = await rateLimit(req, { limit: 30, window: 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json(
      { status: 'error', error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Reset': rl.resetAt.toISOString() } }
    );
  }

  try {
    const { id } = await params;
    const supabase = await createClient();

    // Increment atomik via RPC (migration 058): satu statement SQL,
    // kebal race-condition, dan mengabaikan chapter yang di-soft-delete.
    const { error } = await supabase.rpc('increment_chapter_views', { p_chapter_id: id });
    if (error) {
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'success' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}