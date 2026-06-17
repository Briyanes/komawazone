'use client';

/**
 * MangaImage — Smart image component that handles external manga images with fallback
 *
 * Strategy:
 * 1. For external manga CDN images → use regular <img> tag with onError fallback
 * 2. For local/Supabase images → use Next.js Image (with optimization)
 * 3. If external image fails → show placeholder emoji
 *
 * External CDNs have aggressive hotlink protection that may block requests.
 * We provide graceful fallback to placeholder images when loading fails.
 */

import NextImage, { type ImageProps } from 'next/image';
import { forwardRef, useState } from 'react';
import { proxyR2Url } from '@/lib/image-proxy';

// External manga image hosts that block hotlinking (use regular img tag)
// R2 URLs are NOT here — they go through next/image for WebP/AVIF optimization
const EXTERNAL_HOSTS = [
  'img-uwak.gmbr.pro',
  'jablay.gmbr.pro',
  'api-l.gmbr.pro',
  '*.gmbr.pro',
  'manhwaland.land',
  '*.manhwaland.land',
  '*.kambingjantan.cc',
  'kambingjantan.cc',
  '*.gmbar.xyz',
  'gmbar.xyz',
];

function isExternalUrl(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  try {
    const url = new URL(src);
    // R2 dev URLs: route through our proxy (they return 403 from browser)
    if (url.hostname.endsWith('.r2.dev') || url.hostname.endsWith('.r2.cloudflarestorage.com')) {
      return true;
    }
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
  const [imageError, setImageError] = useState(false);

  // External CDN images → use regular <img> tag with fallback
  if (isExternal && typeof props.src === 'string') {
    const {
      fill,
      width,
      height,
      className,
      style,
      alt,
      src: rawSrc,
      priority,
      ...rest
    } = props;
    const src = proxyR2Url(rawSrc as string);

    // Show placeholder if image failed to load
    if (imageError) {
      const placeholderStyle: React.CSSProperties = fill
        ? {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fill ? '2rem' : '4rem',
            ...(style || {}),
          }
        : {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '4rem',
            width: width || '100%',
            height: height || 'auto',
            ...(style || {}),
          };

      return (
        <div className={className} style={placeholderStyle}>
          📖
        </div>
      );
    }

    // Handle fill prop for regular img tag
    const baseStyle: React.CSSProperties = fill
      ? {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }
      : {};

    const imgStyle = style ? { ...baseStyle, ...style } : baseStyle;

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        src={src}
        alt={alt || 'Manga cover'}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        className={className}
        style={imgStyle}
        referrerPolicy="no-referrer"
        loading={priority ? undefined : 'lazy'}
        onError={() => setImageError(true)}
        {...rest}
      />
    );
  }

  // Local/Supabase images → use Next.js Image with optimization
  return <NextImage ref={ref as React.Ref<HTMLImageElement>} {...props} />;
});

MangaImage.displayName = 'MangaImage';

export default MangaImage;
