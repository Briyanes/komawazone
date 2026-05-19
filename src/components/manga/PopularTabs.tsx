'use client';

import { useState } from 'react';
import { MangaGrid } from './MangaGrid';
import type { MangaListItem } from '@/lib/api/manga';

interface PopularTabsProps {
  daily: MangaListItem[];
  weekly: MangaListItem[];
  allTime: MangaListItem[];
}

const TABS = [
  { key: 'daily',   label: 'Harian'  },
  { key: 'weekly',  label: 'Mingguan' },
  { key: 'allTime', label: 'Semua'   },
] as const;

type TabKey = typeof TABS[number]['key'];

export function PopularTabs({ daily, weekly, allTime }: PopularTabsProps) {
  const [active, setActive] = useState<TabKey>('weekly');

  const data: Record<TabKey, MangaListItem[]> = { daily, weekly, allTime };

  return (
    <div>
      {/* Tab row */}
      <div className="mb-4 flex gap-1.5">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-all"
            style={{
              background: active === tab.key ? '#FF6B35' : 'var(--bg-secondary)',
              color: active === tab.key ? '#fff' : 'var(--text-secondary)',
              border: '1px solid',
              borderColor: active === tab.key ? '#FF6B35' : 'var(--border-light)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <MangaGrid items={data[active] as Parameters<typeof MangaGrid>[0]['items']} />
    </div>
  );
}
