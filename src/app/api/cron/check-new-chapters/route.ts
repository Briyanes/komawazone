import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300;

/**
 * GET /api/cron/check-new-chapters
 * Cron job: setiap 6 jam, cek manga mana yang punya chapter baru di source vs DB.
 * Manga yang chapter-nya kurang trigger import otomatis.
 *
 * Jadwal di vercel.json: 0 per 6 jam
 * Harus ada CRON_SECRET di env.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  // Ambil manga yang punya source_url dan belum di-soft-delete
  const { data: mangaList, error } = await supabase
    .from('manga')
    .select('id, slug, title, source_url')
    .not('source_url', 'is', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: true }) // cek yang paling lama di-update duluan
    .limit(100); // batasi 100 per run agar tidak timeout

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!mangaList || mangaList.length === 0) {
    return NextResponse.json({ status: 'success', message: 'No manga with source_url found', checked: 0 });
  }

  // Jalankan pengecekan di background agar response cepat
  after(() => runChapterCheck(mangaList as Array<{ id: string; slug: string; title: string; source_url: string }>));

  return NextResponse.json({
    status: 'success',
    message: `Chapter check scheduled for ${mangaList.length} manga`,
    checked: mangaList.length,
  });
}

async function runChapterCheck(
  mangaList: Array<{ id: string; slug: string; title: string; source_url: string }>
) {
  const supabase = await createClient();
  const { parseChapterListFromHtml } = await import('@/lib/scrapers/manga-scraper');
  const { buildScraperHeaders } = await import('@/lib/scrapers/scraper-utils');
  const { importAllChapters } = await import('@/app/api/v1/admin/scrape/manga-chapters/route');

  let triggered = 0;
  let upToDate = 0;
  let failed = 0;

  for (const manga of mangaList) {
    try {
      // Ambil jumlah chapter yang sudah ada di DB
      const { count: dbCount } = await supabase
        .from('chapters')
        .select('id', { count: 'exact', head: true })
        .eq('manga_id', manga.id)
        .is('deleted_at', null);

      // Scrape chapter list dari source
      const res = await fetch(manga.source_url, {
        headers: buildScraperHeaders(manga.source_url),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        failed++;
        continue;
      }

      const html = await res.text();
      const sourceChapters = parseChapterListFromHtml(html);

      const sourceCount = sourceChapters.length;
      const localCount = dbCount ?? 0;

      if (sourceCount > localCount) {
        console.log(`[ChapterCheck] ${manga.title}: source=${sourceCount}, db=${localCount} → triggering import`);
        // importAllChapters handles its own dedup (skips existing chapter numbers)
        await importAllChapters(manga.id, manga.slug, manga.source_url);
        triggered++;
      } else {
        upToDate++;
      }

      // Delay antar manga agar tidak membanjiri source
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
    } catch (err) {
      console.error(`[ChapterCheck] Failed for ${manga.slug}:`, err);
      failed++;
    }
  }

  console.log(`[ChapterCheck] Done: ${triggered} triggered, ${upToDate} up-to-date, ${failed} failed`);
}
