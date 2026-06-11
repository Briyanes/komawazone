import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { HUB_DOMAIN, READER_DOMAIN, isHubAllowedPath } from '@/config/domains';

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // Normalize host (remove port for local dev)
  const cleanHost = host.split(':')[0];

  // --- HUB DOMAIN LOGIC (olluq.com) ---
  const isHubHost =
    cleanHost === HUB_DOMAIN ||
    cleanHost === `www.${HUB_DOMAIN}` ||
    cleanHost === 'localhost:3000';

  if (isHubHost) {
    // Redirect www to non-www
    if (cleanHost.startsWith('www.')) {
      const url = request.nextUrl.clone();
      url.host = HUB_DOMAIN;
      return NextResponse.redirect(url);
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

  // --- SUPABASE AUTH COOKIE HANDLING ---
  // Skip auth API routes — they handle cookies themselves
  if (pathname.startsWith('/api/v1/auth/')) {
    return NextResponse.next();
  }

  let response = NextResponse.next();

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

  return response;
}

export const config = {
  // Match all paths except static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/).*)',
  ],
};