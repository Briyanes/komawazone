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
import { forwardRef, useEffect, useState } from 'react';
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

// Hosts that are DEAD (DNS dead, 403 forever, or permanently offline).
// Instead of trying to load → waiting for timeout → failing → showing placeholder,
// we SKIP directly to placeholder for these hosts. This eliminates the 5-10s
// timeout per dead image and makes the page appear clean instantly.
//
// CRITICAL: As of June 2026, Cloudflare now blocks ALL access to gmbr.pro
// including subdomains (api-l, jablay, img-uwak) with 403. Previously only
// the bare domain gmbr.pro had DNS failure, but now the entire gmbr.pro
// infrastructure is behind a Cloudflare wall that returns 403 for everyone.
const DEAD_HOST_SUFFIXES = [
  '.gmbr.pro',    // Cloudflare 403 — ALL subdomains dead (api-l, jablay, img-uwak)
  '.gmbar.xyz',   // DNS dead — ALL subdomains
  '.uwakjawa.xyz', // DNS dead — ALL subdomains
];

// Also match bare domains (hostname without subdomain)
const DEAD_HOSTS_EXACT = new Set([
  'gmbr.pro',
  'gmbar.xyz',
  'uwakjawa.xyz',
]);

function isDeadHost(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return false;
  if (src.startsWith('/api/r2/image/') || src.startsWith('/api/proxy/image')) return false;
  try {
    const url = new URL(src);
    // Match bare domain OR any subdomain of dead hosts
    if (DEAD_HOSTS_EXACT.has(url.hostname)) return true;
    return DEAD_HOST_SUFFIXES.some(suffix => url.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

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
  const isDead = isDeadHost(props.src);
  const [imageError, setImageError] = useState(false);
  // Fallback chain for EXTERNAL CDN URLs only (gmbr.pro, etc.)
  // For R2 URLs (/api/r2/image/), we retry the same URL with cache-busting
  // instead of switching to a broken proxy URL.
  const [fallbackStage, setFallbackStage] = useState<'direct' | 'proxy' | 'failed'>('direct');
  // Retry count for R2 URLs — allows cache-busting retries on transient failures
  const [r2Retry, setR2Retry] = useState(0);

  // Dead host → fire onLoad so parent (e.g. ImageCard) removes its loading skeleton.
  // Without this, the skeleton would pulse forever since no <img> onLoad fires.
  useEffect(() => {
    if (isDead && props.onLoad) {
      (props.onLoad as React.EventHandler<React.SyntheticEvent<HTMLImageElement, Event>>)(
        new Event('load') as unknown as React.SyntheticEvent<HTMLImageElement, Event>
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDead]);

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

    // ─── FAST FAIL: Dead host → show placeholder immediately ───
    // Skip the entire load → timeout → fail chain. The host is DNS-dead
    // so any fetch attempt wastes 5-10 seconds. Just show placeholder now.
    // (Once the backfill script replaces this URL with R2, it will load fine.)
    if (isDead) {
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
            background: '#1a1a2e',
            color: '#4a4a6a',
            ...(style || {}),
          }
        : {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '4rem',
            width: width || '100%',
            height: height || 'auto',
            background: '#1a1a2e',
            color: '#4a4a6a',
            ...(style || {}),
          };

      return (
        <div className={className} style={placeholderStyle}>
          📖
        </div>
      );
    }
    // CRITICAL: use smart proxy that handles BOTH R2 URLs and external CDN URLs
    // (gmbr.pro, manhwaland, etc.) — prevents hotlink-protection broken images.
    const proxiedSrc = proxyImageUrl(rawSrc as string) ?? (rawSrc as string);
    const isR2Url = proxiedSrc.startsWith('/api/r2/image/');

    // Determine final src based on fallback stage.
    // R2 URLs: retry same endpoint with cache-busting (avoids broken proxy URL bug).
    // External CDN URLs: direct → server proxy → placeholder.
    let src: string;
    if (fallbackStage === 'direct') {
      src = proxiedSrc;
    } else if (fallbackStage === 'proxy') {
      if (isR2Url) {
        // R2 retry: append cache-busting query param (same endpoint, fresh fetch)
        const separator = proxiedSrc.includes('?') ? '&' : '?';
        src = `${proxiedSrc}${separator}r=${r2Retry}`;
      } else if (!proxiedSrc.startsWith('/api/proxy/image')) {
        // External CDN fallback: server-side proxy (bypasses hotlink protection)
        src = `/api/proxy/image?url=${encodeURIComponent(rawSrc as string)}`;
      } else {
        // Already proxied (e.g. dead gmbr.pro) → can't retry further
        src = proxiedSrc;
      }
    } else {
      src = proxiedSrc;
    }

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
        {...rest}
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
          // Fallback chain depends on URL type:
          //
          // R2 URLs (/api/r2/image/): retry same endpoint with cache-busting
          // up to 3 times. R2 images exist but fail on transient network issues
          // or concurrent load (browser limits 6 concurrent per origin).
          //
          // External CDN URLs: direct → server proxy → placeholder
          const MAX_R2_RETRIES = 3;

          if (isR2Url) {
            // R2 retry: cache-bust up to MAX_R2_RETRIES times, then give up
            if (fallbackStage === 'direct') {
              setR2Retry(1);
              setFallbackStage('proxy');
              setImageError(false);
            } else if (fallbackStage === 'proxy' && r2Retry < MAX_R2_RETRIES) {
              setR2Retry(r => r + 1);
              setImageError(false);
              // src recalculates on re-render with new r2Retry → new cache-bust query
            } else {
              // Exhausted retries → show placeholder, notify parent
              setFallbackStage('failed');
              setImageError(true);
              if (rest.onError) {
                (rest.onError as React.EventHandler<React.SyntheticEvent<HTMLImageElement, Event>>)(
                  new Event('error') as unknown as React.SyntheticEvent<HTMLImageElement, Event>
                );
              }
            }
          } else {
            // External CDN: direct → proxy → placeholder
            if (fallbackStage === 'direct') {
              setFallbackStage('proxy');
              setImageError(false);
            } else if (fallbackStage === 'proxy') {
              setFallbackStage('failed');
              setImageError(true);
              if (rest.onError) {
                (rest.onError as React.EventHandler<React.SyntheticEvent<HTMLImageElement, Event>>)(
                  new Event('error') as unknown as React.SyntheticEvent<HTMLImageElement, Event>
                );
              }
            } else {
              setImageError(true);
              if (rest.onError) {
                (rest.onError as React.EventHandler<React.SyntheticEvent<HTMLImageElement, Event>>)(
                  new Event('error') as unknown as React.SyntheticEvent<HTMLImageElement, Event>
                );
              }
            }
          }
        }}
        onLoad={() => {
          setImageError(false);
          // Forward onLoad to parent
          if (rest.onLoad) {
            (rest.onLoad as React.EventHandler<React.SyntheticEvent<HTMLImageElement, Event>>)(
              new Event('load') as unknown as React.SyntheticEvent<HTMLImageElement, Event>
            );
          }
        }}
      />
    );
  }

  // Local/Supabase images → use Next.js Image with optimization
  return <NextImage ref={ref as React.Ref<HTMLImageElement>} {...props} />;
});

MangaImage.displayName = 'MangaImage';

export default MangaImage;