/**
 * Daily VIP/Trial reminder batch sender.
 *
 * Called from the daily cron. Queries users whose vip_expires_at
 * falls within the next 3 days window, dedups against email_log
 * (24h cooldown), and sends the appropriate reminder email.
 *
 * Safety:
 *  - Only emails users with email_consent = true
 *  - Skips when RESEND_API_KEY absent (returns early, no error)
 *  - Caps at MAX_BATCH_PER_RUN to fit Vercel 300s timeout
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, alreadySentToday, EMAIL_ENABLED } from './resend';
import { trialExpiringEmail, vipExpiringEmail } from './templates';
import { formatExpiryId } from '@/lib/vip';

type AnySupabaseClient = SupabaseClient;

/** Send reminder H-3 days before expiry */
const REMINDER_WINDOW_DAYS = 3;
/** Hard cap to avoid Vercel function timeout */
const MAX_BATCH_PER_RUN = 50;

export interface ReminderBatchResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  disabled: boolean;
}

interface UserExpiryRow {
  id: string;
  email: string | null;
  username: string | null;
  vip_expires_at: string | null;
  trial_claimed_at: string | null;
  email_consent: boolean | null;
}

export async function sendVipReminders(
  supabase: AnySupabaseClient
): Promise<ReminderBatchResult> {
  // Early exit: no API key → skip silently
  if (!EMAIL_ENABLED) {
    return { scanned: 0, sent: 0, skipped: 0, failed: 0, disabled: true };
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Query: VIP active, expiring within 3 days, opted-in to email
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, username, vip_expires_at, trial_claimed_at, email_consent')
    .not('vip_expires_at', 'is', null)
    .gt('vip_expires_at', now.toISOString())        // still active
    .lte('vip_expires_at', horizon.toISOString())   // expiring soon
    .eq('email_consent', true)
    .limit(MAX_BATCH_PER_RUN);

  if (error) {
    console.error('[email/reminders] query failed:', error.message);
    return { scanned: 0, sent: 0, skipped: 0, failed: 0, disabled: false };
  }

  const rows = (users ?? []) as UserExpiryRow[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of rows) {
    // Require an email address
    if (!u.email) {
      skipped++;
      continue;
    }

    // Trial user? (claimed trial and no other subscription) → trial template
    const isTrialUser = !!u.trial_claimed_at;
    const emailType = isTrialUser ? 'trial_expiring' : 'vip_expiring' as const;

    // Dedup: skip if already sent this type today
    const duped = await alreadySentToday(supabase, u.id, emailType);
    if (duped) {
      skipped++;
      continue;
    }

    const expiryStr = u.vip_expires_at ? formatExpiryId(u.vip_expires_at) : undefined;
    const template = isTrialUser
      ? trialExpiringEmail({ recipientEmail: u.email, recipientName: u.username ?? undefined, expiryDate: expiryStr })
      : vipExpiringEmail({ recipientEmail: u.email, recipientName: u.username ?? undefined, expiryDate: expiryStr });

    const result = await sendEmail(
      {
        to: u.email,
        type: emailType,
        subject: template.subject,
        html: template.html,
        userId: u.id,
      },
      supabase
    );

    if (result.ok) sent++;
    else if (result.skipped) skipped++;
    else failed++;
  }

  console.log(`[email/reminders] scanned=${rows.length} sent=${sent} skipped=${skipped} failed=${failed}`);

  return {
    scanned: rows.length,
    sent,
    skipped,
    failed,
    disabled: false,
  };
}