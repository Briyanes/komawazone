import { NextRequest, NextResponse } from 'next/server';
import { HUB_DOMAIN, READER_DOMAIN, isHubAllowedPath } from '@/config/domains';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // Normalize host (remove port for local dev)
  const cleanHost = host.split(':')[0];

  // --- HUB DOMAIN LOGIC (olluq.com) ---
  // If user accesses a reader-only page on the hub domain → redirect to reader domain
  const isHubHost =
    cleanHost === HUB_DOMAIN ||
    cleanHost === `www.${HUB_DOMAIN}` ||
    cleanHost === 'localhost:3000'; // Local dev: treat as hub for testing

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
      return NextResponse.redirect(url, 302); // 302 temporary — doesn't pass link juice
    }
  }

  // --- READER DOMAIN LOGIC (olluq.xyz + subdomains) ---
  // If user accesses the hub landing page on reader domain → allow it (both domains serve all pages)
  // Reader domain serves everything, no restrictions

  return NextResponse.next();
}

export const config = {
  // Match all paths except static assets and API routes (handled by Next.js)
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons/* (icons)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons/).*)',
  ],
};