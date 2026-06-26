import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Note: Edge CDN caching is controlled by Cache-Control response headers.
// No need for force-dynamic — Vercel caches responses based on headers.
export const maxDuration = 10;

/**
 * GET /api/proxy/image
 * Proxy external manga images through our server.
 *
 * Strategy (Vercel Hobby 10s limit):
 * 1. For DEAD hosts (gmbr.pro DNS dead) → return SVG placeholder immediately.
 * 2. Try DIRECT fetch (5s timeout) — works when host doesn't block Vercel IPs.
 * 3. If direct fails → return SVG placeholder immediately.
 *
 * Usage: /api/proxy/image?url=https://img-uwak.gmbr.pro/path/to/image.jpg
 */

const SVG_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#1a1a2e"/><text x="200" y="270" font-size="56" text-anchor="middle" fill="#4a4a6a">📖</text><text x="200" y="330" font-size="16" text-anchor="middle" fill="#6a6a8a" font-family="sans-serif" font-weight="600">Gambar sedang diperbaiki</text><text x="200" y="355" font-size="12" text-anchor="middle" fill="#4a4a6a" font-family="sans-serif">Server gambar sedang bermasalah</text></svg>`;

// Hosts known to be DEAD — skip fetch entirely.
// CRITICAL: As of June 2026, Cloudflare blocks ALL access to gmbr.pro with 403
// for everyone (browser, curl, server). ALL subdomains are dead too.
const DEAD_HOST_SUFFIXES = ['.gmbr.pro', '.gmbar.xyz', '.uwakjawa.xyz'];
const DEAD_HOSTS = new Set(['gmbr.pro', 'gmbar.xyz', 'uwakjawa.xyz']);

function isDeadHost(hostname: string): boolean {
  if (DEAD_HOSTS.has(hostname)) return true;
  return DEAD_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix));
}

function svgResponse() {
  return new NextResponse(SVG_PLACEHOLDER, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

export async function GET(req: NextRequest) {
  const searchParams = await req.nextUrl.searchParams;
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
  }

  try {
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Allow known manga image hosts
    const allowedHosts = [
      'img-uwak.gmbr.pro',
      'api-l.gmbr.pro',
      'jablay.gmbr.pro',
      '*.gmbr.pro',
      'gmbr.pro',
      'manhwaland.land',
      '*.manhwaland.land',
      'manhwaland.in',
      '*.kambingjantan.cc',
      'kambingjantan.cc',
      '*.gmbar.xyz',
      'gmbar.xyz',
      '*.uwakjawa.xyz',
      'uwakjawa.xyz',
      '*.manhwaland.in',
      'manhwaland.in',
    ];

    const isAllowed = allowedHosts.some(host => {
      if (host.startsWith('*.')) {
        return url.hostname.endsWith(host.slice(2));
      }
      return url.hostname === host || url.hostname.endsWith('.' + host);
    });

    if (!isAllowed) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }

    // FAST FAIL: For dead hosts, skip fetch entirely.
    // As of June 2026, ALL gmbr.pro/gmbar.xyz/uwakjawa.xyz (including subdomains)
    // are behind a Cloudflare 403 wall. Fetching wastes 5s and always fails.
    // Return SVG placeholder instantly — clean UX, zero wasted time.
    if (isDeadHost(url.hostname)) {
      return svgResponse();
    }

    // IMPORTANT: gmbr.pro blocks requests WITH Referer (403 Forbidden).
    // It works only with NO Referer (like a browser with referrerPolicy=no-referrer).
    // So we don't send Referer/Origin for these hosts.
    const isGmbr = url.hostname.includes('gmbr.pro') || url.hostname.includes('gmbar.xyz') || url.hostname.includes('uwakjawa.xyz');

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
    };

    if (!isGmbr) {
      headers.Referer = url.origin + '/';
      headers.Origin = url.origin;
    }
    // For gmbr hosts: NO Referer, NO Origin — this is what makes it work!

    // ─── Direct fetch only (5s timeout) ───
    try {
      const directResp = await fetch(imageUrl, {
        headers,
        signal: AbortSignal.timeout(5_000),
        redirect: 'follow',
      });

      if (directResp.ok && directResp.body) {
        const ct = directResp.headers.get('content-type') || '';
        if (ct.startsWith('image/') || ct.includes('octet-stream')) {
          const finalCt = ct.startsWith('image/') ? ct : 'image/jpeg';
          const contentLength = directResp.headers.get('content-length');
          // STREAM directly: pipe fetch body → response (no buffer, lower memory)
          return new NextResponse(directResp.body, {
            status: 200,
            headers: {
              'Content-Type': finalCt,
              'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
              ...(contentLength ? { 'Content-Length': contentLength } : {}),
            },
          });
        }
      }
    } catch {
      // Direct failed — fall through to placeholder
    }

    // ─── Fallback: SVG placeholder ───
    return svgResponse();
  } catch {
    return svgResponse();
  }
}