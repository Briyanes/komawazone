export const revalidate = 300; // 5 minutes ISR

import Link from 'next/link';
import { Suspense } from 'react';
import { TrendingUp, Clock, ChevronRight, Flame, Sparkles, CheckCircle2 } from 'lucide-react';
import { getLatestManga, getPopularManga, getFeaturedManga, getTopThisWeek, getTopToday, getNewTitles, getCompletedManga, getRekomByType } from '@/lib/api/manga';
import { MangaGrid } from '@/components/manga/MangaGrid';
import { PopularTabs } from '@/components/manga/PopularTabs';
import { RekomTabs } from '@/components/manga/RekomTabs';
import { MangaCardSkeleton } from '@/components/ui/Skeleton';
import { AdZone } from '@/components/ads/AdZone';
import { ContinueReading } from '@/components/ContinueReading';
import { FeaturedHero } from '@/components/FeaturedHero';
import { GenreBar } from '@/components/GenreBar';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-10">
      {/* Top ad banner */}
      <Suspense fallback={null}>
        <AdZone placement="HOME_TOP" className="w-full" />
      </Suspense>

      {/* Featured hero */}
      <Suspense fallback={<StaticHero />}>
        <HeroSection />
      </Suspense>

      {/* Genre quick-nav bar */}
      <Suspense fallback={null}>
        <GenreBar />
      </Suspense>

      {/* Continue Reading (server for logged-in, localStorage for guest) */}
      <ContinueReading />

      {/* Latest Updates */}
      <section>
        <SectionHeader title="Update Terbaru" icon={<Clock size={18} />} href="/search?sort=latest" />
        <Suspense fallback={<SkeletonGrid />}>
          <LatestMangaSection />
        </Suspense>
      </section>

      {/* Mid-page ad */}
      <Suspense fallback={null}>
        <AdZone placement="HOME_MID" className="w-full" />
      </Suspense>

      {/* Populer — Harian / Mingguan / Semua */}
      <section>
        <SectionHeader title="Populer" icon={<Flame size={18} />} href="/search?sort=popular" />
        <Suspense fallback={<SkeletonGrid />}>
          <PopularSection />
        </Suspense>
      </section>

      {/* New Titles */}
      <section>
        <SectionHeader title="Judul Baru" icon={<Sparkles size={18} />} href="/search?sort=newest" />
        <Suspense fallback={<SkeletonGrid />}>
          <NewTitlesSection />
        </Suspense>
      </section>

      {/* Rekomendasi — All / Manhwa / Manga / Manhua */}
      <section>
        <SectionHeader title="Rekomendasi" icon={<TrendingUp size={18} />} href="/search?sort=rating" />
        <Suspense fallback={<SkeletonGrid />}>
          <RekomSection />
        </Suspense>
      </section>

      {/* Completed — readers love these */}
      <section>
        <SectionHeader title="Sudah Tamat" icon={<CheckCircle2 size={18} />} href="/search?status=COMPLETED" />
        <Suspense fallback={<SkeletonGrid />}>
          <CompletedSection />
        </Suspense>
      </section>

      {/* Bottom ad */}
      <Suspense fallback={null}>
        <AdZone placement="HOME_BOTTOM" className="w-full" />
      </Suspense>
    </div>
  );
}

async function LatestMangaSection() {
  const items = await getLatestManga(12).catch(() => []);
  return <MangaGrid items={items as Parameters<typeof MangaGrid>[0]['items']} />;
}

async function PopularSection() {
  const [daily, weekly, allTime] = await Promise.all([
    getTopToday(12).catch(() => []),
    getTopThisWeek(12).catch(() => []),
    getPopularManga(12).catch(() => []),
  ]);
  return <PopularTabs daily={daily} weekly={weekly} allTime={allTime} />;
}

async function NewTitlesSection() {
  const items = await getNewTitles(12).catch(() => []);
  return <MangaGrid items={items as Parameters<typeof MangaGrid>[0]['items']} />;
}

async function RekomSection() {
  const [all, manga, manhwa, manhua] = await Promise.all([
    getRekomByType(null, 12).catch(() => []),
    getRekomByType('MANGA', 12).catch(() => []),
    getRekomByType('MANHWA', 12).catch(() => []),
    getRekomByType('MANHUA', 12).catch(() => []),
  ]);
  return <RekomTabs all={all} manga={manga} manhwa={manhwa} manhua={manhua} />;
}

async function CompletedSection() {
  const items = await getCompletedManga(12).catch(() => []);
  return <MangaGrid items={items as Parameters<typeof MangaGrid>[0]['items']} />;
}

async function HeroSection() {
  const featured = await getFeaturedManga(5);
  if (featured.length === 0) return <StaticHero />;
  return <FeaturedHero items={featured as Parameters<typeof FeaturedHero>[0]['items']} />;
}

function StaticHero() {
  const stats = [
    { value: '1.000+', label: 'Judul' },
    { value: '50+',    label: 'Genre' },
    { value: 'Tiap Hari', label: 'Update' },
  ];

  // Placeholder covers — colourful aspect-ratio boxes so no broken img requests
  const placeholderColors = [
    'linear-gradient(135deg,#e879f9,#a855f7)',
    'linear-gradient(135deg,#38bdf8,#6366f1)',
    'linear-gradient(135deg,#fb923c,#f43f5e)',
    'linear-gradient(135deg,#34d399,#06b6d4)',
  ];

  return (
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #a855f7 100%)' }}
    >
      {/* Soft glow blobs */}
      <div className="pointer-events-none absolute -top-10 -left-10 size-48 rounded-full opacity-30 blur-3xl"
        style={{ background: '#fff' }} />
      <div className="pointer-events-none absolute -bottom-10 right-10 size-56 rounded-full opacity-20 blur-3xl"
        style={{ background: '#6366f1' }} />

      <div className="relative flex flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:gap-10 md:px-10 md:py-10">

        {/* ── Left: text + stats + CTA ── */}
        <div className="flex-1 min-w-0 space-y-4">
          <p className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
            ✦ Gratis · Tanpa Login
          </p>
          <h1
            className="text-3xl font-bold leading-tight text-white md:text-4xl"
            style={{ fontFamily: 'var(--font-playfair, serif)', textShadow: '0 2px 12px rgba(0,0,0,0.25)' }}
          >
            Baca Manga &amp;<br />Manhwa Gratis
          </h1>
          <p className="text-sm text-white/80 leading-relaxed md:text-base">
            Ribuan judul, update setiap hari.<br className="hidden md:block" />
            Pengalaman baca terbaik di mobile.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-2">
            {stats.map(s => (
              <div key={s.label}
                className="flex flex-col items-center rounded-xl bg-white/15 px-4 py-2 backdrop-blur-sm"
                style={{ border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <span className="text-base font-bold text-white leading-none">{s.value}</span>
                <span className="mt-0.5 text-[10px] text-white/70">{s.label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-lg transition-opacity hover:opacity-90"
              style={{ color: '#FF6B35' }}
            >
              Jelajahi Semua Manga <ChevronRight size={16} />
            </Link>
            <Link
              href="/genre"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              style={{ border: '1.5px solid rgba(255,255,255,0.45)' }}
            >
              Lihat Genre
            </Link>
          </div>
        </div>

        {/* ── Right: floating cover placeholders ── */}
        <div className="hidden md:flex items-center justify-center shrink-0 relative" style={{ width: 200, height: 200 }}>
          {placeholderColors.map((bg, i) => {
            const positions = [
              { top: 0,   left: 0,   rotate: -8,  z: 1 },
              { top: 10,  left: 70,  rotate:  4,  z: 2 },
              { top: 80,  left: 20,  rotate: -4,  z: 3 },
              { top: 70,  left: 95,  rotate:  9,  z: 4 },
            ][i];
            return (
              <div
                key={i}
                className="absolute overflow-hidden rounded-xl shadow-xl"
                style={{
                  width: 80, aspectRatio: '2/3',
                  background: bg,
                  top: positions.top, left: positions.left,
                  transform: `rotate(${positions.rotate}deg)`,
                  zIndex: positions.z,
                  border: '2px solid rgba(255,255,255,0.25)',
                }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 sm:gap-4">
      {Array.from({ length: 12 }).map((_, i) => <MangaCardSkeleton key={i} />)}
    </div>
  );
}

function SectionHeader({ title, icon, href }: { title: string; icon: React.ReactNode; href: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span
          className="block h-5 w-1 rounded-full shrink-0"
          style={{ background: 'var(--color-primary)' }}
        />
        <h2
          className="flex items-center gap-1.5 text-base font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          <span style={{ color: 'var(--color-primary)' }}>{icon}</span>
          {title}
        </h2>
      </div>
      <Link
        href={href}
        className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all hover:opacity-80 active:scale-95"
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--color-primary)',
          border: '1px solid var(--border-light)',
        }}
      >
        Lihat semua <ChevronRight size={12} />
      </Link>
    </div>
  );
}
