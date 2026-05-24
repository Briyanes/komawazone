import { detectMangaSource } from './detector';

type MangaType   = 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
type MangaStatus = 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';

export interface ScrapedManga {
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
  const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i)
    ?? html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
  const cover_url = (wpPostImg ? wpPostImg[1] : '')
    || getMeta(html, 'property', 'og:image')
    || getMeta(html, 'name', 'twitter:image');

  // Genres from rel="tag" links
  const genreMatches = html.matchAll(/rel="tag">([^<]+)<\/a>/g);
  const genres = Array.from(genreMatches, m => m[1].trim()).filter(Boolean);

  // Author / Artist from div.imptdt blocks
  const author = imptdt(html, 'Author');
  const artist = imptdt(html, 'Artist');

  // Status from div.imptdt
  const statusRaw = imptdt(html, 'Status').toUpperCase();
  const statusMap: Record<string, MangaStatus> = {
    ONGOING: 'ONGOING', ACTIVE: 'ONGOING', PUBLISHING: 'ONGOING',
    COMPLETED: 'COMPLETED', FINISHED: 'COMPLETED', END: 'COMPLETED',
    HIATUS: 'HIATUS',
    DROPPED: 'DROPPED', CANCELLED: 'DROPPED', CANCELED: 'DROPPED',
  };
  const status: MangaStatus = statusMap[statusRaw] ?? 'ONGOING';

  // Type from div.imptdt
  const typeRaw = imptdt(html, 'Type').toUpperCase();
  const typeMap: Record<string, MangaType> = {
    MANGA: 'MANGA', MANHWA: 'MANHWA', MANHUA: 'MANHUA', WEBTOON: 'WEBTOON',
  };
  const type: MangaType = typeMap[typeRaw] ?? 'MANHWA';

  return { title, description, cover_url, genres, author, artist, type, status };
}

/**
 * Scrape manga metadata from URL
 * Can be called directly from other functions without HTTP overhead
 */
export async function scrapeMangaFromUrl(url: string): Promise<ScrapedManga> {
  const parsedUrl = new URL(url);

  // Detect source
  const source = detectMangaSource(url);
  if (!source) {
    throw new Error('Domain tidak didukung');
  }

  console.log('Scraping:', url, 'Source:', source.name);

  // Fetch with browser-like headers to avoid blocking
  const res = await fetch(parsedUrl.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
      'Referer': 'https://04x.manhwaland.land/',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();
  const scraped = parseManhwalandManga(html);

  if (!scraped.title) {
    throw new Error('Tidak dapat mengekstrak judul. Pastikan URL adalah halaman manga');
  }

  // Override type with detected type from source
  if (source && !scraped.type) {
    scraped.type = source.type;
  }

  return scraped;
}
