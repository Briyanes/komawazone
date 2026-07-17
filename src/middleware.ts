import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { HUB_DOMAIN, READER_DOMAIN, isHubAllowedPath } from '@/config/domains';

/**
 * Lightweight in-memory rate limiter (per Edge instance).
 * Protects sensitive API endpoints from brute-force / spam.
 * Limit: 60 requests per minute per IP for admin/auth/write endpoints.
 */
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 req/min
const RATE_LIMIT_PATHS = [
  '/api/v1/admin/',
  '/api/v1/auth/',
  '/api/v1/user/',
  '/api/v1/vip/',
];

interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, newEntry);
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: newEntry.resetAt };
  }

  entry.count++;
  const allowed = entry.count <= RATE_LIMIT_MAX;

  // Periodic cleanup (every 1000th request)
  if (entry.count % 1000 === 0) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }

  return { allowed, remaining: Math.max(0, RATE_LIMIT_MAX - entry.count), resetAt: entry.resetAt };
}

/**
 * R2 image proxy hotlink protection.
 * Allow requests only when:
 *   - Host header matches our domains, OR
 *   - Referer header matches our domains, OR
 *   - No referer (direct access from app, Next.js Image optimization, etc.) — allowed to avoid breaking SSR
 * Block obvious hotlinking from third-party domains.
 */
const ALLOWED_IMAGE_REFERRERS = [
  'olluq.xyz',
  'olluq.com',
  'olluq.app',
  'localhost',
  'vercel.app', // preview deployments
];

const READER_SUBDOMAINS = ['read', '01', 'www'];


/**
 * Log suspicious activity (could be extended to write to DB / Sentry)
 */
function logSuspiciousActivity(
  type: string,
  request: NextRequest,
  extra?: Record<string, unknown>
) {
  console.warn(`[SECURITY:${type}]`, {
    ip:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown',
    ua: request.headers.get('user-agent')?.slice(0, 120),
    path: request.nextUrl.pathname,
    referer: request.headers.get('referer'),
    ts: new Date().toISOString(),
    ...extra,
  });
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const userAgent = request.headers.get('user-agent');

  // Normalize host (remove port for local dev)
  const cleanHost = host.split(':')[0];

  // --- HONEYTRAP / SCRAPING DETECTION ---
  // If someone hits these obvious scraper-bait paths, log + 404
  const honeypotPaths = [
    '/api/scrape-bait',
    '/api/admin-secret',
    '/wp-admin',
    '/.env',
    '/xmlrpc.php',
  ];
  if (honeypotPaths.some((p) => pathname.startsWith(p))) {
    logSuspiciousActivity('HONEYPOT', request);
    return new NextResponse('Not Found', { status: 404 });
  }

  // --- BLOCK MALICIOUS USER-AGENTS (scrapers, downloaders) ---
  // ⚠️ DISABLED: Blokir user-real browser users (termasuk Incognito).
  // Hanya honeypot + hotlink protection yang aktif sekarang.
  // Untuk re-enable, uncomment block di bawah.
  //
  // if (
  //   !pathname.startsWith('/api/sitemap') &&
  //   !pathname.startsWith('/robots') &&
  //   !pathname.startsWith('/manifest') &&
  //   !pathname.startsWith('/favicon') &&
  //   pathname !== '/hub'
  // ) {
  //   if (userAgent && !isLegitimateBrowserUA(userAgent)) {
  //     logSuspiciousActivity('BLOCKED_UA', request, { ua_snippet: userAgent.slice(0, 120) });
  //     return new NextResponse('Access Denied', {
  //       status: 403,
  //       headers: { 'Content-Type': 'text/plain' },
  //     });
  //   }
  // }

  // --- RATE LIMITING (sensitive API endpoints) ---
  if (RATE_LIMIT_PATHS.some((p) => pathname.startsWith(p))) {
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    const { allowed, remaining, resetAt } = checkRateLimit(clientIp);

    if (!allowed) {
      logSuspiciousActivity('RATE_LIMIT', request, { ip: clientIp });
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(resetAt),
          },
        }
      );
    }
  }

  // --- SUBDOMAIN REDIRECTS (read.olluq.com, 01.olluq.com, www.olluq.xyz) ---
  const parts = cleanHost.split('.');
  if (parts.length >= 3) {
    const subdomain = parts[0];
    const parentDomain = parts.slice(1).join('.');

    // read.olluq.com or 01.olluq.com → olluq.xyz
    if (
      parentDomain === HUB_DOMAIN &&
      READER_SUBDOMAINS.includes(subdomain) &&
      subdomain !== 'www'
    ) {
      const url = request.nextUrl.clone();
      url.protocol = 'https';
      url.host = READER_DOMAIN;
      url.port = '';
      return NextResponse.redirect(url, 301);
    }

    // *.olluq.xyz → olluq.xyz (www, read, 01, etc.)
    if (parentDomain === READER_DOMAIN && subdomain !== '') {
      const url = request.nextUrl.clone();
      url.protocol = 'https';
      url.host = READER_DOMAIN;
      url.port = '';
      return NextResponse.redirect(url, 301);
    }
  }

  // --- HUB DOMAIN LOGIC (olluq.com) ---
  const isHubHost = cleanHost === HUB_DOMAIN || cleanHost === `www.${HUB_DOMAIN}`;

  if (isHubHost) {
    // Redirect www to non-www
    if (cleanHost.startsWith('www.')) {
      const url = request.nextUrl.clone();
      url.host = HUB_DOMAIN;
      return NextResponse.redirect(url);
    }

    // Hub homepage → serve the link bio page (internal rewrite)
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/hub';
      return NextResponse.rewrite(url);
    }

    // If the path is not allowed on hub → redirect to reader domain
    if (!isHubAllowedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.protocol = 'https';
      url.host = READER_DOMAIN;
      url.port = '';
      return NextResponse.redirect(url, 302);
    }
  }

  // --- R2 IMAGE HOTLINK PROTECTION ---
  // Block third-party websites from embedding our R2 images directly.
  if (pathname.startsWith('/api/r2/image/')) {
    const referer = request.headers.get('referer') ?? '';
    const origin = request.headers.get('origin') ?? '';

    // If there's a referer, it must match our domains
    // Empty referer (direct browser access / app requests) is allowed
    if (referer || origin) {
      const source = referer || origin;
      const isAllowed = ALLOWED_IMAGE_REFERRERS.some(
        (domain) => source.includes(domain)
      );
      if (!isAllowed) {
        logSuspiciousActivity('HOTLINK_BLOCK', request, { referer, origin });
        // Return 403 for hotlinked requests
        return new NextResponse('Forbidden', {
          status: 403,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }
  }

  // --- SUPABASE AUTH COOKIE HANDLING ---
  // Skip auth API routes — they handle cookies themselves
  // Skip admin routes — layout validates admin auth server-side
  if (pathname.startsWith('/api/v1/auth/') || pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session
  await supabase.auth.getUser();

  // --- SECURITY HEADERS (apply to all responses) ---
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), browsing-topics=()'
  );

  // --- X-ROBOTS-TAG FOR API RESPONSES ---
  // Prevent Google from indexing JSON API endpoints (saves crawl budget, prevents data exposure)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/sitemap')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
}

export const config = {
  // Match all paths except static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/).*)',
  ],
};