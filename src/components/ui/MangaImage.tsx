'use client';

/**
 * MangaImage — drop-in replacement for next/image that handles external manga images
 *
 * Strategy:
 * 1. For all gmbr.pro and external CDN images → bypass optimization (unoptimized)
 * 2. For local/Supabase images → use normal Next.js optimization
 *
 * External CDNs have hotlink protection that blocks server-side optimization,
 * so we bypass Next.js Image optimization and let the browser fetch directly.
 */

import NextImage, { type ImageProps } from 'next/image';

// All external manga image hosts (bypass optimization)
const BYPASS_HOSTS = [
  'img-uwak.gmbr.pro',
  'jablay.gmbr.pro',
  'api-l.gmbr.pro',
  '*.gmbr.pro',
  'manhwaland.land',
  '*.manhwaland.land',
];

function isBypassUrl(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  try {
    const url = new URL(src);
    return BYPASS_HOSTS.some(host => {
      if (host.startsWith('*.')) {
        return url.hostname.endsWith(host.slice(2));
      }
      return url.hostname === host;
    });
  } catch {
    return false;
  }
}

export default function MangaImage(props: ImageProps) {
  const bypass = isBypassUrl(props.src);

  return (
    <NextImage
      {...props}
      unoptimized={bypass || props.unoptimized}
      referrerPolicy={bypass ? 'no-referrer' : (props.referrerPolicy ?? 'no-referrer-when-downgrade')}
    />
  );
}
