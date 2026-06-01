/**
 * Sitemap Import — Chunked Processing Library
 * ─────────────────────────────────────────────
 * Memproses import sitemap dalam chunk kecil (CHUNK_SIZE item per invokasi)
 * agar tidak melebihi batas 300 detik Vercel. Setiap chunk selesai,
 * otomatis trigger /resume untuk melanjutkan chunk berikutnya.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { parseAllSitemaps } from '@/lib/scrapers/sitemap-parser';
import { downloadAndUploadToR2, isR2Url } from '@/lib/storage/r2';

/** Jumlah manga per chunk — aman untuk batas 5 menit Vercel */
export const IMPORT_CHUNK_SIZE = 40;

export interface ImportChunkOptions {
  importNew: boolean;
  importUpdates: boolean;
  batchSize: number;
  userId: string;
  sourceId: string | null;
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Proses satu chunk import. Dipanggil dari `after()` di route sitemap dan resume.
 * Jika masih ada item tersisa setelah chunk ini, otomatis POST ke /resume.
 */
export async function processImportChunk(
  jobId: string,
  sitemapUrls: string[],
  options: ImportChunkOptions,
  offset: number,
): Promise<void> {
  const supabase = createAdminClient();

  // Cek apakah job sudah dibatalkan
  const { data: job } = await supabase
    .from('import_jobs')
    .select('status, new_manga, updated_manga, skipped_items')
    .eq('id', jobId)
    .single();

  if (!job || job.status === 'cancelled' || job.status === 'failed') {
    console.log(`[Job ${jobId}] Status=${job?.status ?? 'not found'} — berhenti di offset ${offset}`);
    return;
  }

  // Bawa akumulasi count dari DB agar tidak reset tiap chunk
  let newCount = (job.new_manga as number) ?? 0;
  let updatedCount = (job.updated_manga as number) ?? 0;
  let skippedCount = (job.skipped_items as number) ?? 0;
  const errors: Array<{ url: string; error: string }> = [];

  try {
    console.log(`[Job ${jobId}] Chunk offset=${offset}, parsing ${sitemapUrls.length} sitemaps...`);
    const parseResult = await parseAllSitemaps(sitemapUrls, {
      timeout: 15_000,
      includeLastmod: true,
    });

    const allManga = parseResult.mangas;
    const total = allManga.length;

    // Update total_items (idempotent — boleh diset berkali-kali dengan nilai sama)
    await supabase.from('import_jobs').update({ total_items: total }).eq('id', jobId);

    // Slice chunk
    const chunk = allManga.slice(offset, offset + IMPORT_CHUNK_SIZE);
    console.log(`[Job ${jobId}] Chunk size=${chunk.length} (${offset}..${offset + chunk.length - 1} dari ${total})`);

    if (chunk.length === 0) {
      await completeJob(jobId, newCount, updatedCount, skippedCount, errors);
      return;
    }

    // Proses dalam batch kecil
    for (let i = 0; i < chunk.length; i += options.batchSize) {
      // Cek cancel setiap beberapa batch
      if (i > 0 && i % (options.batchSize * 4) === 0) {
        const { data: s } = await supabase
          .from('import_jobs').select('status').eq('id', jobId).single();
        if (s?.status === 'cancelled') {
          console.log(`[Job ${jobId}] Dibatalkan saat offset=${offset + i}`);
          return;
        }
      }

      const batch = chunk.slice(i, i + options.batchSize);
      const results = await Promise.allSettled(
        batch.map(manga => scrapeAndProcessItem(manga.url, manga.lastModified ?? null, options)),
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value === 'new') newCount++;
          else if (r.value === 'updated') updatedCount++;
          else skippedCount++;
        } else {
          errors.push({ url: '?', error: r.reason?.message ?? 'Unknown' });
        }
      }

      // Update progress di DB
      const processed = offset + i + batch.length;
      await supabase.from('import_jobs').update({
        processed_items: processed,
        new_manga: newCount,
        updated_manga: updatedCount,
        skipped_items: skippedCount,
      }).eq('id', jobId);

      // Delay antar batch (hindari rate-limit CDN/scrape target)
      if (i + options.batchSize < chunk.length) {
        await delay(1500 + Math.random() * 2000);
      }
    }

    // Cek apakah masih ada chunk berikutnya
    const nextOffset = offset + IMPORT_CHUNK_SIZE;
    if (nextOffset < total) {
      await triggerResume(jobId, sitemapUrls, options, nextOffset);
    } else {
      await completeJob(jobId, newCount, updatedCount, skippedCount, errors);
      console.log(`[Job ${jobId}] Selesai: ${newCount} baru, ${updatedCount} diupdate, ${skippedCount} dilewati`);
    }

  } catch (error) {
    console.error(`[Job ${jobId}] Fatal error di chunk offset=${offset}:`, error);
    await supabase.from('import_jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      errors: [...errors, { error: error instanceof Error ? error.message : 'Unknown error' }],
    }).eq('id', jobId);
  }
}

// ── Per-item scrape & save ────────────────────────────────────────────────────

async function scrapeAndProcessItem(
  url: string,
  lastModified: string | null,
  options: ImportChunkOptions,
): Promise<'new' | 'updated' | 'skipped'> {
  const supabase = createAdminClient();
  const slug = extractSlugFromUrl(url);

  // Cek apakah manga sudah ada
  const { data: existing } = await supabase
    .from('manga')
    .select('id, updated_at')
    .or(`slug.eq.${slug},source_url.eq.${url}`)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existing) {
    if (!options.importNew) return 'skipped';
    const result = await createManga(url, options);
    return result ? 'new' : 'skipped';
  } else {
    if (!options.importUpdates) return 'skipped';
    if (lastModified && new Date(lastModified) <= new Date(existing.updated_at as string)) {
      return 'skipped';
    }
    const result = await updateManga(url, existing.id as string);
    return result ? 'updated' : 'skipped';
  }
}

async function createManga(url: string, options: ImportChunkOptions): Promise<boolean> {
  const supabase = createAdminClient();

  try {
    const { scrapeMangaFromUrl } = await import('@/lib/scrapers/manga-scraper');
    const scraped = await scrapeMangaFromUrl(url);
    if (!scraped?.title) return false;

    let finalCoverUrl = scraped.cover_url;
    if (scraped.cover_url && !isR2Url(scraped.cover_url)) {
      const r2 = await downloadAndUploadToR2(scraped.cover_url, 'covers', scraped.title);
      if (r2.key) finalCoverUrl = r2.url;
    }

    const slug = extractSlugFromUrl(url);
    const { data } = await (supabase.from('manga') as unknown as {
      upsert: (v: Record<string, unknown>, o: { onConflict: string; ignoreDuplicates: boolean }) => {
        select: () => { single: () => Promise<{ data: unknown }> };
      };
    }).upsert({
      slug,
      title: scraped.title,
      description: scraped.description,
      cover_url: finalCoverUrl,
      type: (scraped.type || 'MANHWA') as string,
      status: (scraped.status || 'ONGOING') as string,
      author: scraped.author,
      artist: scraped.artist,
      genres: scraped.genres || [],
      source_url: url,
      source_id: options.sourceId ?? null,
      uploaded_by: options.userId,
    }, { onConflict: 'slug', ignoreDuplicates: true }).select().single();

    return Boolean(data);
  } catch (err) {
    console.error('[createManga] Error:', url, err);
    return false;
  }
}

async function updateManga(url: string, mangaId: string): Promise<boolean> {
  const supabase = createAdminClient();

  try {
    const { scrapeMangaFromUrl } = await import('@/lib/scrapers/manga-scraper');
    const scraped = await scrapeMangaFromUrl(url);
    if (!scraped) return false;

    let finalCoverUrl = scraped.cover_url;
    if (scraped.cover_url && !isR2Url(scraped.cover_url)) {
      const r2 = await downloadAndUploadToR2(scraped.cover_url, 'covers', scraped.title);
      if (r2.key) finalCoverUrl = r2.url;
    }

    const { data } = await supabase.from('manga').update({
      description: scraped.description,
      cover_url: finalCoverUrl,
      status: scraped.status,
      genres: scraped.genres,
      source_url: url,
    }).eq('id', mangaId).select().single();

    return Boolean(data);
  } catch (err) {
    console.error('[updateManga] Error:', url, err);
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function triggerResume(
  jobId: string,
  sitemapUrls: string[],
  options: ImportChunkOptions,
  nextOffset: number,
): Promise<void> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(`[Job ${jobId}] CRON_SECRET tidak di-set — auto-resume tidak bisa berjalan!`);
    const supabase = createAdminClient();
    await supabase.from('import_jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      errors: [{ error: 'CRON_SECRET tidak di-set, auto-resume gagal' }],
    }).eq('id', jobId);
    return;
  }

  console.log(`[Job ${jobId}] Trigger resume offset=${nextOffset}...`);
  try {
    const res = await fetch(`${siteUrl}/api/v1/admin/scrape/sitemap/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ jobId, sitemapUrls, options, offset: nextOffset }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[Job ${jobId}] Resume request gagal: ${res.status} — ${text}`);
    }
  } catch (err) {
    console.error(`[Job ${jobId}] Gagal trigger resume:`, err);
  }
}

async function completeJob(
  jobId: string,
  newManga: number,
  updatedManga: number,
  skipped: number,
  errors: Array<{ url?: string; error: string }>,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('import_jobs').update({
    status: 'completed',
    processed_items: newManga + updatedManga + skipped,
    new_manga: newManga,
    updated_manga: updatedManga,
    skipped_items: skipped,
    errors: errors.slice(0, 100),
    completed_at: new Date().toISOString(),
  }).eq('id', jobId);
}

export function extractSlugFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const slug = parts[parts.length - 1];
    return slug
      .replace(/^manga-/, '')
      .replace(/-chapter-\d+$/, '')
      .replace(/_/g, '-');
  } catch {
    return '';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
