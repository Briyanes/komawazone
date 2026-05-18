'use client';

import { useState, useMemo } from 'react';
import { MangaCard } from '@/components/manga/MangaCard';
import type { MangaStatus } from '@/types';

interface Item {
  id: string; slug: string; title: string;
  cover_url: string | null; status: string; rating: number; views: number;
  updated_at?: string;
}

type SortKey = 'latest' | 'popular' | 'rating' | 'az';

const SORT_OPTS: { key: SortKey; label: string }[] = [
  { key: 'latest',  label: '🕒 Latest' },
  { key: 'popular', label: '🔥 Popular' },
  { key: 'rating',  label: '⭐ Rating' },
  { key: 'az',      label: '🔤 A–Z' },
];

export function GenreGrid({ items: all }: { items: Item[] }) {
  const [sort, setSort] = useState<SortKey>('latest');

  const sorted = useMemo(() => {
    const arr = [...all];
    if (sort === 'popular') arr.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    else if (sort === 'rating') arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else if (sort === 'az') arr.sort((a, b) => a.title.localeCompare(b.title));
    // 'latest' is the default order from server
    return arr;
  }, [all, sort]);

  return (
    <div>
      {/* Sort bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        {SORT_OPTS.map(o => (
          <button
            key={o.key}
            onClick={() => setSort(o.key)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            style={sort === o.key
              ? { background: 'var(--color-primary)', color: '#fff' }
              : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }
            }
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {sorted.map(item => (
          <MangaCard
            key={item.id}
            id={item.id}
            slug={item.slug}
            title={item.title}
            coverUrl={item.cover_url}
            status={item.status as MangaStatus}
            rating={item.rating}
            views={item.views}
          />
        ))}
      </div>
    </div>
  );
}
