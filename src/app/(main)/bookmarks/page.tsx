'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookMarked, BookOpen, Clock, CheckCircle2, PauseCircle, XCircle } from 'lucide-react';
import { MangaCard } from '@/components/manga/MangaCard';
import { MangaCardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { redirect } from 'next/navigation';
import type { MangaStatus } from '@/types';

type ReadingStatus = 'reading' | 'plan_to_read' | 'completed' | 'on_hold' | 'dropped';

interface ListItem {
  id: string;
  status: ReadingStatus;
  updated_at: string;
  manga: {
    id: string; slug: string; title: string;
    cover_url: string | null; status: MangaStatus; rating: number; views: number;
  } | null;
}

const TABS: { key: ReadingStatus | 'all'; label: string; icon: React.ReactNode }[] = [
  { key: 'all',          label: 'Semua',          icon: <BookMarked   size={14} /> },
  { key: 'reading',      label: 'Sedang Dibaca',  icon: <BookOpen     size={14} /> },
  { key: 'plan_to_read', label: 'Plan to Read',   icon: <Clock        size={14} /> },
  { key: 'completed',    label: 'Tamat',          icon: <CheckCircle2 size={14} /> },
  { key: 'on_hold',      label: 'On Hold',        icon: <PauseCircle  size={14} /> },
  { key: 'dropped',      label: 'Dropped',        icon: <XCircle      size={14} /> },
];

export default function ReadingListPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReadingStatus | 'all'>('all');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) redirect('/login');
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      setLoading(true);
      const url = activeTab === 'all'
        ? '/api/v1/user/reading-list'
        : `/api/v1/user/reading-list?status=${activeTab}`;
      const res = await fetch(url);
      const data = await res.json() as { status: string; data: ListItem[] };
      if (data.status === 'success') setItems(data.data);
      setLoading(false);
    })();
  }, [isAuthenticated, activeTab]);

  if (isLoading) return <PageSkeleton />;

  const filtered = items.filter(i => i.manga !== null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <BookMarked size={22} style={{ color: 'var(--color-primary)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Daftar Baca</h1>
        {!loading && (
          <span className="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            {filtered.length}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
            style={{
              background: activeTab === tab.key ? 'var(--color-primary)' : 'var(--bg-secondary)',
              color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
              border: '1px solid',
              borderColor: activeTab === tab.key ? 'var(--color-primary)' : 'var(--border-light)',
            }}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => <MangaCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <span className="text-6xl opacity-30">📚</span>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Daftar ini masih kosong</p>
          <Link href="/search" className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
            Cari manga →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 sm:gap-4">
          {filtered.map(item => (
            <MangaCard
              key={item.id}
              id={item.manga!.id}
              slug={item.manga!.slug}
              title={item.manga!.title}
              coverUrl={item.manga!.cover_url}
              status={item.manga!.status}
              rating={item.manga!.rating}
              views={item.manga!.views}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="h-8 w-40 rounded skeleton mb-6" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 sm:gap-4">
        {Array.from({ length: 12 }).map((_, i) => <MangaCardSkeleton key={i} />)}
      </div>
    </div>
  );
}

