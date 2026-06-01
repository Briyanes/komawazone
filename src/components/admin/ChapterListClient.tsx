'use client';

import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Plus, ExternalLink, Pencil, Search, X, Trash2, ArrowUpDown } from 'lucide-react';
import { DeleteChapterButton } from '@/components/admin/DeleteChapterButton';
import { SelectInput } from '@/components/ui/SelectInput';

// Consistent thousands separator between Node.js and browser (avoids ICU locale mismatch)
function formatThousands(n: number): string {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  manga_id: string;
  release_date: string | null;
  created_at: string;
  views: number;
  manga: { title?: string; slug?: string } | null;
}

interface MangaOption {
  id: string;
  title: string;
}

const SORT_OPTIONS = [
  { value: 'release_date_desc', label: 'Terbaru Rilis' },
  { value: 'release_date_asc',  label: 'Terlama Rilis' },
  { value: 'created_at_desc',   label: 'Baru Diimport' },
  { value: 'number_desc',       label: 'Nomor ↓' },
  { value: 'number_asc',        label: 'Nomor ↑' },
];

export function ChapterListClient({
  chapters: initialChapters,
  mangaOptions,
  total,
  page,
  pageSize,
  sort,
  mangaIdFilter,
  searchQuery,
}: {
  chapters: Chapter[];
  mangaOptions: MangaOption[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  mangaIdFilter: string;
  searchQuery: string;
}) {
  const router   = useRouter();
  const pathname = usePathname();

  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local state when server sends new data
  useEffect(() => {
    setChapters(initialChapters);
    setSelected(new Set());
  }, [initialChapters]);

  // Sync search input when URL changes (browser back/forward)
  useEffect(() => { setSearchInput(searchQuery); }, [searchQuery]);

  const navigate = useCallback((updates: Record<string, string>) => {
    const current: Record<string, string> = {};
    if (sort !== 'release_date_desc') current.sort = sort;
    if (mangaIdFilter)                current.manga_id = mangaIdFilter;
    if (searchQuery)                  current.q = searchQuery;
    if (page > 1)                     current.page = String(page);

    const merged = { ...current, ...updates };
    // Reset to page 1 when non-page param changes
    if (!('page' in updates)) delete merged.page;
    // Don't put page=1 in URL
    if (merged.page === '1') delete merged.page;

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, sort, mangaIdFilter, searchQuery, page]);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate({ q: val }), 400);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = chapters.length > 0 && chapters.every(ch => selected.has(ch.id));

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); chapters.forEach(ch => next.delete(ch.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); chapters.forEach(ch => next.add(ch.id)); return next; });
    }
  };

  const handleBulkDelete = () => {
    if (!confirm(`Hapus ${selected.size} chapter? Tindakan ini tidak dapat dibatalkan.`)) return;
    startTransition(async () => {
      const results = await Promise.allSettled(
        [...selected].map(id =>
          fetch(`/api/v1/admin/chapters/${id}`, { method: 'DELETE' }).then(r => ({ id, ok: r.ok }))
        )
      );
      const deleted = new Set(
        results
          .filter((r): r is PromiseFulfilledResult<{ id: string; ok: boolean }> => r.status === 'fulfilled' && r.value.ok)
          .map(r => r.value.id)
      );
      const failCount = selected.size - deleted.size;
      setChapters(prev => prev.filter(ch => !deleted.has(ch.id)));
      setSelected(new Set());
      if (failCount > 0) alert(`${failCount} chapter gagal dihapus.`);
    });
  };

  const showImportDate = sort === 'created_at_desc';
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  return (
    <div className="w-full space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Cari judul atau nomor chapter…"
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          />
          {searchInput && (
            <button onClick={() => handleSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>

        {/* Manga filter */}
        <SelectInput
          value={mangaIdFilter}
          onChange={e => navigate({ manga_id: e.target.value })}
          className="max-w-[200px]"
        >
          <option value="">Semua Manga</option>
          {mangaOptions.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
        </SelectInput>

        {/* Sort */}
        <div className="relative">
          <ArrowUpDown size={11} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <select
            value={sort}
            onChange={e => navigate({ sort: e.target.value })}
            className="appearance-none rounded-lg pl-7 pr-6 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <span suppressHydrationWarning className="text-sm shrink-0" style={{ color: 'var(--text-tertiary)' }}>
          {formatThousands(total)} chapter
        </span>
        <div className="flex-1" />
        <Link
          href="/admin/chapters/new"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={15} /> Tambah Chapter
        </Link>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--color-primary)', borderWidth: 1 }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{selected.size} terpilih</span>
          <div className="flex-1" />
          <button
            onClick={handleBulkDelete}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: '#EF444420', color: '#EF4444' }}
          >
            <Trash2 size={12} /> Hapus Terpilih
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Batal Pilih
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <div
          className="grid items-center border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)', gridTemplateColumns: '28px 1fr 100px 60px 96px' }}
        >
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 rounded accent-[var(--color-primary)]" />
          <span>Manga / Chapter</span>
          <span className="hidden sm:block">{showImportDate ? 'Diimport' : 'Rilis'}</span>
          <span className="hidden sm:block text-right">Tayangan</span>
          <span className="text-right">Aksi</span>
        </div>

        {chapters.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <span className="text-3xl opacity-20">🔍</span>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {total === 0 ? 'Belum ada chapter' : 'Tidak ada hasil ditemukan'}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {chapters.map(ch => (
              <div key={ch.id} className="grid items-center px-4 py-2.5"
                style={{ gridTemplateColumns: '28px 1fr 100px 60px 96px' }}>
                <input
                  type="checkbox"
                  checked={selected.has(ch.id)}
                  onChange={() => toggleSelect(ch.id)}
                  className="size-4 rounded accent-[var(--color-primary)]"
                />
                <div className="min-w-0 pr-3">
                  <p className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>{ch.manga?.title ?? '—'}</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Ch. {ch.number}{ch.title ? ` — ${ch.title}` : ''}
                  </p>
                </div>
                <span className="hidden text-xs sm:block" style={{ color: 'var(--text-tertiary)' }}>
                  {showImportDate ? fmtDate(ch.created_at) : fmtDate(ch.release_date)}
                </span>
                <span className="hidden text-right text-xs sm:block" style={{ color: 'var(--text-secondary)' }}>
                  {formatThousands(ch.views ?? 0)}
                </span>
                <div className="flex justify-end gap-1">
                  <Link
                    href={`/admin/chapters/${ch.id}`}
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </Link>
                  <Link
                    href={`/manga/${ch.manga?.slug ?? ''}/chapter/${ch.id}`}
                    target="_blank"
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Lihat di situs"
                  >
                    <ExternalLink size={13} />
                  </Link>
                  <DeleteChapterButton id={ch.id} number={ch.number} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span suppressHydrationWarning className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} dari {formatThousands(total)} chapter
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate({ page: '1' })}
              disabled={page === 1}
              className="flex size-7 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
            >«</button>
            <button
              onClick={() => navigate({ page: String(page - 1) })}
              disabled={page === 1}
              className="flex size-7 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
            >‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              return (
                <button
                  key={p}
                  onClick={() => navigate({ page: String(p) })}
                  className="flex size-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    background: p === page ? 'var(--color-primary)' : 'transparent',
                    color: p === page ? '#fff' : 'var(--text-secondary)',
                  }}
                >{p}</button>
              );
            })}
            <button
              onClick={() => navigate({ page: String(page + 1) })}
              disabled={page === totalPages}
              className="flex size-7 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
            >›</button>
            <button
              onClick={() => navigate({ page: String(totalPages) })}
              disabled={page === totalPages}
              className="flex size-7 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}

