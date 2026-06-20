import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  const missing = [
    !accountId && 'R2_ACCOUNT_ID',
    !accessKeyId && 'R2_ACCESS_KEY_ID',
    !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
    !bucket && 'R2_BUCKET',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`R2 config incomplete: missing ${missing.join(', ')}`);
  }

  return {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    publicBaseUrl: publicBaseUrl?.trim() || undefined,
  };
}

function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function sanitizeFolder(folder: string): string {
  const normalized = folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) return 'uploads';
  if (!/^[a-zA-Z0-9/_-]+$/.test(normalized)) {
    throw new Error('Invalid folder format');
  }
  return normalized;
}

function inferExtension(fileName: string, contentType: string): string {
  const fromName = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName) return fromName;
  return MIME_EXTENSIONS[contentType] ?? 'bin';
}

export function buildR2PublicUrl(key: string): string {
  // CRITICAL: Cloudflare R2 public dev URLs (pub-*.r2.dev) are UNRELIABLE and
  // frequently return 403/404. The S3 API endpoint is NOT publicly accessible.
  //
  // We serve ALL R2 images through our own Next.js proxy route which reads
  // from R2 via the S3 API server-side. This is 100% reliable.
  //
  // Route: /api/r2/image/[...key]  →  reads from R2 → serves image with caching
  //
  // R2_PUBLIC_BASE_URL is still respected for backward compatibility (e.g.
  // if a custom domain is configured in future), but defaults to our proxy.
  const config = getR2Config();
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
  // Default: serve through our own API proxy route (works everywhere)
  return `/api/r2/image/${key}`;
}

export async function uploadBufferToR2(input: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  folder: string;
}): Promise<{ key: string; url: string }> {
  const config = getR2Config();
  const client = createR2Client(config);

  const folder = sanitizeFolder(input.folder);
  const extension = inferExtension(input.fileName, input.contentType);
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: input.buffer,
    ContentType: input.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return { key, url: buildR2PublicUrl(key) };
}

export async function deleteObjectFromR2(key: string): Promise<void> {
  const config = getR2Config();
  const client = createR2Client(config);

  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }));
}

export function extractR2ObjectKey(url: string): string | null {
  const config = getR2Config();

  if (config.publicBaseUrl) {
    const base = config.publicBaseUrl.replace(/\/$/, '');
    if (url.startsWith(`${base}/`)) {
      return url.slice(base.length + 1);
    }
  }

  // Our proxy route: /api/r2/image/{key}
  if (url.startsWith('/api/r2/image/')) {
    return url.slice('/api/r2/image/'.length);
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, '');
    if (!path) return null;

    // For endpoint style URLs: /bucket/key
    if (path.startsWith(`${config.bucket}/`)) {
      return path.slice(config.bucket.length + 1);
    }

    return path;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is an R2 URL (vs external source URL)
 */
export function isR2Url(url: string): boolean {
  const config = getR2Config();
  if (config.publicBaseUrl && url.startsWith(config.publicBaseUrl)) {
    return true;
  }
  // Our proxy route = R2
  if (url.startsWith('/api/r2/image/')) return true;
  return url.includes('.r2.cloudflarestorage.com');
}

/**
 * Download image from URL and upload to R2
 * Falls back to original URL if download/upload fails
 */
export async function downloadAndUploadToR2(
  imageUrl: string,
  folder: 'covers' | 'banners' | 'pages' | 'thumbnails',
  fileNameHint?: string,
  downloadOptions?: { maxRetries?: number; timeout?: number }
): Promise<{ key: string | null; url: string }> {
  try {
    const { downloadImageWithRetry } = await import('./image-downloader');
    const { buffer, contentType } = await downloadImageWithRetry(imageUrl, downloadOptions);

    const { key, url } = await uploadBufferToR2({
      buffer,
      contentType,
      fileName: fileNameHint || 'image',
      folder,
    });

    return { key, url };
  } catch (error) {
    console.warn(`[R2] Failed to download/upload ${imageUrl}, using original URL:`, error instanceof Error ? error.message : error);
    return { key: null, url: imageUrl };
  }
}

/**
 * Batch download and upload images to R2
 * Returns array of { originalUrl, key, url } with null values for failures
 */
export async function batchDownloadAndUploadToR2(
  imageUrls: string[],
  folder: 'pages' | 'thumbnails',
  fileNameHint?: string
): Promise<Array<{ originalUrl: string; key: string | null; url: string }>> {
  const { downloadImagesInParallel } = await import('./image-downloader');

  const downloadResults = await downloadImagesInParallel(imageUrls, { concurrency: 3 });

  const results = await Promise.all(
    downloadResults.map(async ({ url, result, error }) => {
      if (!result) {
        console.warn(`[R2] Failed to download ${url}: ${error}`);
        return { originalUrl: url, key: null, url };
      }

      try {
        const { buffer, contentType } = result;
        const { key, url: r2Url } = await uploadBufferToR2({
          buffer,
          contentType,
          fileName: fileNameHint || 'image',
          folder,
        });
        return { originalUrl: url, key, url: r2Url };
      } catch (error) {
        console.warn(`[R2] Failed to upload ${url}:`, error instanceof Error ? error.message : error);
        return { originalUrl: url, key: null, url };
      }
    })
  );

  return results;
}
