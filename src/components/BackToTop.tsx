'use client';

import { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-[94px] right-4 z-50 flex size-10 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 md:bottom-6 md:right-6"
      style={{ background: 'var(--color-primary)', color: '#fff' }}
      aria-label="Back to top"
    >
      <ChevronUp size={18} />
    </button>
  );
}
