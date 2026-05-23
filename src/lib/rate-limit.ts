/**
 * Simple in-memory rate limiter for API routes
 * In production, use Redis or Upstash for distributed rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const limiters = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  window: number;
  /** Custom identifier generator (default: IP address) */
  keyGenerator?: (request: Request) => string | Promise<string>;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Rate limiter middleware for Next.js API routes
 *
 * @example
 * ```ts
 * import { rateLimit } from '@/lib/rate-limit';
 *
 * export async function POST(request: NextRequest) {
 *   const result = await rateLimit(request, { limit: 10, window: 60000 });
 *   if (!result.success) {
 *     return NextResponse.json(
 *       { error: 'Too many requests' },
 *       { status: 429, headers: { 'X-RateLimit-Reset': result.resetAt.toISOString() } }
 *     );
 *   }
 *   // ... your API logic
 * }
 * ```
 */
export async function rateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = config.keyGenerator
    ? await config.keyGenerator(request)
    : await getDefaultKey(request);

  const now = Date.now();
  const entry = limiters.get(key);

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanup(now);
  }

  if (!entry || now > entry.resetAt) {
    // Create new entry or reset expired
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.window,
    };
    limiters.set(key, newEntry);

    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt: new Date(newEntry.resetAt),
    };
  }

  // Increment count
  entry.count++;

  if (entry.count > config.limit) {
    // Rate limit exceeded
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      resetAt: new Date(entry.resetAt),
    };
  }

  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - entry.count,
    resetAt: new Date(entry.resetAt),
  };
}

/**
 * Get default identifier from request (IP address)
 */
async function getDefaultKey(request: Request): Promise<string> {
  // Try to get IP from headers
  const headers = Object.fromEntries(request.headers.entries());
  const forwardedFor = headers['x-forwarded-for'];
  const realIp = headers['x-real-ip'];
  const cfConnectingIp = headers['cf-connecting-ip'];

  const ip = forwardedFor?.split(',')[0]?.trim()
    || realIp
    || cfConnectingIp
    || 'unknown';

  return `ratelimit:${ip}`;
}

/**
 * Clean up expired entries
 */
function cleanup(now: number): void {
  for (const [key, entry] of limiters.entries()) {
    if (now > entry.resetAt) {
      limiters.delete(key);
    }
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const RateLimits = {
  /** Strict: 5 requests per minute for auth endpoints */
  auth: { limit: 5, window: 60 * 1000 },
  /** Moderate: 20 requests per minute for user actions */
  userAction: { limit: 20, window: 60 * 1000 },
  /** Relaxed: 100 requests per minute for general API */
  general: { limit: 100, window: 60 * 1000 },
  /** Search: 30 requests per minute */
  search: { limit: 30, window: 60 * 1000 },
} as const;
