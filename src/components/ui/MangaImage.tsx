'use client';

/**
 * MangaImage — Smart image component that handles external manga images
 *
 * Strategy (matching admin dashboard approach):
 * 1. For external manga CDN images → use regular <img> tag (no Next.js optimization)
 * 2. For local/Supabase images → use Next.js Image (with optimization)
 *
 * External CDNs have hotlink protection that blocks server-side optimization.
 * Using regular <img> tags allows browser's native TLS fingerprint to work.
 */

import NextImage, { type ImageProps } from 'next/image';
import { forwardRef } from 'react';

// All external manga image hosts (use regular img tag)
const EXTERNAL_HOSTS = [
  'img-uwak.gmbr.pro',
  'jablay.gmbr.pro',
  'api-l.gmbr.pro',
  '*.gmbr.pro',
  'manhwaland.land',
  '*.manhwaland.land',
];

function isExternalUrl(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  try {
    const url = new URL(src);
    return EXTERNAL_HOSTS.some(host => {
      if (host.startsWith('*.')) {
        return url.hostname.endsWith(host.slice(2));
      }
      return url.hostname === host;
    });
  } catch {
    return false;
  }
}

export const MangaImage = forwardRef<HTMLImageElement, ImageProps>((props, ref) => {
  const isExternal = isExternalUrl(props.src);

  // External CDN images → use regular <img> tag (like admin dashboard)
  if (isExternal && typeof props.src === 'string') {
    const { width, height, className, style, alt, src, ...rest } = props;

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        src={src}
        alt={alt || 'Manga cover'}
        width={width}
        height={height}
        className={className}
        style={style}
        referrerPolicy="no-referrer"
        loading="lazy"
        {...rest}
      />
    );
  }

  // Local/Supabase images → use Next.js Image with optimization
  return <NextImage ref={ref as any} {...props} />;
});

MangaImage.displayName = 'MangaImage';

export default MangaImage;
