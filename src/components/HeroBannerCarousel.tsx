'use client';

import { useState } from 'react';
import Image from 'next/image';
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
    <div className="relative w-full">
      {/* Carousel container */}
      <div className="flex items-center justify-center gap-3">
        {/* Left arrow */}
        <button
          onClick={prev}
          className="hidden sm:flex size-9 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <ChevronLeft size={18} color="white" />
        </button>

        {/* Carousel items */}
        <div className="flex gap-2 sm:gap-4 overflow-hidden">
          {indices.map((i, pos) => {
            const item = items[i];
            const isCurrent = pos === 1;

            return (
              <Link
                key={i}
                href={`/manga/${item.slug}`}
                className="shrink-0 transition-all duration-300"
                style={{
                  width: isCurrent ? 'clamp(120px, 15vw, 160px)' : 'clamp(80px, 10vw, 110px)',
                  opacity: isCurrent ? 1 : 0.5,
                  transform: isCurrent ? 'scale(1)' : 'scale(0.9)',
                }}
              >
                <div
                  className="relative overflow-hidden rounded-lg shadow-lg"
                  style={{
                    aspectRatio: '2/3',
                    border: isCurrent ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: isCurrent ? '0 8px 24px rgba(255,107,53,0.4)' : 'none',
                  }}
                >
                  {item.cover_url ? (
                    <Image
                      src={item.cover_url}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes={isCurrent ? '160px' : '110px'}
                      priority={isCurrent}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-[var(--bg-tertiary)]">
                      <span className="text-3xl opacity-30">📖</span>
                    </div>
                  )}
                  {/* Title overlay — center */}
                  {isCurrent && (
                    <div
                      className="absolute inset-0 flex items-end p-2"
                      style={{
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                      }}
                    >
                      <p className="text-xs font-bold text-white line-clamp-2 leading-tight">
                        {item.title}
                      </p>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Right arrow */}
        <button
          onClick={next}
          className="hidden sm:flex size-9 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.1)',
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
