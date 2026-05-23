import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

// POST: revoke a subscription by its ID
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .select('user_id, status')
    .eq('id', id)
    .single();

  if (subError || !sub) {
    return NextResponse.json({ status: 'error', error: 'Subscription not found' }, { status: 404 });
  }

  await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', id);

  // Check if user has any other active subscriptions before revoking VIP
  const { data: otherActive } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', sub.user_id)
    .eq('status', 'active')
    .neq('id', id)
    .gt('expires_at', new Date().toISOString())
    .limit(1);

  if (!otherActive || otherActive.length === 0) {
    await supabase.from('users').update({ vip_expires_at: null }).eq('id', sub.user_id);
  }

  return NextResponse.json({ status: 'success' });
}
