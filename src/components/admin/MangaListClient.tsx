'use client';

import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { Plus, Edit, ExternalLink, Search, X, Star, Trash2, RefreshCw } from 'lucide-react';
import { DeleteMangaButton } from '@/components/admin/DeleteMangaButton';
import { SelectInput } from '@/components/ui/SelectInput';

interface Manga {
  id: string;
  slug: string;
  title: string;
  status: string;
  views: number;
  rating: number;
  is_featured: boolean;
  updated_at: string;
}

const statusColor: Record<string, string> = {
  ONGOING: '#10B981', COMPLETED: '#3B82F6', HIATUS: '#F59E0B', DROPPED: '#EF4444',
};
const ALL_STATUSES = ['ONGOING', 'COMPLETED', 'HIATUS', 'DROPPED'];

export function MangaListClient({ mangaList: initialList }: { mangaList: Manga[] }) {
  const [mangaList, setMangaList] = useState<Manga[]>(initialList);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('ONGOING');
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return mangaList.filter(m => {
      const matchSearch = !q || m.title.toLowerCase().includes(q) || m.slug.includes(q);
      const matchStatus = statusFilter === 'ALL' || m.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [mangaList, search, statusFilter]);

  const allSelected = filtered.length > 0 && filtered.every(m => selected.has(m.id));

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(m => next.delete(m.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(m => next.add(m.id)); return next; });
    }
  };

  const handleFeatureToggle = (id: string, current: boolean) => {
    startTransition(async () => {
      await fetch(`/api/v1/admin/manga/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: !current }),
      });
      setMangaList(prev => prev.map(m => m.id === id ? { ...m, is_featured: !current } : m));
    });
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selected.size} manga? This cannot be undone.`)) return;
    startTransition(async () => {
      await Promise.all(
        [...selected].map(id => fetch(`/api/v1/admin/manga/${id}`, { method: 'DELETE' }))
      );
      setMangaList(prev => prev.filter(m => !selected.has(m.id)));
      setSelected(new Set());
    });
  };

  const handleBulkStatus = () => {
    startTransition(async () => {
      await Promise.all(
        [...selected].map(id => fetch(`/api/v1/admin/manga/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: bulkStatus }),
        }))
      );
      setMangaList(prev => prev.map(m => selected.has(m.id) ? { ...m, status: bulkStatus } : m));
      setSelected(new Set());
    });
  };

  return (
    <div className="w-full space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title or slug…"
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>

        <SelectInput value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="ALL">All Status</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </SelectInput>

        <span className="text-sm shrink-0" style={{ color: 'var(--text-tertiary)' }}>
          {filtered.length} / {mangaList.length} titles
        </span>
        <div className="flex-1" />
        <Link href="/admin/manga/new"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shrink-0"
          style={{ background: 'var(--color-primary)' }}>
          <Plus size={15} /> Add Manga
        </Link>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--color-primary)', borderWidth: 1 }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <SelectInput value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} className="max-w-[130px]">
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </SelectInput>
          <button
            onClick={handleBulkStatus}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: '#3B82F6' }}
          >
            <RefreshCw size={12} /> Set Status
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: '#EF444420', color: '#EF4444' }}
          >
            <Trash2 size={12} /> Delete All
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <div
          className="grid items-center border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)', gridTemplateColumns: '28px 1fr 90px 70px 56px 110px' }}
        >
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded accent-[var(--color-primary)]" />
          <span>Title</span>
          <span>Status</span>
          <span className="hidden sm:block text-right">Views</span>
          <span className="hidden sm:block text-right">Rating</span>
          <span className="text-right">Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <span className="text-3xl opacity-20">🔍</span>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {mangaList.length === 0 ? 'No manga yet' : 'No results found'}
            </p>
            {mangaList.length === 0 && (
              <Link href="/admin/manga/new" className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                Add your first manga →
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {filtered.map(manga => (
              <div
                key={manga.id}
                className="grid items-center px-4 py-2.5"
                style={{ gridTemplateColumns: '28px 1fr 90px 70px 56px 110px' }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(manga.id)}
                  onChange={() => toggleSelect(manga.id)}
                  className="rounded accent-[var(--color-primary)]"
                />
                <div className="min-w-0 pr-3 flex items-center gap-1.5">
                  {manga.is_featured && (
                    <Star size={11} fill="#F59E0B" stroke="none" className="shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {manga.title}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>/{manga.slug}</p>
                  </div>
                </div>
                <span
                  className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                  style={{ background: `${statusColor[manga.status] ?? '#999'}18`, color: statusColor[manga.status] ?? '#999' }}
                >
                  {manga.status}
                </span>
                <span className="hidden text-right text-xs sm:block" style={{ color: 'var(--text-secondary)' }}>
                  {(manga.views ?? 0).toLocaleString()}
                </span>
                <span className="hidden text-right text-xs sm:block" style={{ color: 'var(--text-secondary)' }}>
                  ★ {(manga.rating ?? 0).toFixed(1)}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleFeatureToggle(manga.id, manga.is_featured)}
                    title={manga.is_featured ? 'Unpin from homepage' : 'Pin to homepage'}
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: manga.is_featured ? '#F59E0B' : 'var(--text-tertiary)' }}
                  >
                    <Star size={13} fill={manga.is_featured ? 'currentColor' : 'none'} />
                  </button>
                  <Link href={`/admin/manga/${manga.id}`}
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }} title="Edit">
                    <Edit size={13} />
                  </Link>
                  <Link href={`/manga/${manga.slug}`} target="_blank"
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }} title="View on site">
                    <ExternalLink size={13} />
                  </Link>
                  <DeleteMangaButton id={manga.id} title={manga.title} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
