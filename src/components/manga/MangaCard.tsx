import Link from 'next/link';
import MangaImage from '@/components/ui/MangaImage';
import { Star, Eye } from 'lucide-react';
import { QuickAddButton } from '@/components/manga/QuickAddButton';
import { cn, decodeHtml } from '@/lib/cn';
import type { MangaStatus } from '@/types';

interface MangaCardProps {
  id: string;
  slug: string;
  title: string;
  coverUrl?: string | null;
  status: MangaStatus;
  rating?: number;
  views?: number;
  latestChapter?: { number: number; release_date?: string } | null;
  updatedAt?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  contentRating?: 'general' | 'mature';
}

const statusDotColorMap: Record<MangaStatus, string> = {
  ONGOING: '#10B981',
  COMPLETED: '#3B82F6',
  HIATUS: '#F59E0B',
  DROPPED: '#EF4444',
};

const statusLabelMap: Record<MangaStatus, string> = {
  ONGOING: 'Terbit',
  COMPLETED: 'Tamat',
  HIATUS: 'Hiatus',
  DROPPED: 'Berhenti',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 60)  return `${mins}m lalu`;
  if (hours < 24) return `${hours}j lalu`;
  if (days < 7)   return `${days}h lalu`;
  if (days < 30)  return `${Math.floor(days / 7)}mgg lalu`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}bln lalu`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return remainingMonths > 0
    ? `${years}thn ${remainingMonths}bln lalu`
    : `${years}thn lalu`;
}

export function MangaCard({
  id,
  slug,
  title,
  coverUrl,
  status,
  rating,
  views,
  latestChapter,
  updatedAt,
  size = 'md',
  className,
  contentRating,
}: MangaCardProps) {
  // Use latestChapter.release_date as primary source, fall back to updatedAt
  const dateSource = latestChapter?.release_date ?? updatedAt ?? null;

  const isNew = dateSource
    ? Date.now() - new Date(dateSource).getTime() < 86400000
    : false;

  const isHot = dateSource
    ? Date.now() - new Date(dateSource).getTime() < 3 * 3600000
    : false;

  return (
    <Link
      href={`/manga/${slug}`}
      className={cn(
        'group flex flex-col gap-1.5 rounded-xl overflow-hidden',
        'focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2',
        className
      )}
    >
      {/* Cover */}
      <div className="relative w-full overflow-hidden rounded-xl bg-[var(--bg-tertiary)] aspect-[3/4] transition-all duration-300 group-hover:shadow-lg group-hover:shadow-black/30">
        {coverUrl ? (
          <MangaImage
            src={coverUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 160px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.07]"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center p-3"
            style={{ background: 'linear-gradient(135deg, var(--bg-tertiary) 0%, var(--border-light) 100%)' }}
          >
            <div className="flex flex-col items-center gap-1.5 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, color: 'var(--text-tertiary)' }}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <span className="text-[9px] font-medium leading-tight line-clamp-2" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
                {decodeHtml(title)}
              </span>
            </div>
          </div>
        )}

        {/* ── Top-left: Status badge (solid dark pill, high-contrast on any cover) ── */}
        <div className="absolute top-1.5 left-1.5 z-10 flex flex-wrap items-center gap-1 max-w-[calc(100%-2.5rem)]">
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm"
            style={{ background: 'rgba(0,0,0,0.72)' }}
          >
            <span
              className={cn('size-1.5 rounded-full shrink-0', isHot && 'animate-pulse')}
              style={{ background: isHot ? '#ef4444' : statusDotColorMap[status] }}
            />
            {statusLabelMap[status]}
          </span>
          {isNew && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm"
              style={{ background: '#ef4444' }}
            >
              BARU
            </span>
          )}
        </div>

        {/* ── Top-right: 18+ badge (z-20, always above other elements) ── */}
        {contentRating === 'mature' && (
          <div className="absolute top-1.5 right-1.5 z-20">
            <span
              className="flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-sm"
              style={{ background: '#ef4444' }}
            >
              18+
            </span>
          </div>
        )}

        {/* ── Quick add to reading list (positioned bottom-right via its own default) ── */}
        <QuickAddButton mangaId={id} />

        {/* Latest chapter / update overlay (pr-9 reserves space for QuickAddButton) */}
        {(latestChapter || updatedAt) && (
          <div
            className="absolute bottom-0 inset-x-0 px-2 py-2 pr-9"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,.92) 0%, rgba(0,0,0,.4) 70%, transparent 100%)' }}
          >
            {latestChapter && (
              <p className="text-[10px] font-bold text-white leading-none tracking-wide">Ch.{latestChapter.number}</p>
            )}
            {dateSource && (
              <p className={cn('font-medium', latestChapter ? 'mt-0.5 text-[9px]' : 'text-[9px]')} style={{ color: 'rgba(255,255,255,0.5)' }}>
                {timeAgo(dateSource)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-0.5 px-0.5">
        <h3
          className={cn(
            'font-semibold leading-tight',
            size === 'sm' ? 'text-xs' : 'text-sm'
          )}
          style={{
            color: 'var(--text-primary)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {decodeHtml(title)}
        </h3>

        {(rating !== undefined && rating > 0) || (views !== undefined && views > 0) ? (
          <div className="flex items-center gap-2 flex-wrap">
            {rating !== undefined && rating > 0 && (
              <div className="flex items-center gap-1">
                <Star size={11} fill="#F59E0B" stroke="none" />
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {rating.toFixed(1)}
                </span>
              </div>
            )}
            {views !== undefined && views > 0 && (
              <div className="flex items-center gap-1">
                <Eye size={11} style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {views >= 1000 ? `${(views / 1000).toFixed(0)}k` : views}
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Link>
  );
}


