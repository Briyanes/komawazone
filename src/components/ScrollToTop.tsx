'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ScrollToTop — Resets scroll position to top on every route change.
 *
 * WHY: Next.js App Router's built-in scroll restoration can fail when:
 *   1. `scroll-behavior: smooth` is set globally (animation interrupted by re-render)
 *   2. loading.tsx delays content with minDisplayMs (scroll captured by overlay)
 *   3. Browser restores previous scroll position from history
 *
 * This hook force-resets to (0,0) instantly on pathname change, ensuring
 * users always see the top of the new page.
 */
export function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    // Instant jump (no smooth animation) — critical for route navigation
    window.scrollTo(0, 0);
    // Also reset document scroll (some mobile browsers use this)
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return null;
}