/**
 * Shared scraper utilities — headers, image extraction, URL validation.
 * All scraper modules import from here to avoid code duplication.
 */

import { detectMangaSource } from './detector';

// ─── Shared request headers ────────────────────────────────────────────────

const BASE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Build browser-like headers for a specific source URL.
 * The Referer is set dynamically based on the source domain,
 * instead of being hardcoded to manhwaland.
 */
export function buildScraperHeaders(sourceUrl?: string): HeadersInit {
  const headers: Record<string, string> = {
    'User-Agent': BASE_UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
  };

  if (sourceUrl) {
    try {
      const origin = new URL(sourceUrl).origin;
      headers['Referer'] = origin + '/';
    } catch {
      // ignore — no Referer set for invalid URLs
    }
  }

  return headers;
}

/**
 * Default headers (manhwaland fallback for backward compatibility).
 * Prefer `buildScraperHeaders(url)` for multi-source scraping.
 */
export const SCRAPER_HEADERS: HeadersInit = buildScraperHeaders('https://04x.manhwaland.land/');

// ─── SSRF / URL allowlist ──────────────────────────────────────────────────

/**
 * Validate that a URL is safe to fetch (SSRF prevention).
 * Returns an error string if invalid, or null if OK.
 */
export function validateScraperUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'URL tidak valid';
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Hanya protokol http/https yang diizinkan';
  }

  // Block internal/private addresses (SSRF protection)
  const hostname = parsed.hostname.toLowerCase();
  const blocked = [
    'localhost',
    '127.',
    '0.0.0.0',
    '::1',
    '169.254.',   // link-local
    '10.',        // RFC-1918
    '172.16.',
    '172.17.',
    '172.18.',
    '172.19.',
    '172.2',
    '172.3',
    '192.168.',
    'metadata.google.internal',
    '169.254.169.254', // AWS/GCP metadata
  ];
  if (blocked.some(b => hostname === b || hostname.startsWith(b))) {
    return 'URL mengarah ke jaringan internal — tidak diizinkan';
  }

  // Must be from a known manga source OR a known image CDN
  const ALLOWED_IMAGE_CDN_DOMAINS = [
    'gmbr.pro',        // manhwaland image CDN (api-l.gmbr.pro, img-uwak.gmbr.pro, etc.)
    'gmbar.xyz',       // alternate image CDN
    'kambingjantan.cc',
    'shinigami.asia',
    'cdntapudehay.com',
    'dotapovie.cc',
  ];

  if (!detectMangaSource(rawUrl)) {
    // Check if it's an allowed image CDN
    const isAllowedCdn = ALLOWED_IMAGE_CDN_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
    if (!isAllowedCdn) {
      return 'Domain tidak didukung. Gunakan URL dari sumber yang terdaftar.';
    }
  }

  return null;
}

// ─── Chapter image extraction ──────────────────────────────────────────────

/**
 * Extract chapter page image URLs from Madara theme HTML (manhwaland, etc).
 *
 * Strategy order:
 *  1. <noscript> tags inside #readerarea (lazy-load fallback — most reliable)
 *  2. data-src attributes (another lazy-load pattern)
 *  3. <img src> tags inside #readerarea matching chapter/manga path patterns
 */
export function parseChapterImages(html: string): string[] {
  const urls: string[] = [];

  const readerareaIdx = html.indexOf('id="readerarea"');
  const section =
    readerareaIdx !== -1
      ? html.slice(readerareaIdx, readerareaIdx + 80_000)
      : html;

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

  // Last resort: plain img src matching known CDN paths
  if (urls.length === 0) {
    const imgSrcRe = /<img[^>]+src=['"]([^'"]+)['"]/g;
    while ((m = imgSrcRe.exec(section)) !== null) {
      const u = m[1];
      if (/^https?:\/\//i.test(u) && /chapter|manga[-_.]images|upload/i.test(u)) {
        urls.push(u);
      }
    }
  }

  return urls;
}
