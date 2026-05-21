'use client';

import { useState } from 'react';
import MangaImage from '@/components/ui/MangaImage';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MangaItem {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
}

export function HeroBannerCarousel({ items }: { items: MangaItem[] }) {
  const [active, setActive] = useState(0);

  if (!items || items.length === 0) return null;

  const prev = () => setActive(p => (p - 1 + items.length) % items.length);
  const next = () => setActive(p => (p + 1) % items.length);

  // Show 3 items at a time (prev, current, next)
  const getIndices = () => {
    const indices = [];
    for (let i = -1; i <= 1; i++) {
      indices.push((active + i + items.length) % items.length);
    }
    return indices;
  };

  const indices = getIndices();

  return (
    <div className="relative w-full overflow-hidden">
      {/* Carousel container */}
      <div className="relative flex w-full items-center justify-center">
        {/* Left arrow — overlaid on the left side */}
        <button
          onClick={prev}
          className="absolute left-0 z-10 flex size-9 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <ChevronLeft size={18} color="white" />
        </button>

        {/* Carousel items */}
        <div className="flex items-center justify-center gap-2 px-10">
          {indices.map((i, pos) => {
            const item = items[i];
            const isCurrent = pos === 1;

            return (
              <Link
                key={`pos-${pos}`}
                href={`/manga/${item.slug}`}
                className="shrink-0 transition-all duration-300"
                style={{
                  width: isCurrent ? 'min(34vw, 220px)' : 'min(23vw, 160px)',
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
                      {item.title}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Right arrow — overlaid on the right side */}
        <button
          onClick={next}
          className="absolute right-0 z-10 flex size-9 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <ChevronRight size={18} color="white" />
        </button>
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
