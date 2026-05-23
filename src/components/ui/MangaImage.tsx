'use client';

/**
 * MangaImage — drop-in replacement for next/image that bypasses Next.js
 * server-side image optimization for CDN URLs behind Cloudflare Bot Management.
 *
 * When `src` points to a known CDN host (jablay.gmbr.pro, api-l.gmbr.pro),
 * `unoptimized` is set automatically so the browser fetches the image directly
 * using its own TLS fingerprint (Chrome), which Cloudflare allows.
 */

import NextImage, { type ImageProps } from 'next/image';

const BYPASS_HOSTS = ['jablay.gmbr.pro', 'api-l.gmbr.pro'];

function isBypassUrl(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  try {
    return BYPASS_HOSTS.includes(new URL(src).hostname);
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
