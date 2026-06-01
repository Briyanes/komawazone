'use client';

/**
 * MangaImage — Smart image component that handles external manga images with fallback
 *
 * Strategy:
 * 1. For any third-party URL (not R2, not Supabase, not relative) → use plain <img>
 *    with referrerPolicy="no-referrer" and onError fallback.
 *    Reason: external CDNs have hotlink protection that blocks Next.js image optimizer
 *    (which fetches server-side without a browser referer), causing broken images.
 * 2. For R2 / Supabase / relative URLs → use Next.js Image (with optimization)
 * 3. If external image fails to load → show 📖 placeholder
 */

import NextImage, { type ImageProps } from 'next/image';
import { forwardRef, useState } from 'react';

// Hostnames that are safe to route through Next.js Image optimisation.
// Everything else is treated as a third-party CDN and served via plain <img>.
const NEXTIMAGE_SAFE = [
  '.r2.dev',
  '.r2.cloudflarestorage.com',
  '.supabase.co',
  '.supabase.in',
];

function isExternalUrl(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  if (!src.startsWith('http')) return false; // relative URLs → NextImage
  try {
    const { hostname } = new URL(src);
    // Keep R2 / Supabase through NextImage optimizer
    if (NEXTIMAGE_SAFE.some(suffix => hostname.endsWith(suffix))) return false;
    // Everything else → plain <img>
    return true;
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
      src,
      sizes,
      priority,
      quality,
      ...rest
    } = props;

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
  return <NextImage ref={ref as any} {...props} />;
});

MangaImage.displayName = 'MangaImage';

export default MangaImage;
