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

type MangaType   = 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
type MangaStatus = 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';

interface ScrapedManga {
  title: string;
  description: string;
  cover_url: string;
  genres: string[];
  author: string;
  artist: string;
  type: MangaType | null;
  status: MangaStatus;
}

/** Get meta tag content by property or name attribute */
function getMeta(html: string, attr: string, val: string): string {
  const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']*)["']`, 'i'))
         ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${val}["']`, 'i'));
  return m ? m[1] : '';
}

/**
 * Read a value from manhwaland's `div.imptdt` blocks.
 * Pattern: <div class="imptdt"> Label <i>value</i> </div>
 * or:      <div class="imptdt"> Label <a ...>value</a> </div>
 */
function imptdt(html: string, label: string): string {
  const re = new RegExp(
    `<div[^>]+class="imptdt"[^>]*>\\s*${label}\\s*<(?:i|a[^>]*)>([^<]+)<\\/(?:i|a)>`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

/** Parse manga metadata from manhwaland.land (WordPress / Madara theme) HTML */
function parseManhwalandManga(html: string): ScrapedManga {
  // Title: prefer H1, fallback to <title> tag stripped of site name
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  let title = h1Match ? h1Match[1].trim() : '';
  if (!title) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    title = titleMatch ? titleMatch[1].replace(/\s*[-|]\s*ManhwaLand.*/i, '').trim() : '';
  }

  // Description from og:description meta
  const description = getMeta(html, 'property', 'og:description')
    || getMeta(html, 'name', 'description');

  // Cover: primary source is the main post image (img.wp-post-image in the thumb div)
  // This is more reliable than og:image for manhwaland and gives api-l.gmbr.pro URLs
  const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i)
    ?? html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
  const cover_url = (wpPostImg ? wpPostImg[1] : '')
    || getMeta(html, 'property', 'og:image')
    || getMeta(html, 'name', 'twitter:image');

  // Genres from rel="tag" links (WordPress tags = manga genres on this site)
  const genreMatches = html.matchAll(/rel="tag">([^<]+)<\/a>/g);
  const genres = Array.from(genreMatches, m => m[1].trim()).filter(Boolean);

  // Author / Artist from div.imptdt blocks: Author <i>Name</i>
  const author = imptdt(html, 'Author');
  const artist = imptdt(html, 'Artist');

  // Status from div.imptdt: Status <i>Ongoing</i>
  const statusRaw = imptdt(html, 'Status').toUpperCase();
  const statusMap: Record<string, MangaStatus> = {
    ONGOING: 'ONGOING', ACTIVE: 'ONGOING', PUBLISHING: 'ONGOING',
    COMPLETED: 'COMPLETED', FINISHED: 'COMPLETED', END: 'COMPLETED',
    HIATUS: 'HIATUS',
    DROPPED: 'DROPPED', CANCELLED: 'DROPPED', CANCELED: 'DROPPED',
  };
  const status: MangaStatus = statusMap[statusRaw] ?? 'ONGOING';

  // Type from div.imptdt: Type <a>Manhwa</a>
  const typeRaw = imptdt(html, 'Type').toUpperCase();
  const typeMap: Record<string, MangaType> = {
    MANGA: 'MANGA', MANHWA: 'MANHWA', MANHUA: 'MANHUA', WEBTOON: 'WEBTOON',
  };
  const type: MangaType = typeMap[typeRaw] ?? 'MANHWA';

  return { title, description, cover_url, genres, author, artist, type, status };
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

    console.log('Detected source:', source.name, 'Type:', source.type, 'Country:', source.country);

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
    const scraped = parseManhwalandManga(html);

    if (!scraped.title) {
      return NextResponse.json(
        { error: 'Tidak dapat mengekstrak judul. Pastikan URL adalah halaman manga' },
        { status: 422 },
      );
    }

    // Override type with detected type from source
    const source = detectMangaSource(url);
    if (source && !scraped.type) {
      scraped.type = source.type;
    }

    return NextResponse.json({
      data: scraped,
      source: {
        type: source?.type,
        country: source?.country,
        name: source?.name
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scrape gagal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
