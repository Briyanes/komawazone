'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronUp } from 'lucide-react';

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const isChapterPage = pathname.includes('/chapter/');

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={
        isChapterPage
          // chapter page: reader bottom nav ~68px tall, add 12px gap = 80px
          ? 'fixed bottom-[80px] right-4 z-[60] flex size-10 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 md:bottom-[80px] md:right-6'
          // normal page: mobile above bottom nav (94px), desktop normal (24px)
          : 'fixed bottom-[94px] right-4 z-50 flex size-10 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 md:bottom-6 md:right-6'
      }
      style={{ background: 'var(--color-primary)', color: '#fff' }}
      aria-label="Back to top"
    >
      <ChevronUp size={18} />
    </button>
  );
}
