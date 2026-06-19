import { validateScraperUrl } from '@/lib/scrapers/scraper-utils';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_TIMEOUT = 30000; // 30 seconds

export interface DownloadedImage {
  buffer: Buffer;
  contentType: string;
}

/**
 * Upgrade HTTP → HTTPS for CDNs that block plain HTTP (403).
 * gmbr.pro / gmbar.xyz return 403 for HTTP requests but 200 for HTTPS.
 */
function upgradeToHttps(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' && parsed.hostname.includes('gmbr.pro')) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate content type is an image
 */
function isValidImageContentType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

/**
 * Download image from URL with retry logic and SSRF protection
 */
export async function downloadImageWithRetry(
  url: string,
  options: { maxRetries?: number; timeout?: number } = {}
): Promise<DownloadedImage> {
  const { maxRetries = 3, timeout = DEFAULT_TIMEOUT } = options;

  // SSRF protection
  const ssrfError = validateScraperUrl(url);
  if (ssrfError) {
    throw new Error(`URL validation failed: ${ssrfError}`);
  }

  // Upgrade HTTP → HTTPS for CDNs that block plain HTTP (gmbr.pro returns 403 on HTTP)
  const fetchUrl = upgradeToHttps(url);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Add jitter delay before retry
    if (attempt > 1) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 2), 8000);
      const jitter = Math.random() * 1000;
      await sleep(backoff + jitter);
    }

    try {
      const imageHeaders: HeadersInit = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
        'Referer': new URL(fetchUrl).origin + '/',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site',
      };
      const response = await fetch(fetchUrl, {
        headers: imageHeaders,
        signal: AbortSignal.timeout(timeout),
      });

      // Handle rate limiting
      if (response.status === 429 || response.status === 503) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        lastError = new Error(`HTTP ${response.status}: rate limited`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      if (!isValidImageContentType(contentType)) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      // Check content length if available
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
        throw new Error(`Image too large: ${contentLength} bytes`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validate buffer size
      if (buffer.length > MAX_IMAGE_SIZE) {
        throw new Error(`Image too large: ${buffer.length} bytes`);
      }

      if (buffer.length === 0) {
        throw new Error('Downloaded image is empty');
      }

      return { buffer, contentType };

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on timeout
      if (lastError.name === 'AbortError' || lastError.name === 'TypeError') {
        break;
      }
    }
  }

  throw lastError || new Error('Failed to download image after retries');
}

/**
 * Download multiple images in parallel (with limit)
 */
export async function downloadImagesInParallel(
  urls: string[],
  options: { maxRetries?: number; timeout?: number; concurrency?: number } = {}
): Promise<Array<{ url: string; result: DownloadedImage | null; error: string | null }>> {
  const { concurrency = 5 } = options;
  const results: Array<{ url: string; result: DownloadedImage | null; error: string | null }> = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        try {
          const result = await downloadImageWithRetry(url, options);
          return { url, result, error: null };
        } catch (err) {
          return { url, result: null, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}
