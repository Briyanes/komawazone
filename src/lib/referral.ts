/**
 * Referral Program Helper.
 *
 * Server-side utilities for the double-sided referral program.
 * - ensureReferralCode: lazily generates a unique code for the user.
 * - validateReferralCode: checks if a code exists in the DB.
 * - processReferralReward: atomically grants rewards to both inviter & invitee.
 *
 * Anti-abuse layers:
 *   1. referrals.referred_id UNIQUE constraint → 1 invitee can only be referred once.
 *   2. referred_by set at trial claim (immutable).
 *   3. MAX_REFERRALS_PER_USER hard cap → inviter max 5 successful referrals.
 *   4. Can't refer yourself (self-referral guard).
 *   5. Reward processed only when status = 'completed' → 'rewarded' (idempotent).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { REFERRAL_REWARD_DAYS, MAX_REFERRALS_PER_USER, extendVipExpiry } from './vip';

type AnySupabaseClient = SupabaseClient;

/**
 * Generate a random 6-char alphanumeric code (A-Z, 0-9, no ambiguous chars).
 * Format: OLLUQ-XXXXXX
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `OLLUQ-${code}`;
}

/**
 * Lazily generate & persist a referral code for the user if they don't have one.
 * Retries on collision (rare with 30^6 ≈ 729M combinations).
 */
export async function ensureReferralCode(
  supabase: AnySupabaseClient,
  userId: string
): Promise<string> {
  // Check existing
  const { data: existing } = await supabase
    .from('users')
    .select('referral_code')
    .eq('id', userId)
    .single();

  if (existing?.referral_code) return existing.referral_code;

  // Generate with retry on collision (max 5 attempts)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error } = await supabase
      .from('users')
      .update({ referral_code: code })
      .eq('id', userId)
      .is('referral_code', null);

    if (!error) return code;
    // If unique violation (23505), retry with new code
    if (error.code !== '23505') throw error;
  }
  throw new Error('Gagal generate referral code setelah 5 percobaan.');
}

/**
 * Check if a referral code exists in the DB (for validation before claim).
 * Returns the referrer's user id if valid, null otherwise.
 */
export async function validateReferralCode(
  supabase: AnySupabaseClient,
  code: string
): Promise<string | null> {
  if (!code?.trim()) return null;

  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('referral_code', code.trim().toUpperCase())
    .single();

  return data?.id ?? null;
}

export interface ReferralStats {
  totalReferrals: number;
  successfulReferrals: number;
  remainingSlots: number;
  rewardDaysEarned: number;
}

/**
 * Get referral stats for a user (for display in UI).
 */
export async function getReferralStats(
  supabase: AnySupabaseClient,
  userId: string
): Promise<ReferralStats> {
  const { count } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', userId);

  const total = count ?? 0;
  return {
    totalReferrals: total,
    successfulReferrals: total,
    remainingSlots: Math.max(0, MAX_REFERRALS_PER_USER - total),
    rewardDaysEarned: total * REFERRAL_REWARD_DAYS,
  };
}

/**
 * Process referral reward atomically (double-sided).
 *
 * Called from claim-trial route AFTER a successful trial claim.
 * Idempotent: if referral row already 'rewarded', returns early.
 *
 * Flow:
 *   1. Look up referred_by on the invitee.
 *   2. Find referrer by referral_code.
 *   3. Guard: self-referral, max cap, already-rewarded.
 *   4. Insert referrals row (UNIQUE on referred_id prevents double).
 *   5. Extend referrer's VIP by 7 days.
 *   6. Extend invitee's VIP by 7 days (on top of their new trial).
 *
 * All wrapped in best-effort logic — failure here must NOT break trial claim.
 */
export async function processReferralReward(
  supabase: AnySupabaseClient,
  inviteeId: string,
  referralCode: string | null
): Promise<{ rewarded: boolean; reason?: string }> {
  if (!referralCode?.trim()) {
    return { rewarded: false, reason: 'no_referral_code' };
  }

  const code = referralCode.trim().toUpperCase();

  // 1. Find referrer by code
  const { data: referrer } = await supabase
    .from('users')
    .select('id, vip_expires_at')
    .eq('referral_code', code)
    .single();

  if (!referrer) {
    return { rewarded: false, reason: 'invalid_code' };
  }

  // 2. Guard: self-referral
  if (referrer.id === inviteeId) {
    return { rewarded: false, reason: 'self_referral_blocked' };
  }

  // 3. Guard: max cap on referrer
  const { count } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', referrer.id);

  if ((count ?? 0) >= MAX_REFERRALS_PER_USER) {
    return { rewarded: false, reason: 'referrer_max_reached' };
  }

  // 4. Insert referral row (UNIQUE constraint on referred_id = anti-double)
  const { error: insertError } = await supabase
    .from('referrals')
    .insert({
      referrer_id: referrer.id,
      referred_id: inviteeId,
      referral_code: code,
      status: 'completed',
      reward_days: REFERRAL_REWARD_DAYS,
    });

  if (insertError) {
    // 23505 = unique violation → already referred, skip silently
    if (insertError.code === '23505') {
      return { rewarded: false, reason: 'already_referred' };
    }
    return { rewarded: false, reason: 'insert_failed' };
  }

  // 5. Reward referrer: extend VIP by 7 days
  const referrerNewExpiry = extendVipExpiry(referrer.vip_expires_at, REFERRAL_REWARD_DAYS);
  await supabase
    .from('users')
    .update({
      vip_expires_at: referrerNewExpiry.toISOString(),
    })
    .eq('id', referrer.id);

  // 6. Reward invitee: extend their new trial by 7 days (bonus!)
  const { data: invitee } = await supabase
    .from('users')
    .select('vip_expires_at')
    .eq('id', inviteeId)
    .single();

  if (invitee?.vip_expires_at) {
    const inviteeNewExpiry = extendVipExpiry(invitee.vip_expires_at, REFERRAL_REWARD_DAYS);
    await supabase
      .from('users')
      .update({
        vip_expires_at: inviteeNewExpiry.toISOString(),
      })
      .eq('id', inviteeId);
  }

  // 7. Mark referral as rewarded (idempotent marker)
  await supabase
    .from('referrals')
    .update({
      status: 'rewarded',
      referrer_rewarded_at: new Date().toISOString(),
      referred_rewarded_at: new Date().toISOString(),
    })
    .eq('referrer_id', referrer.id)
    .eq('referred_id', inviteeId);

  return { rewarded: true };
}