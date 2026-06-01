import { NextRequest, NextResponse, after } from 'next/server';
import { processImportChunk, type ImportChunkOptions } from '@/lib/scrapers/sitemap-import';

// Sama dengan maxDuration di route sitemap — setiap chunk punya budget 300 detik
export const maxDuration = 300;

/**
 * POST /api/v1/admin/scrape/sitemap/resume
 *
 * Internal-only endpoint — dipanggil otomatis oleh processImportChunk()
 * untuk melanjutkan import ke chunk berikutnya.
 *
 * Auth: Authorization: Bearer CRON_SECRET
 *
 * Body: { jobId, sitemapUrls, options, offset }
 */
export async function POST(req: NextRequest) {
  // Verifikasi CRON_SECRET
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    jobId: string;
    options: ImportChunkOptions;
    offset: number;
    sitemapUrls?: string[];  // opsional, tidak dipakai lagi (URL di-cache di DB)
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { jobId, options, offset } = body;

  if (!jobId || offset == null) {
    return NextResponse.json({ error: 'jobId dan offset diperlukan' }, { status: 400 });
  }

  // Jalankan chunk berikutnya di background setelah response dikembalikan
  after(() =>
    processImportChunk(jobId, [], options, offset).catch(err =>
      console.error(`[Resume Job ${jobId}] Unhandled error:`, err),
    ),
  );

  return NextResponse.json({
    status: 'success',
    message: `Resume job ${jobId} dijadwalkan dari offset ${offset}`,
  });
}
