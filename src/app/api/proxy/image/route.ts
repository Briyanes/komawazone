import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/proxy/image
 * Proxy external manga images through our server to bypass hotlink protection
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
    const url = new URL(imageUrl);

    // Only allow known manga image hosts
    const allowedHosts = [
      'img-uwak.gmbr.pro',
      'api-l.gmbr.pro',
      'jablay.gmbr.pro',
      '*.gmbr.pro',
      'manhwaland.land',
      '*.manhwaland.land',
    ];

    const isAllowed = allowedHosts.some(host => {
      if (host.startsWith('*.')) {
        return url.hostname.endsWith(host.slice(2));
      }
      return url.hostname === host || url.hostname === host.replace('*.', '');
    });

    if (!isAllowed) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }

    // Fetch image with proper headers to bypass hotlink protection
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://04x.manhwaland.land/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      // Cache for 1 hour
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: response.status }
      );
    }

    // Get image data
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Return image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        'Content-Length': imageBuffer.byteLength.toString(),
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
