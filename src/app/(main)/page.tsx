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
  return (
    <section
      className="relative overflow-hidden rounded-2xl px-6 py-10 text-center md:py-14"
      style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)' }}
    >
      <h1 className="text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-playfair)' }}>
        Baca Manga &amp; Manhwa Gratis
      </h1>
      <p className="mt-2 text-sm text-white/80 md:text-base">
        Ribuan judul, update setiap hari. Pengalaman baca terbaik di mobile.
      </p>
      <Link
        href="/search"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
        style={{ color: 'var(--color-primary)' }}
      >
        Jelajahi Semua Manga
        <ChevronRight size={16} />
      </Link>
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
      <h2
        className="flex items-center gap-2 text-lg font-bold"
        style={{ color: 'var(--text-primary)' }}
      >
        <span style={{ color: 'var(--color-primary)' }}>{icon}</span>
        {title}
      </h2>
      <Link
        href={href}
        className="flex items-center gap-1 text-sm font-medium transition-colors hover:opacity-80"
        style={{ color: 'var(--color-primary)' }}
      >
        Lihat semua <ChevronRight size={14} />
      </Link>
    </div>
  );
}
