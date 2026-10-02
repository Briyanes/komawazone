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
 * Atribut width/height eksplisit di bawah ambang ini menandai iklan/banner
 * (mis. 400×25 "BANDAR36", 728×90 leaderboard) yang menyamar jadi halaman
 * (alt="Page 1"). Halaman manga asli hampir selalu ≥600px di kedua sisi.
 */
const MIN_DECLARED_SIDE = 400;

function isTinyImgTag(tag: string): boolean {
  const w = tag.match(/\swidth\s*=\s*["'](\d{1,5})["']/i);
  const h = tag.match(/\sheight\s*=\s*["'](\d{1,5})["']/i);
  if (w && Number(w[1]) < MIN_DECLARED_SIDE) return true;
  if (h && Number(h[1]) < MIN_DECLARED_SIDE) return true;
  return false;
}

/**
 * Extract chapter page image URLs from Madara theme HTML (manhwaland, etc).
 *
 * Strategy order:
 *  1. <noscript> tags inside #readerarea (lazy-load fallback — most reliable)
 *  2. data-src attributes (another lazy-load pattern)
 *  3. <img src> tags inside #readerarea matching chapter/manga path patterns
 *
 * Images yang mendeklarasikan ukuran kecil (width/height attr < 400px)
 * dibuang — itu iklan/banner, bukan halaman manga.
 */
export function parseChapterImages(html: string): string[] {
  const readerareaIdx = html.indexOf('id="readerarea"');
  const section =
    readerareaIdx !== -1
      ? html.slice(readerareaIdx, readerareaIdx + 80_000)
      : html;

  // Kumpulkan URL dari semua <img> di fragment (skip yang deklarasinya kecil)
  const collect = (fragment: string, attr: 'src' | 'data-src'): string[] => {
    const out: string[] = [];
    const imgTagRe = /<img\b[^>]*>/gi;
    let t: RegExpExecArray | null;
    while ((t = imgTagRe.exec(fragment)) !== null) {
      if (isTinyImgTag(t[0])) continue;
      const am = t[0].match(
        attr === 'src' ? /\ssrc\s*=\s*["']([^"']+)["']/i : /\sdata-src\s*=\s*["']([^"']+)["']/i,
      );
      if (am && /^https?:\/\//i.test(am[1])) out.push(am[1]);
    }
    return out;
  };

  let urls: string[] = [];

  // Primary: noscript lazy-load fallback
  const noscriptRe = /<noscript>([\s\S]*?)<\/noscript>/g;
  let m: RegExpExecArray | null;
  while ((m = noscriptRe.exec(section)) !== null) {
    urls.push(...collect(m[1], 'src'));
  }

  // Fallback: data-src
  if (urls.length === 0) urls = collect(section, 'data-src');

  // Last resort: plain img src matching known CDN paths
  if (urls.length === 0) {
    urls = collect(section, 'src').filter((u) => /chapter|manga[-_.]images|upload/i.test(u));
  }

  // Filter out GIF images — they cause loading issues in the reader
  const filteredUrls = urls.filter(u => {
    try {
      const lowerUrl = u.toLowerCase();
      // Skip .gif extensions
      if (lowerUrl.match(/\.gif(\?|#|$)/)) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  });

  // Upgrade HTTP → HTTPS for CDNs that block plain HTTP (gmbr.pro returns 403 on HTTP)
  return filteredUrls.map(u => {
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'http:' && parsed.hostname.includes('gmbr.pro')) {
        parsed.protocol = 'https:';
        return parsed.toString();
      }
      return u;
    } catch {
      return u;
    }
  });
}
