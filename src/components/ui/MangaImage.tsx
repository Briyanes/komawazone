'use client';

/**
 * MangaImage — Smart image component that handles external manga images with fallback
 *
 * Strategy:
 * 1. For external manga CDN images (gmbr.pro, manhwaland, R2 dev) → use regular
 *    <img> tag with onError fallback AND route through our smart proxy.
 * 2. For local/Supabase images → use Next.js Image (with optimization)
 * 3. If external image fails → fallback chain: direct → proxy → placeholder
 *
 * CRITICAL FIX: Previously, external CDN URLs (gmbr.pro) were passed directly to
 * the <img> tag without proxying. This caused broken images in the reader because
 * of hotlink protection (403 from browser). Now we use proxyImageUrl() which
 * routes BOTH R2 URLs and external CDN URLs through our server-side proxy.
 *
 * FALLBACK CHAIN: When a direct browser load fails, we automatically retry through
 * /api/proxy/image?url=<original> (server-side fetch without Referer). This handles
 * intermittent gmbr.pro failures and dead hosts (uwakjawa.xyz) gracefully.
 */

import NextImage, { type ImageProps } from 'next/image';
import { forwardRef, useState } from 'react';
import { proxyImageUrl } from '@/lib/image-proxy';

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
  '*.uwakjawa.xyz',
  'uwakjawa.xyz',
  '*.manhwaland.in',
  'manhwaland.in',
];

function isExternalUrl(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  // Internal proxy URLs (relative paths) → bypass Next.js image optimizer
  // Fixes Next.js 16 regression: _next/image returns 400 for /api/r2/image/** URLs
  // even when listed in localPatterns. Direct browser fetch to R2 proxy is faster
  // (no Vercel CPU cost) and R2 already serves WebP + 1-year immutable cache.
  if (src.startsWith('/api/r2/image/') || src.startsWith('/api/proxy/image')) {
    return true;
  }
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
  // Fallback chain: try direct → proxy → placeholder
  const [fallbackStage, setFallbackStage] = useState<'direct' | 'proxy' | 'failed'>('direct');

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
    // CRITICAL: use smart proxy that handles BOTH R2 URLs and external CDN URLs
    // (gmbr.pro, manhwaland, etc.) — prevents hotlink-protection broken images.
    const proxiedSrc = proxyImageUrl(rawSrc as string) ?? (rawSrc as string);
    // Fallback strategy:
    // Stage 1 (direct): use proxiedSrc as-is
    // Stage 2 (proxy): if direct fails, route through /api/proxy/image?url=<original>
    // Stage 3 (failed): show placeholder emoji
    const src = fallbackStage === 'proxy' && !proxiedSrc.startsWith('/api/proxy/image')
      ? `/api/proxy/image?url=${encodeURIComponent(rawSrc as string)}`
      : proxiedSrc;

    // Show placeholder only after BOTH direct AND proxy attempts fail
    if (imageError && fallbackStage === 'failed') {
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
        onError={() => {
          // Fallback chain: direct → proxy → placeholder
          if (fallbackStage === 'direct') {
            setFallbackStage('proxy');
            setImageError(false);
          } else if (fallbackStage === 'proxy') {
            setFallbackStage('failed');
            setImageError(true);
          } else {
            setImageError(true);
          }
        }}
        onLoad={() => setImageError(false)}
        {...rest}
      />
    );
  }

  // Local/Supabase images → use Next.js Image with optimization
  return <NextImage ref={ref as React.Ref<HTMLImageElement>} {...props} />;
});

MangaImage.displayName = 'MangaImage';

export default MangaImage;