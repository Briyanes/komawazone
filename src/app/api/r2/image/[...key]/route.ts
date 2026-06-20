import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { rateLimit } from '@/lib/rate-limit';

/**
 * GET /api/r2/image/[...key]
 *
 * Serves images stored in Cloudflare R2 through our server.
 * The R2 public dev URL (pub-xxx.r2.dev) is unreliable and often returns 403.
 * This route reads from R2 via the S3 API and serves the image with proper caching.
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

// Convert a readable stream to a Buffer
async function streamToBuffer(stream: Readable | ReadableStream | unknown): Promise<Buffer> {
  if (stream instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // Handle web ReadableStream
  if (typeof ReadableStream !== 'undefined' && stream instanceof ReadableStream) {
    const reader = (stream as ReadableStream).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  throw new Error('Unsupported stream type');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  // Rate limit: 300 image requests per minute per IP (prevents bandwidth abuse)
  const rl = await rateLimit(req, { limit: 300, window: 60 * 1000 });
  if (!rl.success) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: {
        'Content-Type': 'text/plain',
        'X-RateLimit-Reset': rl.resetAt.toISOString(),
        'Cache-Control': 'no-store',
      },
    });
  }

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

    const buffer = await streamToBuffer(response.Body);

    const contentType = response.ContentType || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    // Check if it's a NoSuchKey error (object doesn't exist in R2)
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    const isNotFound =
      err?.name === 'NoSuchKey' ||
      err?.$metadata?.httpStatusCode === 404;

    if (isNotFound) {
      // Return 404 so the frontend can show a proper fallback
      return new NextResponse('Image not found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
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