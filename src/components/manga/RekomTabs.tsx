'use client';

import { useState } from 'react';
import { MangaGrid } from './MangaGrid';
import type { MangaListItem } from '@/lib/api/manga';

interface RekomTabsProps {
  all:    MangaListItem[];
  manga:  MangaListItem[];
  manhwa: MangaListItem[];
  manhua: MangaListItem[];
}

const TABS = [
  { key: 'all',    label: 'Semua'  },
  { key: 'manhwa', label: 'Manhwa' },
  { key: 'manga',  label: 'Manga'  },
  { key: 'manhua', label: 'Manhua' },
] as const;

type TabKey = typeof TABS[number]['key'];

export function RekomTabs({ all, manga, manhwa, manhua }: RekomTabsProps) {
  const [active, setActive] = useState<TabKey>('all');

  const data: Record<TabKey, MangaListItem[]> = { all, manga, manhwa, manhua };

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
