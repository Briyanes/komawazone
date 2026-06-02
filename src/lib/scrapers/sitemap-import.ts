/**
 * Sitemap Import — Chunked Processing Library
 * ─────────────────────────────────────────────
 * Memproses import sitemap dalam chunk kecil (CHUNK_SIZE item per invokasi)
 * agar tidak melebihi batas 300 detik Vercel. Setiap chunk selesai,
 * otomatis trigger /resume untuk melanjutkan chunk berikutnya.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { parseAllSitemaps, type SitemapManga } from '@/lib/scrapers/sitemap-parser';
import { downloadAndUploadToR2, isR2Url } from '@/lib/storage/r2';

/** Jumlah manga per chunk — per-invokasi cron (20 item = max ~224s untuk kasus terburuk) */
export const IMPORT_CHUNK_SIZE = 20;

export interface ImportChunkOptions {
  importNew: boolean;
  importUpdates: boolean;
  batchSize: number;
  userId: string;
  sourceId: string | null;
  /** Rating konten untuk semua manga yang diimport dari sumber ini */
  contentRating?: 'general' | 'mature';
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Proses satu chunk import. Dipanggil dari `after()` di route sitemap dan resume.
 * Jika masih ada item tersisa setelah chunk ini, otomatis POST ke /resume.
 */
export async function processImportChunk(
  jobId: string,
  sitemapUrls: string[],  // Hanya digunakan saat offset=0 untuk parse pertama kali
  options: ImportChunkOptions,
  offset: number,
): Promise<void> {
  const supabase = createAdminClient();

  // Cek status job + ambil config (termasuk cached manga URLs)
  const { data: job } = await supabase
    .from('import_jobs')
    .select('status, new_manga, updated_manga, skipped_items, config')
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
    let allManga: SitemapManga[];

    // Cek apakah sudah ada daftar URL yang di-cache dari parse pertama
    const jobConfig = job.config as Record<string, unknown> | null;
    const cachedUrls = jobConfig?.parsedMangaUrls as Array<{ url: string; lastModified: string | null }> | undefined;

    if (cachedUrls && cachedUrls.length > 0) {
      // Gunakan URL yang sudah di-parse sebelumnya — tidak perlu fetch 86+ sitemap lagi
      console.log(`[Job ${jobId}] Menggunakan ${cachedUrls.length} URL dari cache DB (offset=${offset})`);
      allManga = cachedUrls.map(item => ({
        url: item.url,
        slug: extractSlugFromUrl(item.url),
        lastModified: item.lastModified ? new Date(item.lastModified) : null,
      }));
    } else {
      // Pertama kali: parse semua sitemap, lalu simpan hasilnya ke DB
      console.log(`[Job ${jobId}] Parsing ${sitemapUrls.length} sitemaps (pertama kali)...`);
      const parseResult = await parseAllSitemaps(sitemapUrls, {
        timeout: 15_000,
        includeLastmod: true,
      });
      allManga = parseResult.mangas;

      // Cache hasil parse ke DB agar chunk berikutnya langsung pakai ini
      const urlsToCache = allManga.map(m => ({
        url: m.url,
        lastModified: m.lastModified?.toISOString() ?? null,
      }));
      await supabase.from('import_jobs').update({
        total_items: allManga.length,
        config: { ...(jobConfig ?? {}), parsedMangaUrls: urlsToCache },
      }).eq('id', jobId);
      console.log(`[Job ${jobId}] Parsed ${allManga.length} manga URLs, cache disimpan ke DB`);
    }

    const total = allManga.length;

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
        batch.map(manga => Promise.race([
          scrapeAndProcessItem(manga.url, manga.lastModified, options),
          new Promise<'skipped'>((resolve) => setTimeout(() => resolve('skipped'), 28_000)),
        ])),
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
        await delay(500 + Math.random() * 1000);
      }
    }

    // Jika tidak ada chunk berikutnya, tandai selesai.
    // Jika masih ada, /api/cron/import-advance akan melanjutkan otomatis.
    const nextOffset = offset + IMPORT_CHUNK_SIZE;
    if (nextOffset >= total) {
      await completeJob(jobId, newCount, updatedCount, skippedCount, errors);
      console.log(`[Job ${jobId}] Selesai: ${newCount} baru, ${updatedCount} diupdate, ${skippedCount} dilewati`);
    } else {
      console.log(`[Job ${jobId}] Chunk selesai — offset berikutnya ${nextOffset}/${total}, menunggu cron.`);
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
  lastModified: Date | null,
  options: ImportChunkOptions,
): Promise<'new' | 'updated' | 'skipped'> {
  const supabase = createAdminClient();
  const slug = extractSlugFromUrl(url);

  // Cek apakah manga sudah ada (match by slug atau source_url)
  const { data: existing } = await supabase
    .from('manga')
    .select('id, updated_at, cover_url')
    .or(`slug.eq.${slug},source_url.eq.${url}`)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existing) {
    if (!options.importNew) return 'skipped';
    const result = await createManga(url, options);
    return result ? 'new' : 'skipped';
  } else {
    if (!options.importUpdates) return 'skipped';

    // Paksa update jika cover null atau bukan R2 URL (cover mati / belum di-upload)
    const coverNeedsfix = !existing.cover_url || !isR2Url(existing.cover_url as string);
    if (!coverNeedsfix && lastModified && lastModified <= new Date(existing.updated_at as string)) {
      return 'skipped';
    }

    const result = await updateManga(url, existing.id as string, existing.cover_url as string | null);
    if (!result) console.warn(`[scrapeAndProcessItem] updateManga gagal: ${url}`);
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
      const r2 = await downloadAndUploadToR2(scraped.cover_url, 'covers', scraped.title, { maxRetries: 1, timeout: 12_000 });
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
      content_rating: options.contentRating ?? 'general',
    }, { onConflict: 'slug', ignoreDuplicates: true }).select().single();

    return Boolean(data);
  } catch (err) {
    console.error('[createManga] Error:', url, err);
    return false;
  }
}

async function updateManga(url: string, mangaId: string, existingCoverUrl: string | null): Promise<boolean> {
  const supabase = createAdminClient();

  try {
    const { scrapeMangaFromUrl } = await import('@/lib/scrapers/manga-scraper');
    const scraped = await scrapeMangaFromUrl(url);
    if (!scraped) {
      console.warn(`[updateManga] scrapeMangaFromUrl null: ${url}`);
      return false;
    }

    // Hanya update cover_url jika berhasil upload ke R2
    // Jangan overwrite cover yang ada dengan null atau URL mati
    let newCoverUrl: string | undefined = undefined;
    if (scraped.cover_url && !isR2Url(scraped.cover_url)) {
      const r2 = await downloadAndUploadToR2(scraped.cover_url, 'covers', scraped.title, { maxRetries: 1, timeout: 12_000 });
      if (r2.key) newCoverUrl = r2.url;
      else console.warn(`[updateManga] Gagal upload cover ke R2: ${scraped.cover_url}`);
      // Jika upload gagal: newCoverUrl = undefined → jangan update cover
    } else if (scraped.cover_url && isR2Url(scraped.cover_url)) {
      newCoverUrl = scraped.cover_url;
    }
    // Jika scraped.cover_url null: newCoverUrl = undefined → preserve existing cover

    const updateData: Record<string, unknown> = {
      description: scraped.description,
      status: scraped.status,
      genres: scraped.genres,
      source_url: url,
    };
    if (newCoverUrl !== undefined) {
      updateData.cover_url = newCoverUrl;
    } else if (!existingCoverUrl) {
      // Manga belum punya cover sama sekali, set null agar bisa diretry
      updateData.cover_url = null;
    }

    const { data } = await supabase.from('manga').update(updateData).eq('id', mangaId).select().single();

    return Boolean(data);
  } catch (err) {
    console.error('[updateManga] Error:', url, err);
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
