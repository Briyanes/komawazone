'use client';

import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Pencil, Search, X, Trash2 } from 'lucide-react';
import { DeleteChapterButton } from '@/components/admin/DeleteChapterButton';
import { SelectInput } from '@/components/ui/SelectInput';

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  manga_id: string;
  release_date: string | null;
  views: number;
  manga: { title?: string; slug?: string } | null;
}

interface MangaOption {
  id: string;
  title: string;
}

export function ChapterListClient({
  chapters: initialChapters,
  mangaOptions,
}: {
  chapters: Chapter[];
  mangaOptions: MangaOption[];
}) {
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [search, setSearch] = useState('');
  const [mangaFilter, setMangaFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return chapters.filter(ch => {
      const matchSearch =
        !q ||
        (ch.manga?.title ?? '').toLowerCase().includes(q) ||
        String(ch.number).includes(q) ||
        (ch.title ?? '').toLowerCase().includes(q);
      const matchManga = mangaFilter === 'ALL' || ch.manga_id === mangaFilter;
      return matchSearch && matchManga;
    });
  }, [chapters, search, mangaFilter]);

  const allSelected = filtered.length > 0 && filtered.every(ch => selected.has(ch.id));

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(ch => next.delete(ch.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(ch => next.add(ch.id)); return next; });
    }
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selected.size} chapter(s)? This cannot be undone.`)) return;
    startTransition(async () => {
      await Promise.all([...selected].map(id => fetch(`/api/v1/admin/chapters/${id}`, { method: 'DELETE' })));
      setChapters(prev => prev.filter(ch => !selected.has(ch.id)));
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
            placeholder="Search manga or chapter…"
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>

        <SelectInput value={mangaFilter} onChange={e => setMangaFilter(e.target.value)} className="max-w-[200px]">
          <option value="ALL">All Manga</option>
          {mangaOptions.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
        </SelectInput>

        <span className="text-sm shrink-0" style={{ color: 'var(--text-tertiary)' }}>
          {filtered.length} / {chapters.length}
        </span>
        <div className="flex-1" />
        <Link href="/admin/chapters/new"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shrink-0"
          style={{ background: 'var(--color-primary)' }}>
          <Plus size={15} /> Add Chapter
        </Link>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--color-primary)', borderWidth: 1 }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={handleBulkDelete} disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: '#EF444420', color: '#EF4444' }}>
            <Trash2 size={12} /> Delete Selected
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <div className="grid border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)', gridTemplateColumns: '28px 1fr 100px 60px 96px' }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded accent-[var(--color-primary)]" />
          <span>Manga / Chapter</span>
          <span className="hidden sm:block">Date</span>
          <span className="hidden sm:block text-right">Views</span>
          <span className="text-right">Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <span className="text-3xl opacity-20">🔍</span>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {chapters.length === 0 ? 'No chapters yet' : 'No results found'}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {filtered.map(ch => (
              <div key={ch.id} className="grid items-center px-4 py-2.5"
                style={{ gridTemplateColumns: '28px 1fr 100px 60px 96px' }}>
                <input type="checkbox" checked={selected.has(ch.id)} onChange={() => toggleSelect(ch.id)}
                  className="rounded accent-[var(--color-primary)]" />
                <div className="min-w-0 pr-3">
                  <p className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>{ch.manga?.title ?? '—'}</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Ch. {ch.number}{ch.title ? ` — ${ch.title}` : ''}
                  </p>
                </div>
                <span className="hidden text-xs sm:block" style={{ color: 'var(--text-tertiary)' }}>
                  {ch.release_date ? new Date(ch.release_date).toLocaleDateString('id-ID') : '—'}
                </span>
                <span className="hidden text-right text-xs sm:block" style={{ color: 'var(--text-secondary)' }}>
                  {(ch.views ?? 0).toLocaleString()}
                </span>
                <div className="flex justify-end gap-1">
                  <Link href={`/admin/chapters/${ch.id}`}
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }} title="Edit">
                    <Pencil size={13} />
                  </Link>
                  <Link href={`/manga/${ch.manga?.slug ?? ''}/chapter/${ch.id}`} target="_blank"
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }} title="Preview">
                    <ExternalLink size={13} />
                  </Link>
                  <DeleteChapterButton id={ch.id} number={ch.number} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


interface Chapter {
  id: string;
  number: number;
  title: string | null;
  manga_id: string;
  release_date: string | null;
  views: number;
  manga: { title?: string; slug?: string } | null;
}

interface MangaOption {
  id: string;
  title: string;
}
