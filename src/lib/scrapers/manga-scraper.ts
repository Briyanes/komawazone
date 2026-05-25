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

export interface ChapterEntry {
  number: number;
  title: string;
  url: string;
  releasedAt: string | null;
}

/** Get meta tag content by property or name attribute */
function getMeta(html: string, attr: string, val: string): string {
  const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']*)["']`, 'i'))
         ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${val}["']`, 'i'));
  return m ? m[1] : '';
}

/**
 * Parse chapter list from manhwaland.land (Madara theme) HTML.
 * Chapters are in <ul class="version-chap"> or <div class="eplister"> blocks.
 */
export function parseChapterListFromHtml(html: string): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];

  // Match each <li class="wp-manga-chapter ..."> block
  const liRe = /<li[^>]+class="[^"]*wp-manga-chapter[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch: RegExpExecArray | null;

  while ((liMatch = liRe.exec(html)) !== null) {
    const block = liMatch[1];

    // Extract URL and raw title from <a href="...">Title</a>
    const aMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    if (!aMatch) continue;

    const url = aMatch[1].trim();
    const rawTitle = aMatch[2].replace(/<[^>]+>/g, '').trim(); // strip inner HTML tags

    // Extract chapter number from URL or title
    const numFromUrl = url.match(/chapter[-_](\d+(?:\.\d+)?)/i);
    const numFromTitle = rawTitle.match(/chapter\s*(\d+(?:\.\d+)?)/i)
      ?? rawTitle.match(/^(\d+(?:\.\d+)?)/);
    const numStr = numFromUrl?.[1] ?? numFromTitle?.[1];
    const number = numStr ? parseFloat(numStr) : null;
    if (number === null) continue;

    // Extract release date from <i>date</i>
    const dateMatch = block.match(/<i[^>]*>([^<]+)<\/i>/i);
    const releasedAt = dateMatch ? new Date(dateMatch[1].trim()).toISOString() : null;

    chapters.push({ number, title: rawTitle, url, releasedAt });
  }

  // Sort ascending (ch 1, 2, 3…)
  return chapters.sort((a, b) => a.number - b.number);
}

/**
 * Scrape chapter images from a chapter page URL (manhwaland / Madara theme).
 * Reuses the same noscript/data-src extraction logic as the chapter API route.
 */
export async function scrapeChapterImages(chapterUrl: string): Promise<string[]> {
  const res = await fetch(chapterUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
      'Referer': 'https://04x.manhwaland.land/',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  if (isBlockedPage(html)) throw new Error('Blocked by CloudFlare');

  const urls: string[] = [];
  const readerareaIdx = html.indexOf('id="readerarea"');
  const section = readerareaIdx !== -1 ? html.slice(readerareaIdx, readerareaIdx + 80_000) : html;

  // Primary: noscript lazy-load fallback
  const noscriptRe = /<noscript>([\s\S]*?)<\/noscript>/g;
  let m: RegExpExecArray | null;
  while ((m = noscriptRe.exec(section)) !== null) {
    const srcRe = /src=['"]([^'"]+)['"]/g;
    let s: RegExpExecArray | null;
    while ((s = srcRe.exec(m[1])) !== null) {
      if (/^https?:\/\//i.test(s[1])) urls.push(s[1]);
    }
  }
  // Fallback: data-src
  if (urls.length === 0) {
    const dataSrcRe = /data-src=['"]([^'"]+)['"]/g;
    while ((m = dataSrcRe.exec(section)) !== null) {
      if (/^https?:\/\//i.test(m[1])) urls.push(m[1]);
    }
  }

  return urls;
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

/** Random delay helper */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Check if HTML is a CloudFlare/bot-detection block page */
function isBlockedPage(html: string): boolean {
  return (
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_opt') ||
    html.includes('Just a moment') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    html.includes('Checking if the site connection is secure') ||
    html.includes('DDoS protection by') ||
    html.includes('_cf_chl_tk') ||
    html.length < 2000 // Suspiciously short page = likely block page
  );
}

/**
 * Scrape manga metadata from URL with retry logic for rate-limit handling
 * Can be called directly from other functions without HTTP overhead
 */
export async function scrapeMangaFromUrl(url: string, retries = 3): Promise<ScrapedManga> {
  const parsedUrl = new URL(url);

  // Detect source
  const source = detectMangaSource(url);
  if (!source) {
    throw new Error('Domain tidak didukung');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    // Add jitter delay before each retry (not first attempt)
    if (attempt > 1) {
      const backoff = Math.min(2000 * Math.pow(2, attempt - 2), 10000); // 2s, 4s, 8s
      const jitter = Math.random() * 1000;
      console.log(`[Scraper] Retry ${attempt}/${retries} for ${url}, waiting ${backoff + jitter}ms`);
      await sleep(backoff + jitter);
    }

    try {
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
          'Cache-Control': 'no-cache',
          'Referer': 'https://04x.manhwaland.land/',
        },
        signal: AbortSignal.timeout(20_000),
      });

      // Rate-limited: wait and retry
      if (res.status === 429 || res.status === 503) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
        const wait = retryAfter > 0 ? retryAfter * 1000 : 5000;
        lastError = new Error(`HTTP ${res.status}: rate limited`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const html = await res.text();

      // Detect CloudFlare/bot block page → retry
      if (isBlockedPage(html)) {
        lastError = new Error('Halaman diblokir (CloudFlare/bot protection)');
        await sleep(3000 + Math.random() * 2000);
        continue;
      }

      const scraped = parseManhwalandManga(html);

      if (!scraped.title) {
        throw new Error('Tidak dapat mengekstrak judul. Pastikan URL adalah halaman manga');
      }

      // Override type with detected type from source
      if (source && !scraped.type) {
        scraped.type = source.type;
      }

      return scraped;

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === retries) break;
    }
  }

  throw lastError ?? new Error('Gagal scrape setelah beberapa percobaan');
}
