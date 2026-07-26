import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVipStatus, computeTrialExpiry, formatExpiryId } from '@/lib/vip';

/**
 * POST /api/v1/vip/claim-trial
 *
 * Grants a free 1-month VIP trial to logged-in users who have never
 * claimed it before. Anti-abuse: enforced at two layers —
 *   1. trial_claimed_at IS NULL (where clause)
 *   2. atomic UPDATE returning the row
 *
 * On success, sets vip_expires_at = now + 30d and trial_claimed_at = now,
 * and inserts a row into vip_trial_log for admin auditing.
 */
export async function POST(_req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Login dulu untuk klaim free trial VIP.' },
      { status: 401 }
    );
  }

  // Re-check eligibility server-side (defense in depth).
  const status = await getVipStatus(supabase);
  if (status.isVip) {
    return NextResponse.json(
      { error: 'Kamu sudah jadi VIP, nikmati aja!' },
      { status: 400 }
    );
  }
  if (!status.trialEligible) {
    return NextResponse.json(
      { error: 'Free trial sudah pernah diklaim sebelumnya.' },
      { status: 400 }
    );
  }

  const expiresAt = computeTrialExpiry();
  const nowIso = new Date().toISOString();

  // Atomic claim: only updates if trial_claimed_at is still NULL.
  // If two requests race, only one will get data back.
  const { data: updated, error: claimError } = await supabase
    .from('users')
    .update({
      vip_expires_at: expiresAt.toISOString(),
      trial_claimed_at: nowIso,
      trial_source: 'launch',
    })
    .eq('id', user.id)
    .is('trial_claimed_at', null) // anti-abuse: only if never claimed
    .select('id, trial_claimed_at')
    .single();

  if (claimError || !updated) {
    // Race condition: another request claimed it first.
    return NextResponse.json(
      { error: 'Free trial sudah pernah diklaim sebelumnya.' },
      { status: 409 }
    );
  }

  // Best-effort audit log (non-blocking for response, but we still await).
  await supabase.from('vip_trial_log').insert({
    user_id: user.id,
    source: 'launch',
    expires_at: expiresAt.toISOString(),
  });

  return NextResponse.json({
    success: true,
    message: `VIP FREE Trial aktif! Berlaku hingga ${formatExpiryId(expiresAt)}.`,
    plan: 'free-trial-30d',
    expiresAt: expiresAt.toISOString(),
  });
}