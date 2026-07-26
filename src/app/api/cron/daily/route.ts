import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * GET /api/cron/daily
 *
 * Daily cron job (1 AM) — the ONLY cron allowed on Vercel Hobby plan.
 * Handles all maintenance tasks in a single run.
 *
 * Executes sequentially:
 *   1. Revalidate homepage & search cache
 *   2. Expire subscriptions & clear VIP status
 *   3. Import-advance (continue running import jobs)
 *   4. Auto-import new manga from sitemaps
 *   5. Check new chapters & notify users
 *   6. Send VIP/Trial expiry reminder emails (H-3, via Resend)
 *
 * For more frequent auto-import/check-chapters (every 6h), set up an
 * external cron (e.g. cron-job.org, GitHub Actions) that hits:
 *   GET /api/cron/frequent  with header: Authorization: Bearer <CRON_SECRET>
 *
 * Each task is wrapped in try/catch so one failure doesn't kill the rest.
 * Auth: Authorization: Bearer CRON_SECRET
 */

export const maxDuration = 300; // 5 min — auto-import scraping needs time

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;

  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, { ok: boolean; data?: unknown; error?: string }> = {};

  // --- Task 1: Revalidate cache -------------------------------------------
  try {
    revalidatePath('/');
    revalidatePath('/search');
    revalidatePath('/genre');
    results.revalidate = { ok: true, data: { revalidated: true } };
  } catch (err) {
    results.revalidate = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // --- Task 2: Expire subscriptions ---------------------------------------
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { data: expiredSubs } = await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    const { data: activeSubUsers } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString());

    const protectedUserIds = (activeSubUsers ?? []).map((r: { user_id: string }) => r.user_id);

    let clearQuery = supabase
      .from('users')
      .update({ vip_expires_at: null })
      .lt('vip_expires_at', new Date().toISOString());

    if (protectedUserIds.length > 0) {
      clearQuery = clearQuery.not('id', 'in', `(${protectedUserIds.join(',')})`);
    }

    const { data: clearedUsers } = await clearQuery.select('id');

    results.expireSubscriptions = {
      ok: true,
      data: {
        expiredSubscriptions: expiredSubs?.length ?? 0,
        clearedVipUsers: clearedUsers?.length ?? 0,
      },
    };
  } catch (err) {
    results.expireSubscriptions = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // --- Task 3: Import-advance (continue running jobs) ---------------------
  try {
    const importAdvanceUrl = new URL('/api/cron/import-advance', req.nextUrl.origin);
    const importRes = await fetch(importAdvanceUrl, {
      headers: { authorization: `Bearer ${expected}` },
      signal: AbortSignal.timeout(60_000), // 1 min timeout
    });
    results.importAdvance = {
      ok: importRes.ok,
      data: await importRes.json().catch(() => ({})),
    };
  } catch (err) {
    results.importAdvance = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // --- Task 4: Auto-import (check sitemaps for new manga) -----------------
  try {
    const autoImportUrl = new URL('/api/cron/auto-import', req.nextUrl.origin);
    const autoImportRes = await fetch(autoImportUrl, {
      headers: { authorization: `Bearer ${expected}` },
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });
    results.autoImport = {
      ok: autoImportRes.ok,
      data: await autoImportRes.json().catch(() => ({})),
    };
  } catch (err) {
    results.autoImport = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // --- Task 5: Check new chapters & notify --------------------------------
  try {
    const checkChaptersUrl = new URL('/api/cron/check-new-chapters', req.nextUrl.origin);
    const checkRes = await fetch(checkChaptersUrl, {
      headers: { authorization: `Bearer ${expected}` },
      signal: AbortSignal.timeout(120_000),
    });
    results.checkNewChapters = {
      ok: checkRes.ok,
      data: await checkRes.json().catch(() => ({})),
    };
  } catch (err) {
    results.checkNewChapters = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // --- Task 6: VIP/Trial expiry reminder emails (Resend, H-3) -------------
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { sendVipReminders } = await import('@/lib/email/send-vip-reminders');
    const emailResult = await sendVipReminders(supabase);
    results.emailReminders = { ok: true, data: emailResult };
  } catch (err) {
    results.emailReminders = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const elapsed = Date.now() - startTime;
  const allOk = Object.values(results).every(r => r.ok);

  return NextResponse.json(
    {
      ok: allOk,
      elapsedMs: elapsed,
      timestamp: new Date().toISOString(),
      results,
    },
    { status: allOk ? 200 : 207 },
  );
}