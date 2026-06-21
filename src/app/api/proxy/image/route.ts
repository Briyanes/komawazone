import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/**
 * GET /api/proxy/image
 * Proxy external manga images through our server.
 *
 * Strategy (Vercel Hobby 10s limit):
 * 1. Try DIRECT fetch (5s timeout) — works when host doesn't block Vercel IPs.
 * 2. If direct fails → return SVG placeholder immediately (no proxy needed).
 *
 * Usage: /api/proxy/image?url=https://img-uwak.gmbr.pro/path/to/image.jpg
 */

const SVG_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#1a1a2e"/><text x="200" y="280" font-size="48" text-anchor="middle" fill="#4a4a6a">📖</text><text x="200" y="340" font-size="14" text-anchor="middle" fill="#4a4a6a" font-family="sans-serif">Gambar gagal dimuat</text><text x="200" y="365" font-size="11" text-anchor="middle" fill="#3a3a5a" font-family="sans-serif">Sedang migrasi ke R2</text></svg>`;

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

    // gmbr.pro requires Referer from manhwaland.site or returns 403
    const isGmbr = url.hostname.includes('gmbr.pro') || url.hostname.includes('gmbar.xyz') || url.hostname.includes('uwakjawa.xyz');
    const referer = isGmbr ? 'https://manhwaland.site/' : url.origin + '/';

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
      Referer: referer,
      Origin: isGmbr ? 'https://manhwaland.site' : url.origin,
      'sec-fetch-dest': 'image',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'cross-site',
    };

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
          const buf = new Uint8Array(await directResp.arrayBuffer());
          if (buf.byteLength > 1024) {
            const finalCt = ct.startsWith('image/') ? ct : 'image/jpeg';
            const blob = new Blob([buf], { type: finalCt });
            return new NextResponse(blob, {
              status: 200,
              headers: {
                'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
                'Content-Length': buf.byteLength.toString(),
              },
            });
          }
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