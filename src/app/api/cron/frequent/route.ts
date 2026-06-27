import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cron/frequent
 *
 * Runs every 6 hours — handles time-sensitive tasks that need faster
 * turnaround than the daily cron:
 *
 *   1. Auto-import (check sitemaps for new manga)
 *   2. Check new chapters & notify users
 *
 * This leverages Vercel Hobby's 2-cron limit (daily + frequent).
 * The daily cron continues to handle less urgent tasks (expire subs,
 * revalidate cache, import-advance).
 *
 * Auth: Authorization: Bearer CRON_SECRET
 */

export const maxDuration = 300; // 5 min — needed for scraping

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;

  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, { ok: boolean; data?: unknown; error?: string }> = {};

  // --- Task 1: Auto-import (check sitemaps for new manga) -------------
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

  // --- Task 2: Check new chapters & notify ----------------------------
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