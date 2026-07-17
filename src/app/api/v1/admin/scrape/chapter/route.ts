import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectMangaSource } from '@/lib/scrapers/detector';
import { SCRAPER_HEADERS, parseChapterImages, validateScraperUrl } from '@/lib/scrapers/scraper-utils';

import { createServiceClient } from '@/lib/supabase/service';
async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await serviceClient
    .from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as { url?: string };
  const { url } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL diperlukan' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    // SSRF check — validates protocol + internal IP + allowlisted domains
    const ssrfError = validateScraperUrl(url);
    if (ssrfError) {
      return NextResponse.json({ error: ssrfError }, { status: 400 });
    }
    parsedUrl = new URL(url);

    // Detect source
    const source = detectMangaSource(url);
    console.log('Chapter source detected:', source?.name, 'Type:', source?.type);

  } catch {
    return NextResponse.json({ error: 'URL tidak valid' }, { status: 400 });
  }

  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: SCRAPER_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gagal mengambil halaman: HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const images = parseChapterImages(html);

    if (!images.length) {
      return NextResponse.json(
        { error: 'Tidak ada gambar ditemukan. Pastikan URL adalah halaman baca chapter (contoh: https://04x.manhwaland.land/prison-revenge-chapter-1/)' },
        { status: 422 },
      );
    }

    // Extract chapter number from URL pattern: /manga-slug-chapter-72/
    const chapterNumMatch = parsedUrl.pathname.match(/chapter[-_](\d+(?:\.\d+)?)/i);
    const chapterNumber = chapterNumMatch ? parseFloat(chapterNumMatch[1]) : undefined;

    return NextResponse.json({
      data: {
        images: images.map((imgUrl, i) => ({ number: i + 1, image_url: imgUrl })),
        count: images.length,
        meta: { number: chapterNumber },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scrape gagal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
