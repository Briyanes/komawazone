/**
 * Manga Source Detector
 * Auto-detect manga type and country based on domain/URL patterns
 */

export interface MangaSource {
  domains: string[];
  type: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
  country: 'JP' | 'KR' | 'CN' | 'OTHER';
  name: string;
}

export const MANGA_SOURCES: MangaSource[] = [
  // 🇯🇵 Japanese Manga Sources
  {
    domains: ['flmtscan.com', 'flmtscan.net', 'komikcast.app', 'komikcast.com', 'westmanga.info', 'mangadex.org', 'mangakakalot.com', 'manganelo.com', 'fanfox.net', 'kumascans.com'],
    type: 'MANGA',
    country: 'JP',
    name: 'Japanese Manga'
  },

  // 🇰🇷 Korean Manhwa Sources
  {
    domains: ['manhwaland.land', 'manhwatop.com', 'manhuaplus.com', 'manhwahub.me', 'asuratoon.com', 'toptoon.com'],
    type: 'MANHWA',
    country: 'KR',
    name: 'Korean Manhwa'
  },

  // 🇨🇳 Chinese Manhua Sources
  {
    domains: ['manhuachill.com', 'manhuasaurus.com', 'wuxiaworld.site', 'kissmanga.in', 'manhuafast.com'],
    type: 'MANHUA',
    country: 'CN',
    name: 'Chinese Manhua'
  },

  // 🌐 Webtoon (Multi-country)
  {
    domains: ['webtoons.com'],
    type: 'WEBTOON',
    country: 'OTHER',
    name: 'Webtoon'
  },
];

/**
 * Detect manga source from URL
 */
export function detectMangaSource(url: string): MangaSource | null {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');

    return MANGA_SOURCES.find(source =>
      source.domains.some(domain =>
        hostname === domain || hostname.endsWith(`.${domain}`)
      )
    ) || null;
  } catch {
    return null;
  }
}

/**
 * Get manga type from URL (with fallback)
 */
export function getMangaType(url: string, fallback: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON' = 'MANGA'): 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON' {
  const detected = detectMangaSource(url);
  return detected?.type || fallback;
}

/**
 * Get all supported domains
 */
export function getSupportedDomains(): string[] {
  return MANGA_SOURCES.flatMap(source => source.domains);
}
