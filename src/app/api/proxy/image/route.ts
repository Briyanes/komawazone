import { NextRequest, NextResponse } from 'next/server';
import { fetchBufferWithProxy } from '@/lib/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/proxy/image
 * Proxy external manga images through our server + Webshare proxy pool.
 *
 * CRITICAL FIXES vs previous version:
 * 1. Route fetches through the Webshare proxy pool to avoid Vercel IP blocks.
 * 2. Referer is derived dynamically from the target URL's origin (not hardcoded).
 * 3. Proper error handling for proxy exhaustion.
 *
 * Usage: /api/proxy/image?url=https://img-uwak.gmbr.pro/path/to/image.jpg
 */
export async function GET(req: NextRequest) {
  const searchParams = await req.nextUrl.searchParams;
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
  }

  try {
    // Validate URL to prevent SSRF attacks
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Only allow known manga image hosts
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

    // Build browser-like headers with DYNAMIC referer (not hardcoded).
    const referer = url.origin + '/';
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
      'Referer': referer,
      'sec-fetch-dest': 'image',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'cross-site',
    };

    // Route through the Webshare proxy pool — bypasses Vercel/datacenter IP blocks.
    let buffer: Buffer;
    let contentType: string;

    try {
      const result = await fetchBufferWithProxy(imageUrl, {
        headers,
        timeoutMs: 20_000,
        maxAttempts: 4,
      });
      buffer = result.buffer;
      contentType = result.contentType;
    } catch (proxyErr) {
      const msg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      // Proxy failed entirely — return a descriptive status to the client.
      // The <img onError> handler will show the placeholder fallback.
      console.error('[proxy/image] fetch failed for', imageUrl, msg);
      return NextResponse.json(
        { error: `Proxy fetch failed: ${msg}` },
        { status: 502 }
      );
    }

    // Basic content-type guard (allow all image/*; some CDNs mislabel as octet-stream)
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      return NextResponse.json(
        { error: `Invalid content type: ${contentType}` },
        { status: 502 }
      );
    }

    // Wrap buffer in a Blob for correct BodyInit typing in Next 16 / Web Streams.
    const finalContentType = contentType.startsWith('image/') ? contentType : 'image/jpeg';
    const blob = new Blob([new Uint8Array(buffer)], { type: finalContentType });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'Content-Length': buffer.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy image' },
      { status: 500 }
    );
  }
}