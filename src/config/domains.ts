/**
 * Domain configuration for OLLUQ multi-domain architecture
 *
 * olluq.com  → Hub/Landing page (clean, safe for social media bio)
 * olluq.xyz  → Full manga reader (all content)
 *
 * To change the reader domain (e.g. if banned), update NEXT_PUBLIC_READER_DOMAIN env var.
 */

export const HUB_DOMAIN = process.env.NEXT_PUBLIC_HUB_DOMAIN || 'olluq.com';
export const READER_DOMAIN = process.env.NEXT_PUBLIC_READER_DOMAIN || 'read.olluq.xyz';

/** Hub pages that are allowed on the HUB domain */
export const HUB_ALLOWED_PATHS = [
  '/',           // Landing page
  '/about',
  '/contact',
  '/terms',
  '/privacy',
];

/** Check if a path is allowed on the hub domain */
export function isHubAllowedPath(pathname: string): boolean {
  // Allow static assets, API routes, and auth routes on any domain
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico')
  ) {
    return true;
  }

  // Auth routes work on both domains
  if (pathname.startsWith('/login') || pathname.startsWith('/register') ||
      pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')) {
    return true;
  }

  return HUB_ALLOWED_PATHS.some(p => pathname === p);
}

/** Build the reader URL for a given path */
export function getReaderUrl(path: string): string {
  const domain = READER_DOMAIN;
  return `https://${domain}${path}`;
}