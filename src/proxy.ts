import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ── Rate limiting (in-memory, per IP) ─────────────────────────────────────────
const RATE_LIMIT = 60;
const WINDOW_MS  = 60_000;
const rlStore    = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(req: NextRequest): NextResponse | null {
  const ip  = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';
  const now = Date.now();
  const entry = rlStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rlStore.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
        'X-RateLimit-Limit': String(RATE_LIMIT),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(entry.resetAt),
      },
    });
  }
  return null;
}

export async function proxy(request: NextRequest) {
  // Rate-limit API routes
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/api/v1/manga') ||
    pathname.startsWith('/api/v1/search') ||
    pathname.startsWith('/api/v1/chapters')
  ) {
    const limited = checkRateLimit(request);
    if (limited) return limited;
  }

  let response = NextResponse.next({ request });

  // ── Supabase session refresh ───────────────────────────────────────
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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Route protection ───────────────────────────────────────────────
  // Admin routes: must be logged-in (role check happens server-side in the page)
  const isAdminRoute = pathname.startsWith('/admin');
  // Auth routes: redirect to home if already logged in
  const isAuthRoute =
    pathname.startsWith('/(auth)') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register');

  if (isAdminRoute && !user) {
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // ── Security headers ───────────────────────────────────────────────
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public files (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
