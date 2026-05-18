'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, ChevronLeft, ChevronRight, Star, Eye } from 'lucide-react';

interface FeaturedItem {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  banner_url?: string | null;
  description?: string | null;
  genres?: string[];
  status: string;
  rating: number;
  views: number;
}

export function FeaturedHero({ items }: { items: FeaturedItem[] }) {
  const [active, setActive] = useState(0);

  if (items.length === 0) return null;
  const manga = items[active];
  const bg = manga.banner_url ?? manga.cover_url;

  return (
    <section className="relative overflow-hidden rounded-2xl" style={{ minHeight: 'clamp(260px, 35vw, 420px)' }}>
      {/* Background */}
      <div className="absolute inset-0">
        {bg && (
          <Image src={bg} alt="" fill className="object-cover" style={{ filter: 'blur(2px) brightness(0.35)' }} sizes="100vw" priority />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 100%)' }} />
      </div>

      {/* Content */}
      <div className="relative flex flex-col justify-end gap-3 px-5 py-5 md:flex-row md:items-end md:gap-6 md:px-8 md:py-8" style={{ minHeight: 'clamp(260px, 35vw, 420px)' }}>
        {/* Cover thumbnail — bigger on desktop */}
        {manga.cover_url && (
          <div className="hidden md:block shrink-0">
            <div className="relative overflow-hidden rounded-xl shadow-2xl"
              style={{ width: 120, aspectRatio: '2/3', border: '2px solid rgba(255,255,255,0.1)' }}>
              <Image src={manga.cover_url} alt={manga.title} fill className="object-cover" sizes="120px" />
            </div>
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Genres */}
          {manga.genres && manga.genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {manga.genres.slice(0, 3).map(g => (
                <span key={g} className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white/70"
                  style={{ background: 'rgba(255,107,53,0.3)', border: '1px solid rgba(255,107,53,0.4)' }}>
                  {g}
                </span>
              ))}
            </div>
          )}
          <h2 className="text-2xl font-bold text-white leading-tight md:text-3xl line-clamp-2" style={{ fontFamily: 'var(--font-playfair, serif)' }}>
            {manga.title}
          </h2>
          {manga.description && (
            <p className="text-sm text-white/60 line-clamp-2 hidden md:block">{manga.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-white/50">
            {manga.rating > 0 && (
              <span className="flex items-center gap-1"><Star size={11} fill="#F59E0B" stroke="none" />{manga.rating.toFixed(1)}</span>
            )}
            {manga.views > 0 && (
              <span className="flex items-center gap-1"><Eye size={11} />{manga.views >= 1000 ? `${(manga.views/1000).toFixed(1)}K` : manga.views}</span>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Link
              href={`/manga/${manga.slug}`}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-primary)' }}
            >
              <BookOpen size={15} /> Baca Sekarang
            </Link>
          </div>
        </div>

        {/* Dots + arrows */}
        {items.length > 1 && (
          <div className="flex items-center gap-2 md:self-center">
            <button
              onClick={() => setActive(p => (p - 1 + items.length) % items.length)}
              className="flex size-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex gap-1.5">
              {items.map((_, i) => (
                <button key={i} onClick={() => setActive(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === active ? 20 : 6, background: i === active ? 'var(--color-primary)' : 'rgba(255,255,255,0.35)' }}
                />
              ))}
            </div>
            <button
              onClick={() => setActive(p => (p + 1) % items.length)}
              className="flex size-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
