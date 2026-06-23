import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

/**
 * GET /api/r2/image/[...key]
 *
 * Serves images stored in Cloudflare R2 through our server.
 * The R2 public dev URL (pub-xxx.r2.dev) is unreliable and often returns 403.
 * This route reads from R2 via the S3 API and serves the image with proper caching.
 *
 * Performance optimizations:
 * - Streams R2 response directly (no full buffer in memory)
 * - 1-year immutable cache for existing images (edge CDN cached)
 * - 5-min cache for missing images (migration-friendly)
 * - NO rate limiting — images are static content, browsers handle concurrency
 *
 * Example: /api/r2/image/chapters/473ad2ac-c46a-46b5-b2b0-4bf86e17d3d6/5.jpg
 */

// Force Node.js runtime (not Edge) for S3 SDK + stream support
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// Convert a readable stream to a web ReadableStream for direct piping
function toWebStream(stream: Readable | ReadableStream | unknown): ReadableStream<Uint8Array> {
  if (stream instanceof ReadableStream) return stream;

  if (stream instanceof Readable) {
    return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  }

  throw new Error('Unsupported stream type');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key: keyParts } = await params;
  const key = keyParts.join('/');

  if (!key) {
    return NextResponse.json({ error: 'Image key required' }, { status: 400 });
  }

  // Security: only allow image file extensions
  const ext = key.split('.').pop()?.toLowerCase();
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
  if (!ext || !allowedExts.includes(ext)) {
    return NextResponse.json({ error: 'Invalid image type' }, { status: 400 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const contentType = response.ContentType || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const contentLength = response.ContentLength;

    // STREAM directly: pipe R2 body → response (no buffer, lower memory + faster TTFB)
    const body = toWebStream(response.Body);

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    };

    if (contentLength) {
      headers['Content-Length'] = String(contentLength);
    }

    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    // Check if it's a NoSuchKey error (object doesn't exist in R2)
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    const isNotFound =
      err?.name === 'NoSuchKey' ||
      err?.$metadata?.httpStatusCode === 404;

    if (isNotFound) {
      // Return a lightweight SVG placeholder instead of 404.
      // Browser sees a valid image → no broken icon. Cache 5 min so we can retry.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#1a1a2e"/><text x="200" y="280" font-size="48" text-anchor="middle" fill="#4a4a6a">📖</text><text x="200" y="340" font-size="14" text-anchor="middle" fill="#4a4a6a" font-family="sans-serif">Gambar belum tersedia</text><text x="200" y="365" font-size="11" text-anchor="middle" fill="#3a3a5a" font-family="sans-serif">Sedang migrasi ke R2</text></svg>`;
      return new NextResponse(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      });
    }

    console.error('[R2 Proxy] Error fetching:', key, error instanceof Error ? error.message : error);

    // For other errors, return 500
    return new NextResponse('Internal error', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      },
    });
  }
}