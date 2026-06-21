/**
 * Convert image URLs to proxied URLs for reliable delivery
 *
 * R2 dev URLs (pub-xxx.r2.dev) are unreliable and often return 403.
 * External manga CDN URLs (gmbr.pro) have hotlink protection.
 *
 * This helper routes both through our server proxy.
 */

const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL;

/**
 * Convert an R2 public URL to our internal proxy URL
 * Example: https://pub-xxx.r2.dev/chapters/uuid/5.jpg → /api/r2/image/chapters/uuid/5.jpg
 */
export function proxyR2Url(url: string): string {
  if (!url) return url;

  // Already a proxy URL
  if (url.startsWith('/api/r2/image/') || url.startsWith('/api/proxy/image')) {
    return url;
  }

  // R2 URL → route through our R2 proxy
  if (R2_PUBLIC_BASE && url.startsWith(R2_PUBLIC_BASE)) {
    const key = url.slice(R2_PUBLIC_BASE.length).replace(/^\//, '');
    return `/api/r2/image/${key}`;
  }

  // Fallback: any r2.dev URL
  if (url.includes('.r2.dev/') || url.includes('.r2.cloudflarestorage.com/')) {
    try {
      const parsed = new URL(url);
      const key = parsed.pathname.replace(/^\//, '');
      return `/api/r2/image/${key}`;
    } catch {
      return url;
    }
  }

  return url;
}

/**
 * Convert an external manga CDN URL to our proxy URL
 * Example: https://img-uwak.gmbr.pro/path/image.jpg → /api/proxy/image?url=...
 */
export function proxyExternalUrl(url: string): string {
  if (!url) return url;

  // Already proxied
  if (url.startsWith('/api/proxy/image') || url.startsWith('/api/r2/image/')) {
    return url;
  }

  const EXTERNAL_HOSTS = [
    'gmbr.pro',
    'gmbar.xyz',
    'uwakjawa.xyz',
    'manhwaland.land',
    'manhwaland.in',
    'kambingjantan.cc',
    'shinigami.asia',
  ];

  try {
    const parsed = new URL(url);
    const isExternal = EXTERNAL_HOSTS.some(h => parsed.hostname.includes(h));

    if (isExternal) {
      return `/api/proxy/image?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Not a valid URL, return as-is
  }

  return url;
}

/**
 * Smart proxy: automatically picks the right proxy based on URL
 */
export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // R2 URLs
  const r2Proxied = proxyR2Url(url);
  if (r2Proxied !== url) return r2Proxied;

  // External CDN URLs
  return proxyExternalUrl(url);
}