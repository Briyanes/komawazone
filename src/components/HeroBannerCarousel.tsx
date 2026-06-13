'use client';

import { useState, useEffect, useCallback } from 'react';
import MangaImage from '@/components/ui/MangaImage';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { decodeHtml } from '@/lib/cn';

interface MangaItem {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
}

const AUTO_ADVANCE_MS = 4000;

export function HeroBannerCarousel({ items, compact }: { items: MangaItem[]; compact?: boolean }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setActive(p => (p + 1) % items.length), [items.length]);
  const prev = useCallback(() => setActive(p => (p - 1 + items.length) % items.length), [items.length]);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const t = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [active, paused, next, items.length]);

  // Show 3 items at a time (prev, current, next) — but only 1 if there's only 1 item
  const indices = items.length === 1 ? [0] : [active - 1, active, active + 1].map(i => (i + items.length) % items.length);

  if (!items || items.length === 0) return null;

  return (
    <div
      className={`relative w-full${compact ? ' overflow-hidden' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* Carousel container */}
      <div className="relative flex items-center justify-center">
        {/* Left arrow — overlaid on the left side (hidden when only 1 item) */}
        {items.length > 1 && (
        <button
          onClick={() => { setPaused(false); prev(); }}
          className="absolute left-0 z-10 flex size-12 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <ChevronLeft size={20} color="white" />
        </button>
        )}

        {/* Carousel items */}
        <div className={`flex items-center justify-center gap-3 ${compact ? 'px-8 pt-6 pb-10' : 'sm:gap-5 px-12'}`}>
          {indices.map((i, pos) => {
            const item = items[i];
            // When only 1 item (indices=[0]), pos is 0 — so treat the only item as current
            const isCurrent = indices.length === 1 ? true : pos === 1;

            return (
              <Link
                key={`pos-${pos}`}
                href={`/manga/${item.slug}`}
                className="shrink-0 transition-all duration-300"
                style={{
                  width: isCurrent
                    ? (compact ? 'clamp(100px, 30vw, 150px)' : 'clamp(150px, 20vw, 220px)')
                    : (compact ? 'clamp(70px, 20vw, 110px)' : 'clamp(110px, 14vw, 160px)'),
                  opacity: isCurrent ? 1 : 0.55,
                  transform: isCurrent ? 'scale(1.05)' : 'scale(0.92)',
                  zIndex: isCurrent ? 1 : 0,
                }}
              >
                <div
                  className="relative overflow-hidden rounded-xl shadow-xl"
                  style={{
                    aspectRatio: '2/3',
                    border: isCurrent ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: isCurrent ? '0 12px 40px rgba(255,107,53,0.5)' : '0 4px 16px rgba(0,0,0,0.4)',
                  }}
                >
                  {item.cover_url ? (
                    <MangaImage
                      src={item.cover_url}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 42vw, 220px"
                      priority={isCurrent}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-[var(--bg-tertiary)]">
                      <span className="text-3xl opacity-30">📖</span>
                    </div>
                  )}
                  {/* Title overlay */}
                  <div
                    className="absolute inset-0 flex items-end p-3"
                    style={{
                      background: isCurrent
                        ? 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)'
                        : 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)',
                    }}
                  >
                    <p className={`font-bold text-white line-clamp-2 leading-tight ${isCurrent ? 'text-sm' : 'text-xs opacity-80'}`}>
                      {decodeHtml(item.title)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Right arrow — overlaid on the right side (hidden when only 1 item) */}
        {items.length > 1 && (
        <button
          onClick={() => { setPaused(false); next(); }}
          className="absolute right-0 z-10 flex size-12 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <ChevronRight size={20} color="white" />
        </button>
        )}
      </div>

      {/* Dots indicator */}
      <div className="mt-3 flex justify-center gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className="h-1 rounded-full transition-all duration-300"
            style={{
              width: i === active ? 16 : 6,
              background: i === active ? 'var(--color-primary)' : 'rgba(255,255,255,0.2)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
