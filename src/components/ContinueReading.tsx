'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MangaImage from '@/components/ui/MangaImage';
import { BookOpen, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface ProgressItem {
  manga_id: string;
  chapter_id: string;
  page_number: number;
  read_percentage: number;
  last_read_at: string;
  manga: { id: string; slug: string; title: string; cover_url: string | null } | null;
}

// Shape stored in localStorage for guest reading history
interface LocalHistoryEntry {
  mangaSlug: string;
  mangaTitle: string;
  mangaCover: string | null;
  chapterId: string;
  chapterNumber: number;
  readAt: number;
}

export function ContinueReading() {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [localItems, setLocalItems] = useState<LocalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load server progress for logged-in users
  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    fetch('/api/v1/user/progress')
      .then(r => r.json())
      .then((d: { status: string; data: ProgressItem[] }) => {
        if (d.status === 'success') setItems(d.data.slice(0, 8));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  // Load localStorage history for guests
  useEffect(() => {
    if (isAuthenticated) return;
    try {
      const hist: LocalHistoryEntry[] = JSON.parse(localStorage.getItem('manga_history') ?? '[]') as LocalHistoryEntry[];
      setLocalItems(hist.slice(0, 8));
    } catch { /* ignore */ }
    setLoading(false);
  }, [isAuthenticated]);

  const hasServerItems = isAuthenticated && items.length > 0;
  const hasLocalItems  = !isAuthenticated && localItems.length > 0;

  if (loading) return null;
  if (!hasServerItems && !hasLocalItems) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2
          className="flex items-center gap-2 text-lg font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          <span style={{ color: 'var(--color-primary)' }}><BookOpen size={18} /></span>
          Lanjut Baca
        </h2>
        {isAuthenticated && (
          <Link
            href="/bookmarks"
            className="flex items-center gap-1 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--color-primary)' }}
          >
            My Library <ChevronRight size={14} />
          </Link>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {/* Logged-in: server progress */}
        {hasServerItems && items.map(item => {
          const manga = item.manga;
          if (!manga) return null;
          return (
            <Link
              key={item.manga_id}
              href={`/manga/${manga.slug}/chapter/${item.chapter_id}`}
              className="group relative shrink-0 w-28 space-y-1.5"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl">
                {manga.cover_url ? (
                  <MangaImage src={manga.cover_url} alt={manga.title} fill sizes="112px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center" style={{ background: 'var(--bg-tertiary)' }}>
                    <BookOpen size={24} style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <div className="h-full" style={{ width: `${Math.max(5, item.read_percentage)}%`, background: 'var(--color-primary)' }} />
                </div>
              </div>
              <p className="text-xs font-medium leading-tight line-clamp-2" style={{ color: 'var(--text-primary)' }}>{manga.title}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {item.read_percentage < 100 ? `${Math.round(item.read_percentage)}%` : '✓ Selesai'}
              </p>
            </Link>
          );
        })}

        {/* Guest: localStorage history */}
        {hasLocalItems && localItems.map(item => (
          <Link
            key={item.chapterId}
            href={`/manga/${item.mangaSlug}/chapter/${item.chapterId}`}
            className="group relative shrink-0 w-28 space-y-1.5"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl">
              {item.mangaCover ? (
                <MangaImage src={item.mangaCover} alt={item.mangaTitle} fill sizes="112px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center" style={{ background: 'var(--bg-tertiary)' }}>
                  <BookOpen size={24} style={{ color: 'var(--text-tertiary)' }} />
                </div>
              )}
              {/* Ch badge */}
              <div className="absolute bottom-0 inset-x-0 px-2 py-1" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.7) 0%, transparent 100%)' }}>
                <p className="text-[10px] font-bold text-white">Ch.{item.chapterNumber}</p>
              </div>
            </div>
            <p className="text-xs font-medium leading-tight line-clamp-2" style={{ color: 'var(--text-primary)' }}>{item.mangaTitle}</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {(() => {
                const diff = Date.now() - item.readAt;
                const h = Math.floor(diff / 3600000);
                const d = Math.floor(diff / 86400000);
                if (h < 1) return 'Baru saja';
                if (h < 24) return `${h}j lalu`;
                return `${d}h lalu`;
              })()}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

