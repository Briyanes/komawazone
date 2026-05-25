/**
 * Sitemap XML Parser
 * Parses sitemap XML files from manga sources to extract manga URLs and metadata
 * Supports both sitemap index files and direct URL sitemaps
 */

import { XMLParser } from 'fast-xml-parser';

export interface SitemapManga {
  url: string;
  slug: string;
  lastModified: Date | null;
}

export interface SitemapParseResult {
  sitemaps: string[];  // URLs of sub-sitemaps (from index files)
  mangas: SitemapManga[];
  total: number;
  parseTime: number;  // milliseconds
}

export interface SitemapParseOptions {
  timeout?: number;  // Request timeout in milliseconds (default: 10000)
  userAgent?: string;  // Custom User-Agent header
  includeLastmod?: boolean;  // Parse lastmod tags (default: true)
}

/**
 * Extract manga slug from URL
 * Handles various URL patterns from different sources
 */
function extractSlug(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Remove trailing slash and split by /
    const parts = pathname.replace(/\/$/, '').split('/').filter(Boolean);

    // Get the last part (usually the manga slug)
    const slug = parts[parts.length - 1];

    // Remove common prefixes/suffixes
    return slug
      .replace(/^manga-/, '')
      .replace(/-chapter-\d+$/, '')
      .replace(/_/g, '-');
  } catch {
    return '';
  }
}

/**
 * Parse sitemap XML content
 */
function parseSitemapXML(xmlContent: string, includeLastmod: boolean = true): {
  urls: string[];
  lastMods: (string | null)[];
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });

  try {
    const parsed = parser.parse(xmlContent);
    const urls: string[] = [];
    const lastMods: (string | null)[] = [];

    // Handle sitemap index (contains other sitemaps)
    if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
      const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap];

      for (const sitemap of sitemaps) {
        if (sitemap.loc) {
          urls.push(sitemap.loc);
        }
      }
    }

    // Handle URL set (contains actual URLs)
    if (parsed.urlset && parsed.urlset.url) {
      const urlEntries = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];

      for (const entry of urlEntries) {
        if (entry.loc) {
          urls.push(entry.loc);
          lastMods.push(includeLastmod && entry.lastmod ? entry.lastmod : null);
        }
      }
    }

    return { urls, lastMods };
  } catch (error) {
    console.error('XML parsing error:', error);
    return { urls: [], lastMods: [] };
  }
}

/**
 * Fetch sitemap from URL
 */
async function fetchSitemap(
  url: string,
  options: SitemapParseOptions = {}
): Promise<{ success: boolean; content?: string; error?: string }> {
  const {
    timeout = 10000,
    userAgent = 'Mozilla/5.0 (compatible; OLLUQ-Bot/1.0; +https://olluq.com)',
  } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      // Next.js fetch options
      // @ts-ignore - Next.js specific options
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const content = await response.text();
    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Parse a single sitemap URL and extract manga URLs
 */
export async function parseSitemapURL(
  sitemapUrl: string,
  options: SitemapParseOptions = {}
): Promise<SitemapParseResult> {
  const startTime = Date.now();

  try {
    // Fetch sitemap
    const fetchResult = await fetchSitemap(sitemapUrl, options);
    if (!fetchResult.success || !fetchResult.content) {
      return {
        sitemaps: [],
        mangas: [],
        total: 0,
        parseTime: Date.now() - startTime,
      };
    }

    // Parse XML
    const { urls, lastMods } = parseSitemapXML(
      fetchResult.content,
      options.includeLastmod !== false
    );

    // Check if this is a sitemap index (contains other sitemaps)
    const hasSitemaps = urls.some(url =>
      url.includes('sitemap') && !url.includes('manga-') && !url.includes('/chapter-')
    );

    if (hasSitemaps) {
      // Return sitemap URLs for further processing
      return {
        sitemaps: urls,
        mangas: [],
        total: urls.length,
        parseTime: Date.now() - startTime,
      };
    }

    // Extract manga data
    const mangas: SitemapManga[] = urls.map((url, index) => ({
      url,
      slug: extractSlug(url),
      lastModified: lastMods[index] ? new Date(lastMods[index]!) : null,
    }));

    // Filter out non-manga URLs (chapters, tags, category, author, page URLs)
    const filteredMangas = mangas.filter(manga => {
      if (!manga.slug) return false;
      if (manga.slug.includes('chapter-')) return false;
      if (manga.url.includes('/chapter-')) return false;
      if (manga.url.match(/\/(tag|tags|category|author|artist|page|search|genre)\//i)) return false;
      // Accept URLs with /manga-/ pattern (manhwaland), or shallow paths like /slug or /type/slug
      if (manga.url.match(/\/manga-/i)) return true;
      try {
        const parts = new URL(manga.url).pathname.replace(/\/$/, '').split('/').filter(Boolean);
        return parts.length >= 1 && parts.length <= 2;
      } catch {
        return false;
      }
    });

    return {
      sitemaps: [],
      mangas: filteredMangas,
      total: filteredMangas.length,
      parseTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`Error parsing sitemap ${sitemapUrl}:`, error);
    return {
      sitemaps: [],
      mangas: [],
      total: 0,
      parseTime: Date.now() - startTime,
    };
  }
}

/**
 * Parse multiple sitemap URLs and combine results
 */
export async function parseMultipleSitemaps(
  sitemapUrls: string[],
  options: SitemapParseOptions = {}
): Promise<SitemapParseResult> {
  const startTime = Date.now();
  const allMangas: SitemapManga[] = [];
  const allSitemaps: string[] = [];
  const slugSet = new Set<string>();

  // Process sitemaps concurrently (with limit)
  const concurrency = 5;
  for (let i = 0; i < sitemapUrls.length; i += concurrency) {
    const batch = sitemapUrls.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(url => parseSitemapURL(url, options))
    );

    for (const result of results) {
      // Add sitemap URLs
      allSitemaps.push(...result.sitemaps);

      // Add manga URLs (deduplicate by slug)
      for (const manga of result.mangas) {
        if (!slugSet.has(manga.slug)) {
          slugSet.add(manga.slug);
          allMangas.push(manga);
        }
      }
    }
  }

  return {
    sitemaps: allSitemaps,
    mangas: allMangas,
    total: allMangas.length,
    parseTime: Date.now() - startTime,
  };
}

/**
 * Parse all sitemaps recursively (handles sitemap index files)
 */
export async function parseAllSitemaps(
  sitemapUrls: string[],
  options: SitemapParseOptions = {}
): Promise<SitemapParseResult> {
  let allMangas: SitemapManga[] = [];
  const processedSitemaps = new Set<string>();
  const slugSet = new Set<string>();
  const maxDepth = 3; // Prevent infinite loops
  let currentDepth = 0;

  async function processSitemaps(urls: string[]): Promise<void> {
    if (currentDepth >= maxDepth) return;

    currentDepth++;
    const result = await parseMultipleSitemaps(urls, options);

    // Add newly discovered sitemaps
    const newSitemaps = result.sitemaps.filter(
      url => !processedSitemaps.has(url)
    );

    // Mark current sitemaps as processed
    urls.forEach(url => processedSitemaps.add(url));

    // Add manga URLs (deduplicated)
    for (const manga of result.mangas) {
      if (!slugSet.has(manga.slug)) {
        slugSet.add(manga.slug);
        allMangas.push(manga);
      }
    }

    // Recursively process new sitemaps
    if (newSitemaps.length > 0) {
      await processSitemaps(newSitemaps);
    }

    currentDepth--;
  }

  await processSitemaps(sitemapUrls);

  return {
    sitemaps: Array.from(processedSitemaps),
    mangas: allMangas,
    total: allMangas.length,
    parseTime: 0, // Will be set by caller
  };
}

/**
 * Test sitemap parser with example URLs
 */
export async function testSitemapParser(): Promise<void> {
  const testUrls = [
    'https://04x.manhwaland.land/manga-sitemap.xml',
  ];

  console.log('Testing sitemap parser...');
  const result = await parseAllSitemaps(testUrls, {
    timeout: 15000,
    includeLastmod: true,
  });

  console.log('Parse result:', {
    totalMangas: result.total,
    totalSitemaps: result.sitemaps.length,
    parseTime: result.parseTime,
    sampleMangas: result.mangas.slice(0, 5),
  });
}
