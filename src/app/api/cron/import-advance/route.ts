import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processImportChunk, type ImportChunkOptions } from '@/lib/scrapers/sitemap-import';
import { importAllChapters } from '@/app/api/v1/admin/scrape/manga-chapters/route';

/**
 * GET /api/cron/import-advance
 *
 * Vercel Cron job (dipanggil oleh daily cron atau external cron).
 * Melanjutkan import job yang sedang berjalan.
 *
 * Mendukung 2 jenis job:
 * 1. sitemap_import  → processImportChunk() (batch sitemap)
 * 2. scrape_manga_chapters → importAllChapters() (single manga)
 *
 * Auth: Authorization: Bearer CRON_SECRET
 */

export const maxDuration = 60;

const MAX_INVOCATION_MS = 50_000;
const MAX_ITERATIONS = 10;

const DEFAULT_OPTIONS: ImportChunkOptions = {
  importNew: true,
  importUpdates: true,
  batchSize: 3,
  userId: '',
  sourceId: null,
  contentRating: 'general',
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as unknown as { from: (table: string) => any };

  // Cleanup zombie jobs first (running > 1 hour)
  await supabase
    .from('import_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: 'Auto-cleanup: timed out (>1 hour)',
    })
    .eq('status', 'running')
    .lt('started_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  // Ambil job RUNNING tertua
  const { data: jobs } = await supabase
    .from('import_jobs')
    .select('id, job_type, processed_items, total_items, status, config, started_at')
    .eq('status', 'running')
    .order('started_at', { ascending: true })
    .limit(1);

  if (!jobs?.length) {
    return NextResponse.json({ status: 'no_jobs' });
  }

  const job = jobs[0];
  const jobType = job.job_type as string;

  console.log(`[CronAdvance] Job ${job.id} type=${jobType} — ${job.processed_items}/${job.total_items}`);

  // === Handle scrape_manga_chapters ===
  if (jobType === 'scrape_manga_chapters') {
    const config = (job.config as Record<string, unknown>) ?? {};
    const mangaId = config.manga_id as string;
    const slug = config.slug as string;
    const sourceUrl = config.source_url as string;
    const metadataOnly = (config.metadata_only as boolean) ?? false;

    if (!mangaId || !sourceUrl) {
      await supabase.from('import_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: 'Missing manga_id or source_url in config',
      }).eq('id', job.id);
      return NextResponse.json({ status: 'error', error: 'Invalid job config' });
    }

    // Resume with remaining time budget
    const result = await importAllChapters(mangaId, slug, sourceUrl, metadataOnly, job.id, MAX_INVOCATION_MS);

    return NextResponse.json({
      status: 'ok',
      jobId: job.id,
      jobType,
      result,
      done: result.done,
    });
  }

  // === Handle sitemap_import (default) ===
  const config = (job.config as Record<string, unknown>) ?? {};
  const savedOptions = config.options as Partial<ImportChunkOptions> | undefined;
  const options: ImportChunkOptions = {
    ...DEFAULT_OPTIONS,
    ...savedOptions,
  };

  const invocationStart = Date.now();
  let iterations = 0;
  let currentOffset = (job.processed_items as number) ?? 0;

  console.log(`[CronAdvance] Job ${job.id} — mulai dari offset ${currentOffset}`);

  while (Date.now() - invocationStart < MAX_INVOCATION_MS && iterations < MAX_ITERATIONS) {
    iterations++;
    await processImportChunk(job.id as string, [], options, currentOffset);

    const { data: updated } = await supabase
      .from('import_jobs')
      .select('processed_items, total_items, status')
      .eq('id', job.id)
      .single();

    if (!updated || updated.status !== 'running') {
      console.log(`[CronAdvance] Job ${job.id} berhenti — status=${updated?.status ?? 'unknown'}`);
      break;
    }

    const newOffset = (updated.processed_items as number) ?? 0;
    if (newOffset <= currentOffset) {
      console.warn(`[CronAdvance] Job ${job.id} tidak ada kemajuan — berhenti (offset stuck at ${currentOffset})`);
      break;
    }

    const updatedTotal = (updated.total_items as number) ?? 0;
    currentOffset = newOffset;

    if (updatedTotal > 0 && currentOffset >= updatedTotal) {
      console.log(`[CronAdvance] Job ${job.id} selesai: ${currentOffset}/${updatedTotal}`);
      break;
    }
  }

  const elapsed = Math.round((Date.now() - invocationStart) / 1000);
  console.log(`[CronAdvance] Selesai: ${iterations} chunk, offset ${currentOffset}, elapsed ${elapsed}s`);

  return NextResponse.json({
    status: 'ok',
    jobId: job.id,
    iterations,
    finalOffset: currentOffset,
    elapsedSeconds: elapsed,
  });
}