import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mirrorImageToR2, mirrorImagesToR2 } from '@/lib/storage/mirror-to-r2';

export const maxDuration = 300;

/**
 * Returns true if the URL is already stored in R2 (either default endpoint
 * or custom public base URL).
 */
function isR2Url(url: string): boolean {
  if (!url) return false;
  if (url.includes('r2.cloudflarestorage.com')) return true;
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (base && url.startsWith(base + '/')) return true;
  return false;
}

/**
 * POST /api/v1/admin/storage/r2-backfill
 * Migrate existing covers/chapter images that are still on source CDN to R2.
 *
 * Body: {
 *   type: "covers" | "chapters" | "all",
 *   limit?: number  // max items per run (default: covers=200, chapters=500)
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { type?: string; limit?: number };
  const type = body.type ?? 'all';

  if (!['covers', 'chapters', 'all'].includes(type)) {
    return NextResponse.json({ error: 'type must be "covers", "chapters", or "all"' }, { status: 400 });
  }

  // Create an import_job to track progress
  const { data: job } = await supabase
    .from('import_jobs')
    .insert({
      job_type: 'r2_backfill',
      status: 'running',
      total_items: 0,
      processed_items: 0,
      new_manga: 0,
      updated_manga: 0,
      skipped_items: 0,
      errors: [],
      config: { type, limit: body.limit },
      created_by: user.id,
    })
    .select('id')
    .single();

  const jobId = job?.id as string | null;

  after(() =>
    runBackfill(jobId, type, body.limit ?? null).catch(err =>
      console.error('[R2Backfill] Fatal:', err)
    )
  );

  return NextResponse.json({
    status: 'success',
    message: `R2 backfill dimulai (type=${type})`,
    jobId,
  });
}

async function runBackfill(jobId: string | null, type: string, limitOverride: number | null) {
  const supabase = await createClient();

  let coversProcessed = 0;
  let chaptersProcessed = 0;
  let totalItems = 0;

  try {
    // ── 1. Backfill covers ───────────────────────────────────────────────
    if (type === 'covers' || type === 'all') {
      const coverLimit = limitOverride ?? 200;

      const { data: mangaRows } = await supabase
        .from('manga')
        .select('id, cover_url')
        .not('cover_url', 'is', null)
        .is('deleted_at', null)
        .limit(coverLimit * 3); // fetch more to filter client-side

      const toMigrate = (mangaRows ?? []).filter(
        m => m.cover_url && !isR2Url(m.cover_url as string)
      ).slice(0, coverLimit);

      totalItems += toMigrate.length;
      if (jobId) await supabase.from('import_jobs').update({ total_items: totalItems }).eq('id', jobId);

      console.log(`[R2Backfill] Covers to migrate: ${toMigrate.length}`);

      for (const row of toMigrate) {
        const sourceUrl = row.cover_url as string;
        try {
          const referer = (() => { try { return new URL(sourceUrl).origin + '/'; } catch { return undefined; } })();
          const r2Url = await mirrorImageToR2(sourceUrl, 'covers', referer);

          if (r2Url) {
            await supabase.from('manga').update({ cover_url: r2Url }).eq('id', row.id);
          }
          coversProcessed++;
        } catch {
          // skip individual failures
        }

        if (jobId && coversProcessed % 10 === 0) {
          await supabase.from('import_jobs')
            .update({ processed_items: coversProcessed + chaptersProcessed, updated_manga: coversProcessed })
            .eq('id', jobId);
        }

        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      }
    }

    // ── 2. Backfill chapter images ────────────────────────────────────────
    if (type === 'chapters' || type === 'all') {
      const chapterLimit = limitOverride ?? 500;

      const { data: imageRows } = await supabase
        .from('chapter_images')
        .select('id, image_url, chapter_id')
        .limit(chapterLimit * 3);

      const toMigrate = (imageRows ?? []).filter(
        r => r.image_url && !isR2Url(r.image_url as string)
      ).slice(0, chapterLimit);

      totalItems += toMigrate.length;
      if (jobId) await supabase.from('import_jobs').update({ total_items: totalItems }).eq('id', jobId);

      console.log(`[R2Backfill] Chapter images to migrate: ${toMigrate.length}`);

      // Group by chapter_id for batch processing (5 at a time)
      const grouped = new Map<string, Array<{ id: string; image_url: string }>>();
      for (const row of toMigrate) {
        const cid = row.chapter_id as string;
        if (!grouped.has(cid)) grouped.set(cid, []);
        grouped.get(cid)!.push({ id: row.id as string, image_url: row.image_url as string });
      }

      for (const [, images] of grouped.entries()) {
        const urls = images.map(i => i.image_url);
        const referer = (() => { try { return new URL(urls[0]).origin + '/'; } catch { return undefined; } })();
        const r2Urls = await mirrorImagesToR2(urls, 'chapters', referer, 5);

        for (let i = 0; i < images.length; i++) {
          const newUrl = r2Urls[i];
          if (newUrl && newUrl !== images[i].image_url) {
            await supabase.from('chapter_images').update({ image_url: newUrl }).eq('id', images[i].id);
          }
          chaptersProcessed++;
        }

        if (jobId && chaptersProcessed % 50 === 0) {
          await supabase.from('import_jobs')
            .update({ processed_items: coversProcessed + chaptersProcessed })
            .eq('id', jobId);
        }

        await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
      }
    }

    // ── Complete ─────────────────────────────────────────────────────────
    if (jobId) {
      await supabase.from('import_jobs').update({
        status: 'completed',
        processed_items: coversProcessed + chaptersProcessed,
        updated_manga: coversProcessed,
        skipped_items: 0,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    console.log(`[R2Backfill] Done: ${coversProcessed} covers, ${chaptersProcessed} images`);
  } catch (err) {
    console.error('[R2Backfill] Error:', err);
    if (jobId) {
      await supabase.from('import_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [{ error: err instanceof Error ? err.message : 'Unknown error' }],
      }).eq('id', jobId);
    }
  }
}
