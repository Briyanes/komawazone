import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { HUB_DOMAIN, READER_DOMAIN, isHubAllowedPath } from '@/config/domains';

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // Normalize host (remove port for local dev)
  const cleanHost = host.split(':')[0];

  // --- SUPABASE AUTH COOKIE HANDLING ---
  // This ensures PKCE cookies and session cookies are always in sync
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
          // Set on request so downstream handlers can read them
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Set on response so browser stores them
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — this also ensures cookies are properly set
  await supabase.auth.getUser();

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
      response = NextResponse.redirect(url);
      // Re-apply cookies on new response
      return response;
    }

    // If the path is not allowed on hub → redirect to reader domain
    if (!isHubAllowedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.protocol = 'https';
      url.host = READER_DOMAIN;
      url.port = '';
      response = NextResponse.redirect(url, 302);
      return response;
    }
  }

  return response;
}

export const config = {
  // Match all paths except static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/).*)',
  ],
};