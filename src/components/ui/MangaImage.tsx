'use client';

/**
 * MangaImage — drop-in replacement for next/image that handles external manga images
 *
 * Strategy:
 * 1. For gmbr.pro images (hotlink protected) → use proxy API
 * 2. For other external CDNs → bypass optimization with unoptimized mode
 * 3. For local/Supabase images → use normal Next.js optimization
 */

import NextImage, { type ImageProps } from 'next/image';

// Hosts that need proxy (hotlink protection)
const PROXY_HOSTS = ['img-uwak.gmbr.pro', '*.gmbr.pro'];

// Hosts that bypass optimization (Cloudflare protection)
const BYPASS_HOSTS = ['jablay.gmbr.pro', 'api-l.gmbr.pro', 'manhwaland.land'];

function isProxyUrl(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  try {
    const url = new URL(src);
    return PROXY_HOSTS.some(host => {
      if (host.startsWith('*.')) {
        return url.hostname.endsWith(host.slice(2));
      }
      return url.hostname === host;
    });
  } catch {
    return false;
  }
}

function isBypassUrl(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  try {
    return BYPASS_HOSTS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

function getProxyUrl(src: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(src)}`;
}

export default function MangaImage(props: ImageProps) {
  const needsProxy = isProxyUrl(props.src);
  const bypass = isBypassUrl(props.src);

  // Use proxy URL for hotlink-protected images
  const src = needsProxy && typeof props.src === 'string'
    ? getProxyUrl(props.src)
    : props.src;

  // Bypass optimization for proxy URLs (already optimized by proxy) and other bypass hosts
  const shouldBypass = needsProxy || bypass || props.unoptimized;

  return (
    <NextImage
      {...props}
      src={src}
      unoptimized={shouldBypass}
      referrerPolicy={bypass ? 'no-referrer' : (props.referrerPolicy ?? 'no-referrer-when-downgrade')}
    />
  );
}
