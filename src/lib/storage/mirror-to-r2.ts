import { uploadBufferToR2 } from './r2';

const IMAGE_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'image/webp,image/avif,image/*,*/*;q=0.8',
  'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
};

/**
 * Download an image from `sourceUrl` and upload it to Cloudflare R2.
 * Returns the R2 public URL on success, or `null` if R2 is not configured or
 * if the download/upload fails for any reason — callers should fall back to
 * the original source URL in the null case.
 */
export async function mirrorImageToR2(
  sourceUrl: string,
  folder: string,
  referer?: string,
  timeout = 20_000,
): Promise<string | null> {
  if (!sourceUrl) return null;

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        ...IMAGE_HEADERS,
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) return null;

    const contentType =
      res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());

    const rawFileName =
      sourceUrl.split('/').pop()?.split('?')[0] ?? 'image';

    const { url } = await uploadBufferToR2({
      buffer,
      contentType,
      fileName: rawFileName,
      folder,
    });

    return url;
  } catch {
    return null;
  }
}

/**
 * Mirror multiple image URLs to R2 concurrently (up to `concurrency` at a time).
 * Returns an array of the same length as `urls`:
 * - R2 URL if upload succeeded
 * - original URL as fallback if upload failed
 */
export async function mirrorImagesToR2(
  urls: string[],
  folder: string,
  referer?: string,
  concurrency = 5,
): Promise<string[]> {
  const results: string[] = new Array(urls.length);

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(url => mirrorImageToR2(url, folder, referer)),
    );
    for (let j = 0; j < batch.length; j++) {
      const r = settled[j];
      results[i + j] =
        r.status === 'fulfilled' && r.value ? r.value : urls[i + j];
    }
  }

  return results;
}
