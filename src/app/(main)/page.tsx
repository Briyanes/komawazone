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
import { HeroBannerCarousel } from '@/components/HeroBannerCarousel';
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
  const [featured, latest] = await Promise.all([
    getFeaturedManga(5).catch(() => []),
    getLatestManga(10).catch(() => []),
  ]);
  const carouselItems = latest.map((m: { id: string; slug: string; title: string; cover_url?: string | null }) => ({
    id: m.id, slug: m.slug, title: m.title, cover_url: m.cover_url ?? null,
  }));
  if (featured.length > 0) return <FeaturedHero items={featured as Parameters<typeof FeaturedHero>[0]['items']} />;
  return <StaticHero carouselItems={carouselItems} />;
}

function StaticHero({ carouselItems = [] }: { carouselItems?: { id: string; slug: string; title: string; cover_url: string | null }[] }) {
  const stats = [
    { value: '1.000+', label: 'Judul'    },
    { value: '50+',    label: 'Genre'    },
    { value: 'Gratis', label: 'Selamanya'},
  ];

  const covers = [
    { bg: 'linear-gradient(160deg,#e879f9,#7c3aed)', rotate: -10, top: 0,   left: 0,   z: 1, delay: '0s'    },
    { bg: 'linear-gradient(160deg,#38bdf8,#4f46e5)', rotate:   5, top: 18,  left: 68,  z: 3, delay: '0.15s' },
    { bg: 'linear-gradient(160deg,#fb923c,#e11d48)', rotate:  -4, top: 95,  left: 12,  z: 2, delay: '0.05s' },
    { bg: 'linear-gradient(160deg,#34d399,#0284c7)', rotate:  10, top: 78,  left: 88,  z: 4, delay: '0.2s'  },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl">
      {/* ── Dark base + gradient brand accent ── */}
      <div className="absolute inset-0" style={{ background: '#0A0A0F' }} />
      <div
        className="absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(255,107,53,0.35) 0%, transparent 65%)' }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{ background: 'radial-gradient(ellipse 60% 80% at 80% 30%, rgba(168,85,247,0.4) 0%, transparent 60%)' }}
      />
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,1) 0px,rgba(255,255,255,1) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(255,255,255,1) 0px,rgba(255,255,255,1) 1px,transparent 1px,transparent 40px)',
        }}
      />

      {/* ── Content ── */}
      <div className="relative flex flex-col gap-5 px-5 py-6 md:flex-row md:items-center md:gap-12 md:px-12 md:py-12 md:min-h-[clamp(300px,42vw,500px)]">
        {/* Left — text */}
        <div className="flex-1 min-w-0 space-y-4 md:space-y-5">

          {/* Badge */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white"
            style={{ background: 'rgba(255,107,53,0.25)', border: '1px solid rgba(255,107,53,0.45)' }}
          >
            ✦ Gratis · Tanpa Login
          </span>

          {/* Headline */}
          <h1
            className="text-[2rem] font-black leading-[1.1] text-white md:text-5xl"
            style={{ fontFamily: 'var(--font-playfair, serif)', textShadow: '0 4px 32px rgba(0,0,0,0.5)' }}
          >
            Baca Manga<br />
            <span style={{ color: '#FF6B35' }}>&amp; Manhwa</span><br />
            Gratis
          </h1>

          <p className="text-sm leading-relaxed text-white/55 md:text-base max-w-sm">
            Ribuan judul, update setiap hari.<br className="hidden md:block" />
            Pengalaman baca terbaik di mobile.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-2">
            {stats.map(s => (
              <div
                key={s.label}
                className="flex flex-col items-center rounded-xl px-4 py-2"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <span className="text-sm font-bold text-white leading-none">{s.value}</span>
                <span className="mt-0.5 text-[10px] text-white/45">{s.label}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'var(--color-primary)', boxShadow: '0 8px 28px rgba(255,107,53,0.45)' }}
            >
              Jelajahi Manga <ChevronRight size={15} />
            </Link>
            <Link
              href="/genre"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white/75 transition-all hover:bg-white/10 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              Lihat Genre
            </Link>
          </div>
        </div>

        {/* Right — manga carousel (full-width on mobile, fixed on desktop) */}
        <div className="flex w-full shrink-0 items-center justify-center md:w-[320px]">
          {carouselItems.length > 0 ? (
            <HeroBannerCarousel items={carouselItems} />
          ) : (
            <div className="relative mx-auto" style={{ width: 'min(220px, 80vw)', height: 'min(240px, 87vw)' }}>
              {covers.map((c, i) => (
                <div
                  key={i}
                  className="absolute overflow-hidden rounded-2xl"
                  style={{
                    width: 90, aspectRatio: '2/3',
                    background: c.bg,
                    top: c.top, left: c.left,
                    transform: `rotate(${c.rotate}deg)`,
                    zIndex: c.z,
                    border: '2px solid rgba(255,255,255,0.18)',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                    animation: `fade-in 0.6s ease ${c.delay} both`,
                  }}
                />
              ))}
            </div>
          )}
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
