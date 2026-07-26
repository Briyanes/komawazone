import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVipStatus, computeTrialExpiry, formatExpiryId, REFERRAL_REWARD_DAYS } from '@/lib/vip';
import { processReferralReward } from '@/lib/referral';
import { sendEmail } from '@/lib/email/resend';
import { referralRewardEmail } from '@/lib/email/templates';

/**
 * POST /api/v1/vip/claim-trial
 *
 * Grants a free 1-month VIP trial to logged-in users who have never
 * claimed it before. Anti-abuse: enforced at two layers —
 *   1. trial_claimed_at IS NULL (where clause)
 *   2. atomic UPDATE returning the row
 *
 * Optional: pass `referralCode` in body to attach a referrer and trigger
 * double-sided reward (inviter +7d, invitee +7d bonus).
 *
 * On success, sets vip_expires_at = now + 30d and trial_claimed_at = now,
 * and inserts a row into vip_trial_log for admin auditing.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Login dulu untuk klaim free trial VIP.' },
      { status: 401 }
    );
  }

  // Parse optional referral code from body.
  let referralCode: string | null = null;
  try {
    const body = await req.json();
    referralCode = typeof body?.referralCode === 'string' ? body.referralCode : null;
  } catch {
    // No body or invalid JSON — that's fine, referral is optional.
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
  // Also persist referred_by atomically (immutable after set).
  const { data: updated, error: claimError } = await supabase
    .from('users')
    .update({
      vip_expires_at: expiresAt.toISOString(),
      trial_claimed_at: nowIso,
      trial_source: 'launch',
      ...(referralCode ? { referred_by: referralCode.trim().toUpperCase() } : {}),
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

  // ── Referral reward processing (best-effort, never blocks trial claim) ──
  let referralRewarded = false;
  let finalExpiry = expiresAt.toISOString();
  let inviterName: string | undefined;
  try {
    const result = await processReferralReward(supabase, user.id, referralCode);
    referralRewarded = result.rewarded;
    if (referralRewarded) {
      // Re-read the final expiry (may have been extended by +7d bonus).
      const { data: refreshed } = await supabase
        .from('users')
        .select('vip_expires_at, username, email')
        .eq('id', user.id)
        .single();
      if (refreshed?.vip_expires_at) finalExpiry = refreshed.vip_expires_at;
      const inviteeName = refreshed?.username ?? undefined;
      const inviteeEmail = refreshed?.email ?? undefined;

      // Fetch inviter details for the email (and to notify them too).
      if (referralCode) {
        const { data: inviter } = await supabase
          .from('users')
          .select('id, username, email, vip_expires_at')
          .eq('referral_code', referralCode.trim().toUpperCase())
          .maybeSingle();
        inviterName = inviter?.username ?? undefined;

        // Email the INVITER (+7d reward) — best effort.
        if (inviter?.email) {
          const tpl = referralRewardEmail({
            recipientEmail: inviter.email,
            recipientName: inviterName,
            rewardDays: REFERRAL_REWARD_DAYS,
            inviterName: inviteeName,
            totalExpiry: inviter.vip_expires_at ? formatExpiryId(inviter.vip_expires_at) : undefined,
          });
          void sendEmail(
            { to: inviter.email, type: 'referral_reward', subject: tpl.subject, html: tpl.html, userId: inviter.id },
            supabase
          );
        }
      }

      // Email the INVITEE (this user, +7d bonus) — best effort.
      if (inviteeEmail) {
        const tpl = referralRewardEmail({
          recipientEmail: inviteeEmail,
          recipientName: inviteeName,
          rewardDays: REFERRAL_REWARD_DAYS,
          inviterName,
          totalExpiry: formatExpiryId(finalExpiry),
        });
        void sendEmail(
          { to: inviteeEmail, type: 'referral_reward', subject: tpl.subject, html: tpl.html, userId: user.id },
          supabase
        );
      }
    }
  } catch {
    // Referral failures must NEVER break the trial claim.
  }

  const finalExpiryDate = new Date(finalExpiry);
  const message = referralRewarded
    ? `VIP Trial + Bonus Referral ${REFERRAL_REWARD_DAYS} hari aktif! Berlaku hingga ${formatExpiryId(finalExpiryDate)}.`
    : `VIP FREE Trial aktif! Berlaku hingga ${formatExpiryId(finalExpiryDate)}.`;

  return NextResponse.json({
    success: true,
    message,
    plan: referralRewarded ? 'free-trial-30d+referral-bonus' : 'free-trial-30d',
    expiresAt: finalExpiry,
    referralRewarded,
  });
}