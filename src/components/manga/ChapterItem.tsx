import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ChapterItemProps {
  id: string;
  mangaSlug: string;
  number: number;
  title?: string | null;
  releaseDate: string;
  views?: number;
  isRead?: boolean;
  isNew?: boolean;
  isCurrent?: boolean;
  thumbnailUrl?: string | null;
  className?: string;
}

export function ChapterItem({
  id,
  mangaSlug,
  number,
  title,
  releaseDate,
  views,
  isRead,
  isNew,
  isCurrent,
  thumbnailUrl,
  className,
}: ChapterItemProps) {
  const timeAgo = formatDistanceToNow(new Date(releaseDate), { addSuffix: true });

  return (
    <Link
      href={`/manga/${mangaSlug}/chapter/${id}`}
      className={cn(
        'relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
        'hover:bg-[var(--bg-secondary)]',
        isRead && !isCurrent && 'opacity-60',
        isCurrent && 'ring-1 ring-inset ring-[var(--color-primary)]/40',
        className
      )}
    >
      {/* Thumbnail or number badge */}
      {thumbnailUrl ? (
        <div className="relative shrink-0 overflow-hidden rounded-lg" style={{ width: 100, height: 68 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailUrl} alt={`Chapter ${number}`} className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
          style={{
            backgroundColor: isRead ? 'var(--bg-tertiary)' : 'rgba(255, 107, 53, 0.1)',
            color: isRead ? 'var(--text-tertiary)' : 'var(--color-primary)',
          }}
        >
          {number % 1 === 0 ? number : number.toFixed(1)}
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium"
          style={{ color: isRead ? 'var(--text-secondary)' : 'var(--text-primary)' }}
        >
          {title || `Chapter ${number}`}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {timeAgo}
          </span>
          {views !== undefined && views > 0 && (
            <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <Eye size={11} />
              {views >= 1000 ? `${(views / 1000).toFixed(1)}k` : views}
            </span>
          )}
        </div>
      </div>

      {/* New badge / Current badge */}
      {isCurrent ? (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: 'rgba(255,107,53,0.15)', color: 'var(--color-primary)', border: '1px solid rgba(255,107,53,0.35)' }}
        >
          LANJUT
        </span>
      ) : isNew ? (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          NEW
        </span>
      ) : null}
    </Link>
  );
}
