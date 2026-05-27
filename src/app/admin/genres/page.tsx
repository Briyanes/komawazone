'use client';

import { useState, useTransition, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, X, Tag, Crown, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface Genre {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_mature: boolean;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const PAGE_SIZE = 20;

export default function AdminGenresPage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editIsMature, setEditIsMature] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newIsMature, setNewIsMature] = useState(false);
  const [filter, setFilter] = useState<'all' | 'general' | 'mature'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void loadGenres();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  async function loadGenres() {
    setLoading(true);
    const res = await fetch('/api/v1/admin/genres');
    const data = await res.json() as { status: string; data: Genre[] };
    if (data.status === 'success') setGenres(data.data);
    setLoading(false);
  }

  const handleCreate = () => {
    if (!newName.trim()) return;
    setError('');
    startTransition(async () => {
      const res = await fetch('/api/v1/admin/genres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), slug: newSlug || slugify(newName), is_mature: newIsMature }),
      });
      const data = await res.json() as { status: string; error?: string };
      if (data.status === 'success') {
        setNewName('');
        setNewSlug('');
        setNewIsMature(false);
        await loadGenres();
      } else {
        setError(typeof data.error === 'string' ? data.error : 'Gagal membuat genre');
      }
    });
  };

  const startEdit = (genre: Genre) => {
    setEditingId(genre.id);
    setEditName(genre.name);
    setEditSlug(genre.slug);
    setEditIsMature(genre.is_mature);
  };

  const handleSaveEdit = (id: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/v1/admin/genres/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), slug: editSlug || slugify(editName), is_mature: editIsMature }),
      });
      if (res.ok) {
        setEditingId(null);
        await loadGenres();
      }
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Hapus genre "${name}"? Genre ini tidak akan dihapus dari manga yang sudah menggunakannya.`)) return;
    startTransition(async () => {
      await fetch(`/api/v1/admin/genres/${id}`, { method: 'DELETE' });
      await loadGenres();
    });
  };

  const filtered = genres.filter(g => {
    const matchFilter = filter === 'all' || (filter === 'general' ? !g.is_mature : g.is_mature);
    const q = search.toLowerCase();
    const matchSearch = !q || g.name.toLowerCase().includes(q) || g.slug.includes(q);
    return matchFilter && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="w-full max-w-2xl space-y-6">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
        Manajemen Genre
      </h1>

      {/* Tambah genre baru */}
      <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <Plus size={15} style={{ color: 'var(--color-primary)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tambah Genre</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={e => { setNewName(e.target.value); setNewSlug(slugify(e.target.value)); }}
              placeholder="Nama genre (mis. Action)"
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <input
              value={newSlug}
              onChange={e => setNewSlug(e.target.value)}
              placeholder="slug"
              className="w-28 shrink-0 rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:border-[var(--color-primary)]"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
            />
            <Button onClick={handleCreate} isLoading={isPending} size="sm" className="shrink-0">
              <Plus size={14} /> Tambah
            </Button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer w-fit select-none">
            <input
              type="checkbox"
              checked={newIsMature}
              onChange={e => setNewIsMature(e.target.checked)}
              className="size-4 rounded"
            />
            <Crown size={13} style={{ color: newIsMature ? '#f59e0b' : 'var(--text-tertiary)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Genre 18+ (konten dewasa — hanya VIP)
            </span>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      {/* Filter + Pencarian */}
      <div className="space-y-3">
        <div className="flex gap-1">
          {(['all', 'general', 'mature'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                filter === f ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-[var(--bg-tertiary)]',
              )}
              style={filter !== f ? { color: 'var(--text-secondary)' } : {}}
            >
              {f === 'all'
                ? `Semua (${genres.length})`
                : f === 'general'
                  ? `Umum (${genres.filter(g => !g.is_mature).length})`
                  : `18+ (${genres.filter(g => g.is_mature).length})`}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau slug genre..."
            className="w-full rounded-xl border py-2 pl-8 pr-3 text-sm outline-none focus:border-[var(--color-primary)]"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Daftar genre */}
      <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <Tag size={14} style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            {filtered.length} genre
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Memuat…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {genres.length === 0 ? 'Belum ada genre. Tambah di atas.' : 'Tidak ada genre yang cocok.'}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {paginated.map(genre => (
              <div key={genre.id} className="flex items-center gap-3 px-5 py-3">
                {editingId === genre.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={e => { setEditName(e.target.value); setEditSlug(slugify(e.target.value)); }}
                      className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
                      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                      autoFocus
                    />
                    <input
                      value={editSlug}
                      onChange={e => setEditSlug(e.target.value)}
                      className="w-24 shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-mono outline-none"
                      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                    />
                    <label className="flex shrink-0 items-center gap-1 cursor-pointer select-none" title="Genre 18+">
                      <input
                        type="checkbox"
                        checked={editIsMature}
                        onChange={e => setEditIsMature(e.target.checked)}
                        className="size-4 rounded"
                      />
                      <Crown size={12} style={{ color: editIsMature ? '#f59e0b' : 'var(--text-tertiary)' }} />
                    </label>
                    <button
                      onClick={() => handleSaveEdit(genre.id)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-emerald-500 hover:bg-emerald-50/10"
                    >
                      <Save size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 min-w-0 items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {genre.name}
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        {genre.slug}
                      </span>
                      {genre.is_mature && (
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                        >
                          <Crown size={9} />18+
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => startEdit(genre)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(genre.id, genre.name)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-red-50/10"
                      style={{ color: '#EF4444' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span className="text-xs">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length} genre
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
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
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium',
                    p === page ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
            >
              ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
