import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * GET /api/cron/daily
 *
 * Daily cron job (1 AM) — handles low-frequency maintenance tasks.
 * Time-sensitive tasks (auto-import, check-new-chapters) are handled by
 * /api/cron/frequent which runs every 6 hours.
 *
 * Executes sequentially:
 *   1. Revalidate homepage & search cache
 *   2. Expire subscriptions & clear VIP status
 *   3. Import-advance (continue running import jobs)
 *
 * Each task is wrapped in try/catch so one failure doesn't kill the rest.
 * Auth: Authorization: Bearer CRON_SECRET
 */

export const maxDuration = 120; // 2 min — import-advance fetch is the longest task

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