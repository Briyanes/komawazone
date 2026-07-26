import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  // ── Auth check ──────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await serviceClient.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'ADMIN') return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });

  // ── Stats: eligible vs claimed ──────────────────────────────────────────
  const { count: totalUsers } = await serviceClient
    .from('users').select('*', { count: 'exact', head: true });
  const { count: claimedCount } = await serviceClient
    .from('users').select('*', { count: 'exact', head: true }).not('trial_claimed_at', 'is', null);
  const { count: activeTrialCount } = await serviceClient
    .from('users').select('*', { count: 'exact', head: true })
    .not('trial_claimed_at', 'is', null)
    .gt('vip_expires_at', new Date().toISOString());

  // ── Recent trial claims (last 100) with user info ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any;
  const { data: claims, error } = await db
    .from('vip_trial_log')
    .select(`
      id, user_id, source, ip_address, user_agent, claimed_at, expires_at,
      users!inner ( email, username, avatar_url )
    `)
    .order('claimed_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: 'success',
    data: {
      stats: {
        total_users: totalUsers ?? 0,
        claimed: claimedCount ?? 0,
        active: activeTrialCount ?? 0,
        eligible: (totalUsers ?? 0) - (claimedCount ?? 0),
      },
      claims: claims ?? [],
    },
  });
}