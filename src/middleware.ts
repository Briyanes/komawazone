import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { HUB_DOMAIN, READER_DOMAIN, isHubAllowedPath } from '@/config/domains';

/** Subdomains that should redirect to the reader domain */
const READER_SUBDOMAINS = ['read', '01', 'www'];

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // Normalize host (remove port for local dev)
  const cleanHost = host.split(':')[0];

  // --- SUBDOMAIN REDIRECTS (read.olluq.com, 01.olluq.com, www.olluq.xyz) ---
  const parts = cleanHost.split('.');
  if (parts.length >= 3) {
    const subdomain = parts[0];
    const parentDomain = parts.slice(1).join('.');

    // read.olluq.com or 01.olluq.com → olluq.xyz
    if (parentDomain === HUB_DOMAIN && READER_SUBDOMAINS.includes(subdomain) && subdomain !== 'www') {
      const url = request.nextUrl.clone();
      url.protocol = 'https';
      url.host = READER_DOMAIN;
      url.port = '';
      return NextResponse.redirect(url, 301);
    }

    // www.olluq.xyz → olluq.xyz
    if (subdomain === 'www' && parentDomain === READER_DOMAIN) {
      const url = request.nextUrl.clone();
      url.protocol = 'https';
      url.host = READER_DOMAIN;
      url.port = '';
      return NextResponse.redirect(url, 301);
    }
  }

  // --- HUB DOMAIN LOGIC (olluq.com) ---
  const isHubHost =
    cleanHost === HUB_DOMAIN ||
    cleanHost === `www.${HUB_DOMAIN}`;

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

  // --- SUPABASE AUTH COOKIE HANDLING ---
  // Skip auth API routes — they handle cookies themselves
  // Skip admin routes — layout validates admin auth server-side
  if (pathname.startsWith('/api/v1/auth/') || pathname.startsWith('/admin')) {
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