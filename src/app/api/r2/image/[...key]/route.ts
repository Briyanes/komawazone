import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * GET /api/r2/image/[...key]
 *
 * Serves images stored in Cloudflare R2 through our server.
 * The R2 public dev URL (pub-xxx.r2.dev) is unreliable and often returns 403.
 * This route reads from R2 via the S3 API and serves the image with proper caching.
 *
 * Example: /api/r2/image/chapters/473ad2ac-c46a-46b5-b2b0-4bf86e17d3d6/5.jpg
 */
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const CACHE_TIMEOUT = 10; // seconds to wait for R2

export async function GET(
  _req: NextRequest,
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

    // Use AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CACHE_TIMEOUT * 1000);

    const response = await s3Client.send(command, {
      abortSignal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.Body) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const reader = (response.Body as ReadableStream).getReader();
    // @ts-expect-error - ReadableStream type compatibility
    for await (const chunk of reader) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const contentType = response.ContentType || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[R2 Proxy] Error fetching:', key, error instanceof Error ? error.message : error);

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Timeout fetching image' }, { status: 504 });
    }

    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}