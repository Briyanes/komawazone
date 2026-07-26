/**
 * Centralized VIP access helper.
 *
 * Eliminates the duplicated "is this user VIP/Admin?" logic that was
 * copy-pasted across chapter page, /vip page, and manga.ts.
 *
 * Usage (server-side only):
 *   const status = await getVipStatus(supabase);
 *   if (status.canAccessMature) { ... }
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabaseClient = SupabaseClient;

export interface VipStatus {
  /** True if there is an authenticated user. */
  isAuthenticated: boolean;
  /** The Supabase auth user id, if any. */
  userId: string | null;
  /** True for admins (role === 'ADMIN'). */
  isAdmin: boolean;
  /** True if VIP is currently active (or admin). */
  isVip: boolean;
  /** ISO timestamp when VIP expires, null if never set. */
  vipExpiresAt: string | null;
  /** Admins and active VIP users can read mature content. */
  canAccessMature: boolean;
  /** True if the user may still claim the free 1-month trial. */
  trialEligible: boolean;
  /** Timestamp when trial was claimed (null = never). */
  trialClaimedAt: string | null;
}

interface UserVipRow {
  vip_expires_at?: string | null;
  role?: string | null;
  trial_claimed_at?: string | null;
  trial_source?: string | null;
}

function isExpiryActive(exp: string | null | undefined): boolean {
  return !!exp && new Date(exp) > new Date();
}

/**
 * Read VIP status for the user attached to the given server Supabase client.
 * Returns a safe default for guests.
 */
export async function getVipStatus(
  supabase: AnySupabaseClient
): Promise<VipStatus> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      isAuthenticated: false,
      userId: null,
      isAdmin: false,
      isVip: false,
      vipExpiresAt: null,
      canAccessMature: false,
      trialEligible: false, // guests must log in before claiming
      trialClaimedAt: null,
    };
  }

  const { data } = await supabase
    .from('users')
    .select('vip_expires_at, role, trial_claimed_at, trial_source')
    .eq('id', user.id)
    .single();

  const row = (data ?? null) as UserVipRow | null;
  const isAdmin = row?.role === 'ADMIN';
  const vipExpiresAt = row?.vip_expires_at ?? null;
  const isVip = isAdmin || isExpiryActive(vipExpiresAt);
  const trialClaimedAt = row?.trial_claimed_at ?? null;

  return {
    isAuthenticated: true,
    userId: user.id,
    isAdmin,
    isVip,
    vipExpiresAt,
    canAccessMature: isVip,
    // Eligible = logged in, NOT already VIP/admin, and has never claimed.
    trialEligible: !isVip && trialClaimedAt === null,
    trialClaimedAt,
  };
}

/**
 * Trial configuration constants.
 * TRIAL_DURATION_DAYS can be overridden via env for future promos.
 */
export const TRIAL_DURATION_DAYS = Number(process.env.VIP_TRIAL_DAYS ?? 30);

/**
 * Compute the new VIP expiry when granting a trial.
 * Trial always starts from NOW (does not extend existing expiry —
 * trials are only granted to non-VIP users, enforced by getVipStatus).
 */
export function computeTrialExpiry(): Date {
  return new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Compute a human-readable expiry date in Indonesian locale.
 */
export function formatExpiryId(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}