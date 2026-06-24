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
 *
 * CRITICAL: Only route through server proxy if the host is truly dead (DNS fail).
 * Working subdomains like api-l.gmbr.pro, jablay.gmbr.pro MUST load directly in
 * the browser because Cloudflare blocks server-side (Vercel) fetches with 403.
 * The <img> tag uses referrerPolicy="no-referrer" which bypasses hotlink protection.
 */
export function proxyExternalUrl(url: string): string {
  if (!url) return url;

  // Already proxied
  if (url.startsWith('/api/proxy/image') || url.startsWith('/api/r2/image/')) {
    return url;
  }

  try {
    const parsed = new URL(url);

    // Only proxy hosts that are DNS-dead (bare root domains only).
    // Subdomains (api-l.gmbr.pro, jablay.gmbr.pro, etc.) still work in the browser.
    const DEAD_ROOT_DOMAINS = [
      'gmbr.pro',     // bare domain DNS dead — subdomains still resolve
      'gmbar.xyz',    // bare domain DNS dead
      'uwakjawa.xyz', // bare domain DNS dead
    ];

    // Only EXACT hostname match (not subdomains)
    if (DEAD_ROOT_DOMAINS.includes(parsed.hostname)) {
      return `/api/proxy/image?url=${encodeURIComponent(url)}`;
    }

    // All other external hosts → load directly in browser with referrerPolicy=no-referrer
    // This includes: api-l.gmbr.pro, jablay.gmbr.pro, manhwaland.land, etc.
    // They work fine from the browser but return 403 from Vercel server-side fetch.
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