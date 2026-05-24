import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectMangaSource, getSupportedDomains } from '@/lib/scrapers/detector';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

/**
 * Extract chapter image URLs from manhwaland.land (WordPress / Madara theme) HTML.
 *
 * Images are lazy-loaded via JS; the no-JS fallback is a <noscript> block inside
 * #readerarea with <img src='...'> tags — that's our reliable source.
 */
function parseManhwalandChapterImages(html: string): string[] {
  const urls: string[] = [];

  // Slice to just the #readerarea section for efficiency
  const readerareaIdx = html.indexOf('id="readerarea"');
  const section = readerareaIdx !== -1
    ? html.slice(readerareaIdx, readerareaIdx + 80_000)
    : html;

  // Primary: extract src from <noscript> tags (lazy-load fallback)
  const noscriptRe = /<noscript>([\s\S]*?)<\/noscript>/g;
  let m: RegExpExecArray | null;
  while ((m = noscriptRe.exec(section)) !== null) {
    const srcRe = /src=['"]([^'"]+)['"]/g;
    let s: RegExpExecArray | null;
    while ((s = srcRe.exec(m[1])) !== null) {
      if (/^https?:\/\//i.test(s[1])) urls.push(s[1]);
    }
  }

  // Fallback: data-src (another common lazy-load pattern)
  if (urls.length === 0) {
    const dataSrcRe = /data-src=['"]([^'"]+)['"]/g;
    while ((m = dataSrcRe.exec(section)) !== null) {
      if (/^https?:\/\//i.test(m[1])) urls.push(m[1]);
    }
  }

  // Last resort: plain <img src> inside the reader area, skip ads
  if (urls.length === 0) {
    const imgSrcRe = /<img[^>]+src=['"]([^'"]+)['"]/g;
    while ((m = imgSrcRe.exec(section)) !== null) {
      const u = m[1];
      if (/^https?:\/\//i.test(u) && /chapter|manga.images|upload/i.test(u)) {
        urls.push(u);
      }
    }
  }

  return urls;
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
    parsedUrl = new URL(url);

    // Detect source
    const source = detectMangaSource(url);

    if (!source) {
      return NextResponse.json({
        error: 'Domain tidak didukung',
        message: 'Gunakan URL dari sumber yang didukung',
        supported_domains: getSupportedDomains(),
        hint: 'Contoh: manhwaland.land (Manhwa), flmtscan.com (Manga), manhuachill.com (Manhua)'
      }, { status: 400 });
    }

    console.log('Chapter source detected:', source.name, 'Type:', source.type, 'Country:', source.country);

  } catch {
    return NextResponse.json({ error: 'URL tidak valid' }, { status: 400 });
  }

  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://04x.manhwaland.land/',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gagal mengambil halaman: HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const images = parseManhwalandChapterImages(html);

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
