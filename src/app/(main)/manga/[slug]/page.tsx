export const revalidate = 600; // 10 minutes ISR

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import MangaImage from '@/components/ui/MangaImage';
import Link from 'next/link';
import { Suspense } from 'react';
import { Star, Eye, BookOpen, Bookmark, Heart, BarChart2, User, Pen, Calendar, Sparkles } from 'lucide-react';
import { getMangaBySlug, MATURE_PREVIEW_CHAPTERS } from '@/lib/api/manga';
import { Badge } from '@/components/ui/Badge';
import { ChapterListSection } from '@/components/manga/ChapterListSection';
import { MangaActions } from '@/components/manga/MangaActions';
import { ReviewsCarousel } from '@/components/manga/ReviewsCarousel';
import { MangaCommentSection } from '@/components/manga/MangaCommentSection';
import { AdZone } from '@/components/ads/AdZone';
import { MangaGrid } from '@/components/manga/MangaGrid';
import { ShareButtons } from '@/components/ShareButtons';
import { ReportMangaButton } from '@/components/manga/ReportMangaButton';
import { SynopsisToggle } from '@/components/manga/SynopsisToggle';
import { createClient } from '@/lib/supabase/server';
import { READER_DOMAIN } from '@/config/domains';
import type { MangaStatus } from '@/types';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const manga = await getMangaBySlug(slug);
  if (!manga) return { title: 'Not Found' };
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${READER_DOMAIN}`;
  const ogUrl = `${baseUrl}/api/og?title=${encodeURIComponent(manga.title)}&status=${manga.status}&rating=${manga.rating ?? 0}${manga.cover_url ? `&cover=${encodeURIComponent(manga.cover_url)}` : ''}`;
  return {
    title: manga.title,
    description: manga.description?.slice(0, 155),
    alternates: { canonical: `${baseUrl}/manga/${slug}` },
    openGraph: {
      title: manga.title,
      description: manga.description ?? undefined,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: manga.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: manga.title,
      description: manga.description?.slice(0, 155),
      images: [ogUrl],
    },
  };
}

const statusVariantMap: Record<MangaStatus, 'ongoing' | 'completed' | 'hiatus' | 'dropped'> = {
  ONGOING: 'ongoing', COMPLETED: 'completed', HIATUS: 'hiatus', DROPPED: 'dropped',
};
const statusLabelMap: Record<string, string> = {
  ONGOING: 'Terbit', COMPLETED: 'Tamat', HIATUS: 'Hiatus', DROPPED: 'Berhenti',
};

export default async function MangaDetailPage({ params }: Props) {
  const { slug } = await params;
  const manga = await getMangaBySlug(slug);
  if (!manga) notFound();

  // VIP/Admin gate for mature content
  let isVip = false;
  if (manga.content_rating === 'mature') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('vip_expires_at, role')
        .eq('id', user.id)
        .single();
      const row = data as { vip_expires_at?: string | null; role?: string | null } | null;
      if (row?.role === 'ADMIN') {
        isVip = true;
      } else {
        const exp = row?.vip_expires_at;
        isVip = !!exp && new Date(exp) > new Date();
      }
    }
  }

  const chapters = manga.chapters.slice().sort((a, b) => b.number - a.number).map(ch => {
    const imgs = (ch.chapter_images ?? []).slice().sort((a, b) => a.number - b.number);
    // ALWAYS prioritize the 5th image (index 4) from chapter_images as thumbnail.
    // Do NOT trust ch.thumbnail_url from DB because it may be stale/wrong
    // (e.g. set to cover image, or set to first image by old buggy code).
    // Only fall back to thumbnail_url if chapter_images is empty (metadata-only import).
    return {
      ...ch,
      thumbnail_url: imgs[4]?.image_url ?? imgs[0]?.image_url ?? ch.thumbnail_url ?? null,
    };
  });
  const firstChapter = [...manga.chapters].sort((a, b) => a.number - b.number)[0];
  const heroBg = manga.banner_url || manga.cover_url;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${READER_DOMAIN}`;

  // JSON-LD structured data for Google rich snippets
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BookSeries',
    name: manga.title,
    alternateName: manga.alt_title || undefined,
    description: manga.description || undefined,
    image: manga.cover_url || undefined,
    author: manga.author ? { '@type': 'Person', name: manga.author } : undefined,
    illustrator: manga.artist ? { '@type': 'Person', name: manga.artist } : undefined,
    genre: manga.genres || undefined,
    inLanguage: 'id',
    startDate: manga.release_year ? `${manga.release_year}` : undefined,
    url: `${baseUrl}/manga/${slug}`,
    aggregateRating: manga.rating > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: manga.rating.toFixed(1),
      bestRating: '5',
      ratingCount: manga.rating_count || 1,
    } : undefined,
  };

  return (
    <div className="w-full min-h-screen overflow-x-hidden" style={{ background: 'var(--bg-primary)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden">
        {heroBg && (
          <div className="absolute inset-0" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroBg} alt="" className="absolute inset-0 h-full w-full object-cover"
              style={{ filter: 'blur(28px)', opacity: 0.5, transform: 'scale(1.15)' }} />
          </div>
        )}
        <div className="absolute inset-0" aria-hidden
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.85) 100%)' }} />
        <div className="absolute inset-0" aria-hidden
          style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.4) 0%, transparent 70%)' }} />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 md:py-12">
          <div className="flex gap-5 md:gap-8 items-center w-full">

            {/* Cover */}
            <div className="relative shrink-0 overflow-hidden rounded-2xl"
              style={{
                width: 'clamp(100px, 26vw, 180px)',
                aspectRatio: '2/3',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1)',
              }}>
              {manga.cover_url ? (
                <MangaImage src={manga.cover_url} alt={manga.title} fill
                  sizes="(max-width: 768px) 100px, 180px" className="object-cover" priority />
              ) : (
                <div className="flex size-full items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <BookOpen size={28} className="text-white/40" />
                </div>
              )}
            </div>

            {/* Info — title + subtitle + stat bar */}
            <div className="flex-1 min-w-0 space-y-3">
              <h1 className="text-2xl font-extrabold leading-tight md:text-5xl text-white"
                style={{ fontFamily: 'var(--font-playfair)', wordBreak: 'break-word', textShadow: '0 2px 16px rgba(0,0,0,0.8)' }}>
                {manga.title}
                {manga.content_rating === 'mature' && (
                  <span className="ml-2 align-middle inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold text-white" style={{ background: '#ef4444', fontSize: '11px' }}>
                    18+
                  </span>
                )}
              </h1>
              {manga.alt_title && (
                <p className="text-sm md:text-base text-white/45">{manga.alt_title}</p>
              )}

              {/* Stat bar */}
              <div className="flex items-center gap-4 md:gap-6 flex-wrap">
                {manga.rating > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Star size={15} fill="#FBBF24" stroke="none" />
                    <span className="text-sm font-bold text-white">{manga.rating.toFixed(1)}</span>
                    {manga.rating_count > 0 && (
                      <span className="text-xs text-white/40">({manga.rating_count})</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Bookmark size={15} className="text-sky-400" />
                  <span className="text-sm font-bold text-white">
                    {manga.bookmark_count >= 1000 ? `${(manga.bookmark_count / 1000).toFixed(1)}K` : manga.bookmark_count}
                  </span>
                </div>
                {manga.views > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Eye size={15} className="text-slate-400" />
                    <span className="text-sm font-bold text-white">
                      {manga.views >= 1000000 ? `${(manga.views / 1000000).toFixed(1)}M` :
                       manga.views >= 1000 ? `${(manga.views / 1000).toFixed(1)}K` : manga.views}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Heart size={15} className="text-rose-400" />
                  <span className="text-sm font-bold text-white">
                    {manga.like_count >= 1000 ? `${(manga.like_count / 1000).toFixed(1)}K` : manga.like_count}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTION BAR ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-2">
          <div className="flex-1">
            <MangaActions mangaId={manga.id} firstChapterId={firstChapter?.id} mangaSlug={slug} />
          </div>
          <ShareButtons title={manga.title} slug={slug} />
          <div className="hidden sm:block">
            <ReportMangaButton mangaSlug={slug} />
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col md:flex-row gap-5 md:gap-6">

          {/* ── LEFT / MAIN ── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Quick info strip — mobile only */}
            <div className="sm:hidden rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
              <div className="grid grid-cols-3 divide-x divide-y"
                style={{ borderColor: 'var(--border-light)', color: 'var(--border-light)' }}>
                {/* Row 1: Status, Type, Released */}
                {manga.status && (
                  <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Status</span>
                    <span className={`text-[11px] font-bold ${manga.status === 'ONGOING' ? 'text-green-400' : manga.status === 'COMPLETED' ? 'text-blue-400' : 'text-yellow-400'}`}>
                      {statusLabelMap[manga.status] ?? manga.status}
                    </span>
                  </div>
                )}
                {manga.type && (
                  <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Tipe</span>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{manga.type}</span>
                  </div>
                )}
                {manga.release_year && (
                  <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Terbit</span>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{manga.release_year}</span>
                  </div>
                )}
                {/* Row 2: Author, Artist, Chapters */}
                {manga.author && (
                  <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Penulis</span>
                    <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{manga.author}</span>
                  </div>
                )}
                {manga.artist && (
                  <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Ilustrator</span>
                    <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{manga.artist}</span>
                  </div>
                )}
                <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Chapter</span>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--color-primary)' }}>{chapters.length}</span>
                </div>
                {/* Row 3: Posted By, Posted On, Updated */}
                {manga.uploader && (
                  <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Diposting</span>
                    <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {manga.uploader.username ?? manga.uploader.email}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-0.5 px-3 py-2.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Ditambahkan</span>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {new Date(manga.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Diperbarui</span>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {new Date(manga.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Genres — mobile only, horizontal scroll */}
            {manga.genres?.length > 0 && (
              <div className="sm:hidden w-full overflow-hidden">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {manga.genres.map(g => (
                    <Link key={g} href={`/search?genre=${encodeURIComponent(g)}`}
                      className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors hover:opacity-80"
                      style={{ background: 'rgba(255,107,53,0.12)', color: 'var(--color-primary)', border: '1px solid rgba(255,107,53,0.25)' }}>
                      {g}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Synopsis with expand/collapse on mobile */}
            {manga.description && (
              <SynopsisToggle text={manga.description} />
            )}

            {/* User Reviews Carousel */}
            <Suspense fallback={<div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', height: '200px' }} />}>
              <ReviewsCarousel slug={slug} />
            </Suspense>

            {/* Chapter list — all chapters shown; locked if mature & non-VIP */}
            <ChapterListSection
              chapters={chapters}
              mangaSlug={slug}
              previewLimit={manga.content_rating === 'mature' && !isVip ? MATURE_PREVIEW_CHAPTERS : undefined}
              defaultSortOrder={manga.content_rating === 'mature' && !isVip ? 'oldest' : 'newest'}
            />

            {/* Comment Section */}
            <MangaCommentSection mangaSlug={slug} />
          </div>

          {/* ── RIGHT SIDEBAR — desktop only ── */}
          <aside className="hidden md:flex w-64 lg:w-72 shrink-0 flex-col gap-4">

            {/* Details */}
            {(manga.author || manga.artist || manga.release_year || manga.type) && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                    <BarChart2 size={12} /> Detail
                  </h2>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                  {[
                    manga.status && { label: 'Status', value: manga.status, icon: null, isBadge: true },
                    manga.type && { label: 'Tipe', value: manga.type, icon: null },
                    manga.release_year && { label: 'Terbit', value: String(manga.release_year), icon: <Calendar size={12} /> },
                    manga.author && { label: 'Penulis', value: manga.author, icon: <User size={12} /> },
                    manga.artist && manga.artist !== manga.author && { label: 'Ilustrator', value: manga.artist, icon: <Pen size={12} /> },
                    { label: 'Chapter', value: String(chapters.length), icon: <BookOpen size={12} /> },
                    manga.uploader && { label: 'Diposting', value: manga.uploader.username ?? manga.uploader.email, icon: <User size={12} /> },
                    { label: 'Tgl Upload', value: new Date(manga.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), icon: null },
                    { label: 'Diperbarui', value: new Date(manga.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), icon: null },
                  ].filter(Boolean).map((row) => {
                    const r = row as { label: string; value: string; icon: React.ReactNode; isBadge?: boolean };
                    return (
                      <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{r.label}</span>
                        {r.isBadge ? (
                          <Badge variant={statusVariantMap[r.value as MangaStatus]}>{statusLabelMap[r.value] ?? r.value}</Badge>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {r.icon}{r.value}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Genres */}
            {manga.genres?.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                  Genres
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {manga.genres.map(g => (
                    <Link key={g} href={`/search?genre=${encodeURIComponent(g)}`}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:opacity-80"
                      style={{ background: 'rgba(255,107,53,0.1)', color: 'var(--color-primary)', border: '1px solid rgba(255,107,53,0.2)' }}>
                      {g}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        <Suspense fallback={null}>
          <AdZone placement="MANGA_DETAIL_TOP" className="w-full mt-6" />
        </Suspense>

        <Suspense fallback={null}>
          <Recommendations genres={manga.genres ?? []} excludeId={manga.id} />
        </Suspense>
      </div>
    </div>
  );
}

async function Recommendations({ genres, excludeId }: { genres: string[]; excludeId: string }) {
  if (genres.length === 0) return null;
  const supabase = await createClient();

  // Show all manga (general + mature) — mature is gated at chapter level
  const { data } = await supabase
    .from('manga')
    .select('id, slug, title, cover_url, status, rating, views, genres, content_rating')
    .is('deleted_at', null)
    .overlaps('genres', genres)
    .neq('id', excludeId)
    .order('rating', { ascending: false })
    .limit(8);

  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold" style={{ color: 'var(--text-primary)' }}>
        <Sparkles size={16} style={{ color: 'var(--color-primary)' }} />
        Manga Serupa
      </h2>
      <MangaGrid items={items as Parameters<typeof MangaGrid>[0]['items']} />
    </section>
  );
}
