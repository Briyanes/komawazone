import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processImportChunk, type ImportChunkOptions } from '@/lib/scrapers/sitemap-import';

/**
 * GET /api/cron/import-advance
 *
 * Vercel Cron job (setiap 5 menit: "star/5 star star star star" — perlu Vercel Pro).
 * Melanjutkan import job yang sedang berjalan. Menggantikan mekanisme
 * triggerResume / after() yang tidak reliabel.
 *
 * Auth: Authorization: Bearer CRON_SECRET
 *
 * Per invokasi: proses hingga 10 chunk × IMPORT_CHUNK_SIZE item,
 * atau hingga 45 detik, mana yang lebih dulu.
 */

// Vercel Hobby: max 60 detik per function invocation
export const maxDuration = 60;

// Hentikan loop sebelum Vercel memaksa berhenti (gunakan 45s dari 60s budget)
const MAX_INVOCATION_MS = 45_000;
// Safety cap: jangan proses lebih dari N chunk dalam satu cron run
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

  const supabase = createAdminClient();

  // Ambil job RUNNING tertua (proses satu job per invokasi)
  const { data: jobs } = await supabase
    .from('import_jobs')
    .select('id, processed_items, total_items, config')
    .eq('status', 'running')
    .order('started_at', { ascending: true })
    .limit(1);

  if (!jobs?.length) {
    return NextResponse.json({ status: 'no_jobs' });
  }

  const job = jobs[0];
  const config = (job.config as Record<string, unknown>) ?? {};

  // Baca options dari config (disimpan saat job dibuat)
  const savedOptions = config.options as Partial<ImportChunkOptions> | undefined;
  const options: ImportChunkOptions = {
    ...DEFAULT_OPTIONS,
    ...savedOptions,
  };

  const invocationStart = Date.now();
  let iterations = 0;
  let currentOffset = (job.processed_items as number) ?? 0;

  console.log(`[CronAdvance] Job ${job.id as string} — mulai dari offset ${currentOffset}`);

  while (Date.now() - invocationStart < MAX_INVOCATION_MS && iterations < MAX_ITERATIONS) {
    iterations++;
    await processImportChunk(job.id as string, [], options, currentOffset);

    // Baca state terbaru dari DB
    const { data: updated } = await supabase
      .from('import_jobs')
      .select('processed_items, total_items, status')
      .eq('id', job.id)
      .single();

    if (!updated || updated.status !== 'running') {
      console.log(`[CronAdvance] Job ${job.id as string} berhenti — status=${updated?.status ?? 'unknown'}`);
      break;
    }

    const newOffset = (updated.processed_items as number) ?? 0;
    if (newOffset <= currentOffset) {
      console.warn(`[CronAdvance] Job ${job.id as string} tidak ada kemajuan — berhenti (offset stuck at ${currentOffset})`);
      break;
    }

    const updatedTotal = (updated.total_items as number) ?? 0;
    currentOffset = newOffset;

    if (updatedTotal > 0 && currentOffset >= updatedTotal) {
      console.log(`[CronAdvance] Job ${job.id as string} selesai: ${currentOffset}/${updatedTotal}`);
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
