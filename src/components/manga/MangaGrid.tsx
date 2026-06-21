import { MangaCard } from './MangaCard';
import { MangaCardSkeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import type { MangaStatus } from '@/types';

interface MangaItem {
  id: string;
  slug: string;
  title: string;
  cover_url?: string | null;
  status: string;
  rating?: number;
  views?: number;
  chapters?: { number: number; release_date?: string }[];
  updated_at?: string | null;
  content_rating?: 'general' | 'mature';
}

interface MangaGridProps {
  items?: MangaItem[];
  isLoading?: boolean;
  skeletonCount?: number;
  columns?: 'auto' | 3 | 4 | 5;
  className?: string;
}

const columnClasses = {
  auto: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6',
  3:    'grid-cols-3',
  4:    'grid-cols-3 sm:grid-cols-4',
  5:    'grid-cols-3 sm:grid-cols-4 md:grid-cols-5',
};

export function MangaGrid({
  items,
  isLoading,
  skeletonCount = 12,
  columns = 'auto',
  className,
}: MangaGridProps) {
  if (!isLoading && (!items || items.length === 0)) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--text-tertiary)' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        <p className="text-sm font-medium opacity-60">Tidak ada manga ditemukan</p>
      </div>
    );
  }
  return (
    <div
      style={{ gap: '0.75rem' }}
      className={cn('grid sm:gap-4', columnClasses[columns], className)}
    >
      {isLoading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            <MangaCardSkeleton key={i} />
          ))
        : items?.map((item) => {
            const latestChapter =
              item.chapters && item.chapters.length > 0
                ? item.chapters.reduce((a, b) => (a.number > b.number ? a : b))
                : null;

            return (
              <MangaCard
                key={item.id}
                id={item.id}
                slug={item.slug}
                title={item.title}
                coverUrl={item.cover_url}
                status={item.status as MangaStatus}
                rating={item.rating}
                views={item.views}
                latestChapter={latestChapter}
                updatedAt={item.updated_at}
                contentRating={item.content_rating}
              />
            );
          })}
    </div>
  );
}
