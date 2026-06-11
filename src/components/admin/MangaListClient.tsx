'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Edit, ExternalLink, Search, X, Star, Trash2, RefreshCw, BookOpen } from 'lucide-react';
import { DeleteMangaButton } from '@/components/admin/DeleteMangaButton';
import { SelectInput } from '@/components/ui/SelectInput';
import { decodeHtml } from '@/lib/cn';

interface Manga {
  id: string;
  slug: string;
  title: string;
  status: string;
  content_rating: 'general' | 'mature';
  views: number;
  rating: number;
  is_featured: boolean;
  updated_at: string;
}

const statusColor: Record<string, string> = {
  ONGOING: '#10B981', COMPLETED: '#3B82F6', HIATUS: '#F59E0B', DROPPED: '#EF4444',
};
const ALL_STATUSES = ['ONGOING', 'COMPLETED', 'HIATUS', 'DROPPED'];
const CONTENT_RATINGS: { value: 'general' | 'mature'; label: string; color: string }[] = [
  { value: 'general', label: '✅ General (SFW)', color: '#10B981' },
  { value: 'mature',  label: '🔞 Mature',        color: '#EF4444' },
];
const PAGE_SIZE = 20;

export function MangaListClient({ mangaList: initialList }: { mangaList: Manga[] }) {
  const [mangaList, setMangaList] = useState<Manga[]>(initialList);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [ratingFilter, setRatingFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('ONGOING');
  const [bulkRating, setBulkRating] = useState<'general' | 'mature'>('general');
  const [isPending, startTransition] = useTransition();
  const [importingChapters, setImportingChapters] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return mangaList.filter(m => {
      const matchSearch = !q || m.title.toLowerCase().includes(q) || m.slug.includes(q);
      const matchStatus = statusFilter === 'ALL' || m.status === statusFilter;
      const matchRating = ratingFilter === 'ALL' || m.content_rating === ratingFilter;
      return matchSearch && matchStatus && matchRating;
    });
  }, [mangaList, search, statusFilter, ratingFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // Reset ke halaman 1 saat filter berubah, dan bersihkan seleksi saat pindah halaman
  useEffect(() => { setPage(1); }, [search, statusFilter, ratingFilter]);
  useEffect(() => { setSelected(new Set()); }, [page]);

  const allSelected = paginated.length > 0 && paginated.every(m => selected.has(m.id));

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); paginated.forEach(m => next.delete(m.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); paginated.forEach(m => next.add(m.id)); return next; });
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
    if (!confirm(`Hapus ${selected.size} manga? Tindakan ini tidak dapat dibatalkan.`)) return;
    startTransition(async () => {
      const results = await Promise.allSettled(
        [...selected].map(id =>
          fetch(`/api/v1/admin/manga/${id}`, { method: 'DELETE' }).then(r => ({ id, ok: r.ok }))
        )
      );
      const deleted = new Set(
        results
          .filter((r): r is PromiseFulfilledResult<{ id: string; ok: boolean }> => r.status === 'fulfilled' && r.value.ok)
          .map(r => r.value.id)
      );
      const failCount = selected.size - deleted.size;
      setMangaList(prev => prev.filter(m => !deleted.has(m.id)));
      setSelected(new Set());
      if (failCount > 0) alert(`${failCount} manga gagal dihapus.`);
    });
  };

  const handleImportChapters = async (id: string, title: string) => {
    if (!confirm(`Import semua chapter untuk "${title}"?\n\nProses ini berjalan di background dan bisa memakan waktu lama.`)) return;
    setImportingChapters(prev => new Set(prev).add(id));
    try {
      const res = await fetch('/api/v1/admin/scrape/manga-chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manga_id: id }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Gagal memulai import');
      alert(data.message ?? 'Import chapter dimulai di background!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setImportingChapters(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleBulkStatus = () => {
    startTransition(async () => {
      const ids = [...selected];
      try {
        const res = await fetch('/api/v1/admin/manga/bulk-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, updates: { status: bulkStatus } }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setMangaList(prev => prev.map(m => ids.includes(m.id) ? { ...m, status: bulkStatus } : m));
      } catch {
        alert(`Gagal mengupdate ${ids.length} manga.`);
      } finally {
        setSelected(new Set());
      }
    });
  };

  const handleBulkRating = () => {
    startTransition(async () => {
      const ids = [...selected];
      try {
        const res = await fetch('/api/v1/admin/manga/bulk-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, updates: { content_rating: bulkRating } }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setMangaList(prev => prev.map(m => ids.includes(m.id) ? { ...m, content_rating: bulkRating } : m));
      } catch {
        alert(`Gagal mengupdate ${ids.length} manga.`);
      } finally {
        setSelected(new Set());
      }
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
            placeholder="Cari judul atau slug…"
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
          <option value="ALL">Semua Status</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </SelectInput>

        <SelectInput value={ratingFilter} onChange={e => setRatingFilter(e.target.value)}>
          <option value="ALL">Semua Rating</option>
          <option value="general">✅ General</option>
          <option value="mature">🔞 Mature</option>
        </SelectInput>

        <span className="text-sm shrink-0" style={{ color: 'var(--text-tertiary)' }}>
          {filtered.length} / {mangaList.length} judul
        </span>
        <div className="flex-1" />
        <Link href="/admin/manga/new"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shrink-0"
          style={{ background: 'var(--color-primary)' }}>
          <Plus size={15} /> Tambah Manga
        </Link>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--color-primary)', borderWidth: 1 }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
            {selected.size} terpilih
          </span>
          <div className="flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            <SelectInput value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} className="max-w-[130px]">
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </SelectInput>
            <button
              onClick={handleBulkStatus}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: '#3B82F6' }}
            >
              <RefreshCw size={12} /> Atur Status
            </button>
            <span className="text-xs" style={{ color: 'var(--border-light)' }}>|</span>
            <SelectInput value={bulkRating} onChange={e => setBulkRating(e.target.value as 'general' | 'mature')} className="max-w-[160px]">
              {CONTENT_RATINGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </SelectInput>
            <button
              onClick={handleBulkRating}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: bulkRating === 'mature' ? '#EF4444' : '#10B981' }}
            >
              <RefreshCw size={12} /> Atur Rating
            </button>
          </div>
          <button
            onClick={handleBulkDelete}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: '#EF444420', color: '#EF4444' }}
          >
            <Trash2 size={12} /> Hapus Semua
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
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)', gridTemplateColumns: '28px 1fr 110px 70px 56px 140px' }}
        >
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 rounded accent-[var(--color-primary)]" />
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
              {mangaList.length === 0 ? 'Belum ada manga' : 'Tidak ada hasil ditemukan'}
            </p>
            {mangaList.length === 0 && (
              <Link href="/admin/manga/new" className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                Tambah manga pertama →
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {paginated.map(manga => (
              <div
                key={manga.id}
                className="grid items-center px-4 py-2.5"
                style={{ gridTemplateColumns: '28px 1fr 110px 70px 56px 140px' }}
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
                      {decodeHtml(manga.title)}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>/{manga.slug}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span
                    className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ background: `${statusColor[manga.status] ?? '#999'}18`, color: statusColor[manga.status] ?? '#999' }}
                  >
                    {manga.status}
                  </span>
                  <span
                    className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: `${manga.content_rating === 'mature' ? '#EF4444' : '#10B981'}18`,
                      color: manga.content_rating === 'mature' ? '#EF4444' : '#10B981',
                    }}
                  >
                    {manga.content_rating === 'mature' ? 'Mature' : 'General'}
                  </span>
                </div>
                <span className="hidden text-right text-xs sm:block" style={{ color: 'var(--text-secondary)' }}>
                  {(manga.views ?? 0).toLocaleString()}
                </span>
                <span className="hidden text-right text-xs sm:block" style={{ color: 'var(--text-secondary)' }}>
                  ★ {(manga.rating ?? 0).toFixed(1)}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleFeatureToggle(manga.id, manga.is_featured)}
                    title={manga.is_featured ? 'Lepas dari beranda' : 'Tampilkan di beranda'}
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: manga.is_featured ? '#F59E0B' : 'var(--text-tertiary)' }}
                  >
                    <Star size={13} fill={manga.is_featured ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={() => handleImportChapters(manga.id, manga.title)}
                    disabled={importingChapters.has(manga.id)}
                    title="Import semua chapter dari sumber"
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-40"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <BookOpen size={13} />
                  </button>
                  <Link href={`/admin/manga/${manga.id}`}
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }} title="Edit">
                    <Edit size={13} />
                  </Link>
                  <Link href={`/manga/${manga.slug}`} target="_blank"
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }} title="Lihat di situs">
                    <ExternalLink size={13} />
                  </Link>
                  <DeleteMangaButton id={manga.id} title={manga.title} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Halaman {page} dari {totalPages} &middot; {filtered.length} manga
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="flex size-7 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Halaman pertama"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="flex size-7 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Sebelumnya"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="flex size-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    background: p === page ? 'var(--color-primary)' : 'transparent',
                    color: p === page ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages}
              className="flex size-7 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Berikutnya"
            >
              ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="flex size-7 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Halaman terakhir"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
