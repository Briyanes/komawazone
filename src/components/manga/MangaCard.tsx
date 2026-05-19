import Link from 'next/link';
import Image from 'next/image';
import { Star, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { QuickAddButton } from '@/components/manga/QuickAddButton';
import { cn } from '@/lib/cn';
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
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusVariantMap: Record<MangaStatus, 'ongoing' | 'completed' | 'hiatus' | 'dropped'> = {
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  HIATUS: 'hiatus',
  DROPPED: 'dropped',
};

const statusLabelMap: Record<MangaStatus, string> = {
  ONGOING: 'Ongoing',
  COMPLETED: 'Completed',
  HIATUS: 'Hiatus',
  DROPPED: 'Dropped',
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
  return `${Math.floor(days / 30)}bln lalu`;
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
  size = 'md',
  className,
}: MangaCardProps) {
  const isNew = latestChapter?.release_date
    ? Date.now() - new Date(latestChapter.release_date).getTime() < 86400000
    : false;

  const isHot = latestChapter?.release_date
    ? Date.now() - new Date(latestChapter.release_date).getTime() < 3 * 3600000
    : false;

  return (
    <Link
      href={`/manga/${slug}`}
      className={cn(
        'group flex flex-col gap-2 rounded-lg overflow-hidden',
        'focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2',
        className
      )}
    >
      {/* Cover */}
      <div className="relative w-full overflow-hidden rounded-lg bg-[var(--bg-tertiary)] aspect-[3/4]">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 160px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="text-4xl opacity-30">📖</span>
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
          <Badge variant={statusVariantMap[status]} className="text-[10px] px-1.5 py-0">
            {statusLabelMap[status]}
          </Badge>
          {isNew && (
            <span className="rounded-full px-1.5 py-0 text-[9px] font-bold text-white" style={{ background: '#ef4444' }}>
              BARU
            </span>
          )}
        </div>

        {/* UP dot — updated < 3h ago */}
        {isHot && (
          <span
            className="absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-black/30"
            style={{ background: '#FF6B35' }}
            title="Baru diupdate"
          />
        )}

        {/* Quick add to reading list */}
        <QuickAddButton mangaId={id} />

        {/* Latest chapter overlay */}
        {latestChapter && (
          <div
            className="absolute bottom-0 inset-x-0 px-2 py-1.5"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,.85) 0%, transparent 100%)' }}
          >
            <p className="text-[10px] font-bold text-white leading-none">Ch.{latestChapter.number}</p>
            {latestChapter.release_date && (
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {timeAgo(latestChapter.release_date)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-0.5 px-0.5">
        <h3
          className={cn(
            'font-semibold leading-tight line-clamp-2',
            size === 'sm' ? 'text-xs' : 'text-sm'
          )}
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
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


