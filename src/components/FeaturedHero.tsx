'use client';

import { useState, useEffect, useCallback } from 'react';
import MangaImage from '@/components/ui/MangaImage';
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

const AUTO_ADVANCE_MS = 6000;

export function FeaturedHero({ items }: { items: FeaturedItem[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setActive(p => (p + 1) % items.length), [items.length]);
  const prev = useCallback(() => setActive(p => (p - 1 + items.length) % items.length), [items.length]);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const t = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [active, paused, next, items.length]);

  if (items.length === 0) return null;

  const manga = items[active];
  const bg = manga.banner_url ?? manga.cover_url;
  
  return (
    <section
      className="relative overflow-hidden rounded-2xl select-none"
      style={{ minHeight: 'clamp(300px, 42vw, 500px)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Background — blurred cover ── */}
      <div className="absolute inset-0 transition-all duration-1000">
        {bg && (
          <MangaImage
            key={bg}
            src={bg} alt="" fill priority
            className="object-cover transition-all duration-1000"
            style={{ filter: 'blur(10px) brightness(0.18) saturate(1.4)' }}
            sizes="100vw"
          />
        )}
        {/* Left-to-right content gradient */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(110deg, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.75) 38%, rgba(0,0,0,0.25) 65%, transparent 100%)' }} />
        {/* Bottom vignette */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 35%)' }} />
      </div>

      {/* ── Prev / Next arrows ── */}
      {items.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 hidden md:flex size-10 items-center justify-center rounded-full z-10 transition-all hover:scale-110 active:scale-95"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <ChevronLeft size={20} color="white" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex size-10 items-center justify-center rounded-full z-10 transition-all hover:scale-110 active:scale-95"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <ChevronRight size={20} color="white" />
          </button>
        </>
      )}

      {/* ── Main content ── */}
      <div
        className="relative flex items-end gap-5 px-5 pb-10 pt-6 sm:items-center sm:pb-6 md:gap-8 md:px-10 md:py-10"
        style={{ minHeight: 'clamp(300px, 42vw, 500px)' }}
      >
        {/* Cover thumbnail */}
        {manga.cover_url && (
          <div key={manga.id + '-cover'} className="hidden sm:block shrink-0" style={{ animation: 'fade-in 0.5s ease' }}>
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{
                width: 'clamp(100px, 10vw, 150px)',
                aspectRatio: '2/3',
                border: '2px solid rgba(255,255,255,0.12)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
              }}
            >
              <MangaImage src={manga.cover_url} alt={manga.title} fill className="object-cover" sizes="150px" priority />
            </div>
          </div>
        )}

        {/* Info panel */}
        <div key={active} className="flex-1 min-w-0 space-y-3" style={{ animation: 'fade-in 0.45s ease' }}>
          {/* Top badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-white"
              style={{ background: 'var(--color-primary)', boxShadow: '0 4px 12px rgba(255,107,53,0.4)' }}
            >
              ★ Featured
            </span>
            {manga.status && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white/70 capitalize"
                style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {manga.status.toLowerCase()}
              </span>
            )}
          </div>

          {/* Genre pills */}
          {manga.genres && manga.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manga.genres.slice(0, 4).map(g => (
                <span
                  key={g}
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-white/65"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h2
            className="text-2xl font-black text-white leading-[1.15] md:text-[clamp(1.75rem,3vw,2.5rem)] line-clamp-2"
            style={{ fontFamily: 'var(--font-playfair, serif)', textShadow: '0 2px 24px rgba(0,0,0,0.6)' }}
          >
            {manga.title}
          </h2>

          {/* Description */}
          {manga.description && (
            <p className="hidden md:block text-sm text-white/50 line-clamp-2 leading-relaxed max-w-lg">
              {manga.description}
            </p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-2 flex-wrap">
            {manga.rating > 0 && (
              <span
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white/80"
                style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}
              >
                <Star size={11} fill="#F59E0B" stroke="none" />
                {manga.rating.toFixed(1)}
              </span>
            )}
            {manga.views > 0 && (
              <span
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white/55"
                style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}
              >
                <Eye size={11} />
                {manga.views >= 1000 ? `${(manga.views / 1000).toFixed(1)}K` : manga.views}
              </span>
            )}
          </div>

          {/* CTAs */}
          <div className="flex items-center gap-2 pt-0.5">
            <Link
              href={`/manga/${manga.slug}`}
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'var(--color-primary)', boxShadow: '0 8px 28px rgba(255,107,53,0.45)' }}
            >
              <BookOpen size={15} /> Baca Sekarang
            </Link>
            <Link
              href={`/manga/${manga.slug}`}
              className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white/80 transition-all hover:bg-white/15 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              Detail
            </Link>
          </div>
        </div>

        {/* ── Thumbnail strip (right side, desktop) ── */}
        {items.length > 1 && (
          <div className="hidden lg:flex flex-col gap-2 shrink-0">
            {items.map((item, i) => (
              <button
                key={item.id}
                onClick={() => setActive(i)}
                className="relative overflow-hidden rounded-xl transition-all"
                style={{
                  width: 52, aspectRatio: '2/3',
                  opacity: i === active ? 1 : 0.4,
                  transform: i === active ? 'scale(1.05)' : 'scale(1)',
                  border: i === active ? '2px solid var(--color-primary)' : '2px solid transparent',
                  boxShadow: i === active ? '0 4px 16px rgba(255,107,53,0.5)' : 'none',
                }}
              >
                {item.cover_url && (
                  <MangaImage src={item.cover_url} alt={item.title} fill className="object-cover" sizes="52px" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Dots (mobile / small) ── */}
      {items.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex lg:hidden justify-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: i === active ? 22 : 5,
                background: i === active ? 'var(--color-primary)' : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Auto-advance progress bar ── */}
      {items.length > 1 && !paused && (
        <div
          key={active}
          className="absolute bottom-0 left-0 h-0.5 rounded-full"
          style={{
            background: 'var(--color-primary)',
            animation: `progress-fill ${AUTO_ADVANCE_MS}ms linear forwards`,
          }}
        />
      )}
    </section>
  );
}
