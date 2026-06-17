'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronUp } from 'lucide-react';

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const isChapterPage = pathname.includes('/chapter/');

  useEffect(() => {
    // Reset visibility when route changes (avoid stale visible state)
    setVisible(false);

    const handler = () => setVisible(window.scrollY > 400);
    // Check immediately in case we land mid-page (e.g. browser back/forward)
    handler();

    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [pathname]);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={
        isChapterPage
          // chapter page: reader bottom nav (~64px) + safe-area + 16px gap
          ? 'fixed right-4 z-[60] flex size-10 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 md:right-6'
          // normal page: above floating bottom nav + safe-area
          : 'fixed right-4 z-50 flex size-10 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 md:bottom-6 md:right-6'
      }
      style={{
        background: 'var(--color-primary)',
        color: '#fff',
        // Dynamic bottom: hard-coded gap + iOS safe-area inset
        bottom: isChapterPage
          ? 'calc(80px + env(safe-area-inset-bottom))'
          : 'calc(94px + env(safe-area-inset-bottom))',
      }}
      aria-label="Back to top"
    >
      <ChevronUp size={18} />
    </button>
  );
}
