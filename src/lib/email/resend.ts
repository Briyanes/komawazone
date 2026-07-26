/**
 * Resend email client — central sender with graceful fallback.
 *
 * If RESEND_API_KEY is not set, all send attempts are skipped silently
 * and logged. This lets the codebase ship before the API key is wired,
 * and prevents cron failures from cascading.
 *
 * Every send is logged to `email_log` for dedup & audit.
 */

import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabaseClient = SupabaseClient;

const apiKey = process.env.RESEND_API_KEY;
const fromEmail =
  process.env.RESEND_FROM_EMAIL ?? 'Olluq <noreply@olluq.com>';

// Lazily instantiate — avoids crashing import when key is absent
let _client: Resend | null = null;
function getClient(): Resend | null {
  if (!apiKey) return null;
  if (!_client) _client = new Resend(apiKey);
  return _client;
}

export const EMAIL_ENABLED = !!apiKey;

export type EmailType =
  | 'trial_expiring'
  | 'vip_expiring'
  | 'referral_reward'
  | 'voucher_redeemed';

interface SendEmailInput {
  to: string;
  type: EmailType;
  subject: string;
  html: string;
  userId?: string;
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  resendId?: string;
  error?: string;
}

/**
 * Send an email via Resend and log the result to email_log.
 * Returns a safe result object — never throws.
 */
export async function sendEmail(
  input: SendEmailInput,
  supabase?: AnySupabaseClient
): Promise<SendEmailResult> {
  const { to, type, subject, html, userId } = input;

  // 1) Guard: no API key configured
  if (!EMAIL_ENABLED) {
    console.warn(`[email] Skipped (no RESEND_API_KEY): ${type} → ${to}`);
    return { ok: false, skipped: true, error: 'RESEND_API_KEY not set' };
  }

  const client = getClient();
  if (!client) {
    return { ok: false, skipped: true, error: 'Client init failed' };
  }

  try {
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[email] Resend error (${type} → ${to}):`, error.message);
      if (userId && supabase) {
        await logEmail(supabase, { userId, type, recipient: to, status: 'failed', error: error.message });
      }
      return { ok: false, error: error.message };
    }

    const resendId = data?.id;

    // Log success
    if (userId && supabase) {
      await logEmail(supabase, { userId, type, recipient: to, status: 'sent', resendId });
    }

    return { ok: true, resendId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] Send exception (${type} → ${to}):`, msg);
    if (userId && supabase) {
      await logEmail(supabase, { userId, type, recipient: to, status: 'failed', error: msg });
    }
    return { ok: false, error: msg };
  }
}

interface LogEmailInput {
  userId: string;
  type: EmailType;
  recipient: string;
  status: 'sent' | 'failed' | 'skipped';
  resendId?: string;
  error?: string;
}

async function logEmail(
  supabase: AnySupabaseClient,
  input: LogEmailInput
): Promise<void> {
  try {
    await supabase.from('email_log').insert({
      user_id: input.userId,
      email_type: input.type,
      recipient: input.recipient,
      status: input.status,
      resend_id: input.resendId ?? null,
      error: input.error ?? null,
    });
  } catch (err) {
    // Log failure is non-fatal — don't shadow the email result
    console.error('[email] log insert failed:', err);
  }
}

/**
 * Check whether we already sent this email_type to this user today.
 * Used by the daily cron for dedup (24h cooldown).
 */
export async function alreadySentToday(
  supabase: AnySupabaseClient,
  userId: string,
  type: EmailType
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data } = await supabase
    .from('email_log')
    .select('id')
    .eq('user_id', userId)
    .eq('email_type', type)
    .gte('created_at', `${today}T00:00:00Z`)
    .limit(1);

  return Array.isArray(data) && data.length > 0;
}