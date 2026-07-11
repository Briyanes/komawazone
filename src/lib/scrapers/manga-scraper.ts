import { detectMangaSource } from './detector';
import { buildScraperHeaders, parseChapterImages } from './scraper-utils';

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

/** Decode HTML entities from scraped text (e.g. &#8217; -> right-quote, &amp; -> &) */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Convert Indonesian month name to English so Date() can parse it.
 */
function normalizeIndonesianDate(raw: string): string {
  return raw
    .replace(/Januari/i,   'January')
    .replace(/Februari/i,  'February')
    .replace(/Maret/i,     'March')
    .replace(/Mei/i,       'May')
    .replace(/Juni/i,      'June')
    .replace(/Juli/i,      'July')
    .replace(/Agustus/i,   'August')
    .replace(/Oktober/i,   'October')
    .replace(/Desember/i,  'December');
}

/**
 * Parse chapter list from manhwaland.land HTML.
 *
 * Primary format (MangaReader / ts-reader theme):
 *   <div class="eplister" id="chapterlist"><ul>
 *     <a href="URL"><span class="chapternum">Chapter N</span>
 *                   <span class="chapterdate">DATE</span></a>
 *
 * Fallback (Madara wp-manga-chapter):
 *   <li class="wp-manga-chapter ..."><a href="URL">Title</a>...</li>
 */
export function parseChapterListFromHtml(html: string): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];

  // --- Primary: eplister / chapterlist format ---
  // Structure: <div id="chapterlist"><ul><li data-num="N"><div class="chbox"><div class="eph-num">
  //              <a href="URL"><span class="chapternum">Chapter N</span>
  //                            <span class="chapterdate">DATE</span></a>
  if (html.includes('id="chapterlist"') || html.includes('class="eplister"')) {
    const liRe = /<li[^>]+data-num="(\d+(?:\.\d+)?)"[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRe.exec(html)) !== null) {
      const dataNum  = parseFloat(liMatch[1]);
      const block    = liMatch[2];

      const aMatch   = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
      if (!aMatch) continue;
      const url      = aMatch[1].trim();

      const numMatch = block.match(/<span[^>]+class="chapternum"[^>]*>\s*(?:Chapter\s*)?(\d+(?:\.\d+)?)/i);
      const number   = numMatch ? parseFloat(numMatch[1]) : dataNum;

      // Always use "Chapter N" format — manhwaland often prepends manga title
      // (e.g. "Misshitsu Swimsuit Chapter 1") which looks bad in chapter lists.
      const title = `Chapter ${number}`;

      const dateRaw  = block.match(/<span[^>]+class="chapterdate"[^>]*>([^<]+)/i)?.[1]?.trim() ?? null;
      let releasedAt: string | null = null;
      if (dateRaw) {
        try { releasedAt = new Date(normalizeIndonesianDate(dateRaw)).toISOString(); } catch { /* ignore */ }
      }

      chapters.push({ number, title, url, releasedAt });
    }
    if (chapters.length > 0) return chapters.sort((a, b) => a.number - b.number);
  }

  // --- Fallback: Madara wp-manga-chapter format ---
  const liRe = /<li[^>]+class="[^"]*wp-manga-chapter[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch: RegExpExecArray | null;

  while ((liMatch = liRe.exec(html)) !== null) {
    const block = liMatch[1];

    const aMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    if (!aMatch) continue;

    const url = aMatch[1].trim();
    const rawTitle = aMatch[2].replace(/<[^>]+>/g, '').trim();

    const numFromUrl   = url.match(/chapter[-_](\d+(?:\.\d+)?)/i);
    const numFromTitle = rawTitle.match(/chapter\s*(\d+(?:\.\d+)?)/i)
                      ?? rawTitle.match(/^(\d+(?:\.\d+)?)/);
    const numStr = numFromUrl?.[1] ?? numFromTitle?.[1];
    const number = numStr ? parseFloat(numStr) : null;
    if (number === null) continue;

    const dateRaw = block.match(/<i[^>]*>([^<]+)<\/i>/i)?.[1]?.trim() ?? null;
    let releasedAt: string | null = null;
    if (dateRaw) {
      try { releasedAt = new Date(normalizeIndonesianDate(dateRaw)).toISOString(); } catch { /* ignore */ }
    }

    // Always use "Chapter N" format — avoid manga title in chapter title
    chapters.push({ number, title: `Chapter ${number}`, url, releasedAt });
  }

  return chapters.sort((a, b) => a.number - b.number);
}

/**
 * Scrape chapter images from a chapter page URL (manhwaland / Madara theme).
 */
export async function scrapeChapterImages(chapterUrl: string): Promise<string[]> {
  const res = await fetch(chapterUrl, {
    headers: buildScraperHeaders(chapterUrl),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (isBlockedPage(html)) throw new Error('Blocked by CloudFlare');

  return parseChapterImages(html);
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

/**
 * Extract a metadata value from multiple Madara theme patterns.
 * Tries (in order):
 *  1. manhwaland's div.imptdt with label (e.g. "Author", "Status")
 *  2. Madara standard .summary-content / .post-content with data-label attr
 *  3. Madara alternative: div.author-content / div.artist-content
 *  4. Generic WordPress: .manga-meta / .post-meta with label text
 */
function extractMadaraField(html: string, label: string): string {
  // 1. manhwaland pattern: <div class="imptdt"> Author <i>Name</i> </div>
  const imptdtVal = imptdt(html, label);
  if (imptdtVal) return imptdtVal;

  // 2. Madara standard: <div class="summary-content" data-label="Author">...</div>
  //    or <h5>Author</h5> <div class="summary-content">value</div>
  const summaryRe = new RegExp(
    `(?:data-label=["']${label}["'][^>]*>([^<]+)<|` +
    `<h5[^>]*>\\s*${label}\\s*</h5>[\\s\\S]{0,200}?<div[^>]+class="[^"]*summary-content[^"]*"[^>]*>([\\s\\S]*?)</div>)`,
    'i',
  );
  const summaryMatch = html.match(summaryRe);
  if (summaryMatch) {
    const val = (summaryMatch[1] || summaryMatch[2] || '').replace(/<[^>]+>/g, '').trim();
    if (val) return decodeHtmlEntities(val);
  }

  // 3. Madara alt: div.author-content / div.artist-content
  const altClassMap: Record<string, string> = {
    Author: 'author-content',
    Artist: 'artist-content',
  };
  const altClass = altClassMap[label];
  if (altClass) {
    const altRe = new RegExp(
      `<div[^>]+class="[^"]*${altClass}[^"]*"[^>]*>([\\s\\S]*?)</div>`,
      'i',
    );
    const altMatch = html.match(altRe);
    if (altMatch) {
      const val = altMatch[1].replace(/<[^>]+>/g, '').trim();
      if (val) return decodeHtmlEntities(val);
    }
  }

  // 4. Status: try .summary-content with post-status or bio-content
  if (label === 'Status') {
    const statusRe = /<div[^>]+class="[^"]*(?:post-status|summary-content|bio-content)[^"]*"[^>]*>\s*(?:<span[^>]*>)?\s*(\w+)/i;
    const statusMatch = html.match(statusRe);
    if (statusMatch) return statusMatch[1].trim();
  }

  // 5. Type: try .summary-content with type-related class
  if (label === 'Type') {
    const typeRe = /<div[^>]+class="[^"]*summary-content[^"]*"[^>]*>\s*(MANGA|MANHWA|MANHUA|WEBTOON|manga|manhwa|manhua|webtoon)/i;
    const typeMatch = html.match(typeRe);
    if (typeMatch) return typeMatch[1].trim();
  }

  return '';
}

/**
 * Generic manga metadata parser for WordPress Madara theme.
 * Works across manhwaland.land, manhwaindo.my, asuratoon.com, manhwatop.com, etc.
 * Uses progressive fallback patterns to handle structural differences.
 */
function parseMadaraManga(html: string): ScrapedManga {
  // Title: prefer H1, fallback to <title> tag stripped of site name suffix
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  let title = h1Match ? decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, '').trim()) : '';
  if (!title) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    title = titleMatch
      ? decodeHtmlEntities(titleMatch[1].replace(/\s*[-|]\s*[^|]+$/i, '').trim())
      : '';
  }

  // Description from og:description meta (decode HTML entities)
  const description = decodeHtmlEntities(
    getMeta(html, 'property', 'og:description')
    || getMeta(html, 'name', 'description')
  ).replace(/\s*…\s*$/, '…').trim();

  // Cover: primary source is the main post image (img.wp-post-image in the thumb div)
  const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i)
    ?? html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
  const cover_url = (wpPostImg ? wpPostImg[1] : '')
    || getMeta(html, 'property', 'og:image')
    || getMeta(html, 'name', 'twitter:image');

  // Genres from rel="tag" links (works across all Madara variants)
  const genreMatches = html.matchAll(/rel="tag">([^<]+)<\/a>/g);
  let genres = Array.from(genreMatches, m => decodeHtmlEntities(m[1].trim())).filter(Boolean);

  // Fallback: some Madara variants use class="manga-genre" or class="genres-content"
  if (genres.length === 0) {
    const genreContainer = html.match(/<div[^>]+class="[^"]*genres-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (genreContainer) {
      const genreLinks = genreContainer[1].matchAll(/>([^<]+)</g);
      genres = Array.from(genreLinks, m => decodeHtmlEntities(m[1].trim())).filter(g => g.length > 1 && g.length < 50);
    }
  }

  // Author / Artist — multi-pattern extraction
  const author = decodeHtmlEntities(extractMadaraField(html, 'Author'));
  const artist = decodeHtmlEntities(extractMadaraField(html, 'Artist'));

  // Status — multi-pattern extraction
  const statusRaw = extractMadaraField(html, 'Status').toUpperCase();
  const statusMap: Record<string, MangaStatus> = {
    ONGOING: 'ONGOING', ACTIVE: 'ONGOING', PUBLISHING: 'ONGOING', BERJALAN: 'ONGOING',
    COMPLETED: 'COMPLETED', FINISHED: 'COMPLETED', END: 'COMPLETED', TAMAT: 'COMPLETED',
    HIATUS: 'HIATUS',
    DROPPED: 'DROPPED', CANCELLED: 'DROPPED', CANCELED: 'DROPPED',
  };
  const status: MangaStatus = statusMap[statusRaw] ?? 'ONGOING';

  // Type — multi-pattern extraction
  const typeRaw = extractMadaraField(html, 'Type').toUpperCase();
  const typeMap: Record<string, MangaType> = {
    MANGA: 'MANGA', MANHWA: 'MANHWA', MANHUA: 'MANHUA', WEBTOON: 'WEBTOON',
  };
  const type: MangaType = typeMap[typeRaw] ?? 'MANHWA';

  return { title, description, cover_url, genres, author, artist, type, status };
}

/** Backward-compatible alias */
const parseManhwalandManga = parseMadaraManga;

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
        headers: buildScraperHeaders(url),
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
