import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Called by Vercel Cron daily — expires subscriptions and clears user VIP status
export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();

    // 1. Mark overdue active subscriptions as expired
    const { data: expiredSubs, error: subError } = await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (subError) throw subError;

    // 2. Clear vip_expires_at for users whose VIP has expired AND have no other active subscription
    // Get user IDs that still have active subs (so we don't clear those)
    const { data: activeSubUsers } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString());

    const protectedUserIds = (activeSubUsers ?? []).map((r: { user_id: string }) => r.user_id);

    // Build query: clear expired VIP for users not in protectedUserIds
    let clearQuery = supabase
      .from('users')
      .update({ vip_expires_at: null })
      .lt('vip_expires_at', new Date().toISOString());

    if (protectedUserIds.length > 0) {
      clearQuery = clearQuery.not('id', 'in', `(${protectedUserIds.join(',')})`);
    }

    const { data: clearedUsers, error: userError } = await clearQuery
      .select('id');

    if (userError) throw userError;

    return NextResponse.json({
      ok: true,
      expiredSubscriptions: expiredSubs?.length ?? 0,
      clearedVipUsers: clearedUsers?.length ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
