'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, Globe, RefreshCw, ChevronDown, ChevronUp, Pencil } from 'lucide-react';

interface MangaSource {
  id: string;
  name: string;
  base_url: string;
  sitemap_urls: string[];
  is_active: boolean;
  type: 'MANHWA' | 'MANGA' | 'MANHUA' | 'MIXED';
  notes: string | null;
  created_at: string;
}

const TYPE_COLORS = {
  MANHWA: 'rgba(59,130,246,0.12)',
  MANGA: 'rgba(34,197,94,0.12)',
  MANHUA: 'rgba(234,179,8,0.12)',
  MIXED: 'rgba(156,163,175,0.12)',
};

const TYPE_TEXT = {
  MANHWA: '#3b82f6',
  MANGA: '#22c55e',
  MANHUA: '#eab308',
  MIXED: '#9ca3af',
};

export function SourcesManager() {
  const [sources, setSources] = useState<MangaSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    base_url: '',
    sitemap_urls: '',
    is_active: true,
    type: 'MANHWA' as MangaSource['type'],
    notes: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [fixCovers, setFixCovers] = useState(true);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/sources');
      const json = await res.json() as { status?: string; data?: MangaSource[]; error?: string };
      if (json.status === 'success') setSources(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSources(); }, [fetchSources]);

  const resetForm = () => {
    setForm({ name: '', base_url: '', sitemap_urls: '', is_active: true, type: 'MANHWA', notes: '' });
    setEditingId(null);
    setShowForm(false);
    setError(null);
  };

  const startEdit = (source: MangaSource) => {
    setForm({
      name: source.name,
      base_url: source.base_url,
      sitemap_urls: source.sitemap_urls.join('\n'),
      is_active: source.is_active,
      type: source.type,
      notes: source.notes ?? '',
    });
    setEditingId(source.id);
    setShowForm(true);
    setError(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setError(null);

    const sitemapUrls = form.sitemap_urls
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean);

    try {
      if (editingId) {
        // Mode EDIT — PATCH sumber yang ada
        const res = await fetch(`/api/v1/admin/sources/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            base_url: form.base_url,
            sitemap_urls: sitemapUrls,
            is_active: form.is_active,
            type: form.type,
            notes: form.notes || null,
          }),
        });
        const json = await res.json() as { status?: string; error?: string };
        if (res.ok) {
          resetForm();
          void fetchSources();
        } else {
          setError(typeof json.error === 'string' ? json.error : 'Gagal menyimpan perubahan');
        }
      } else {
        // Mode TAMBAH — POST sumber baru
        const res = await fetch('/api/v1/admin/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            base_url: form.base_url,
            sitemap_urls: sitemapUrls,
            is_active: form.is_active,
            type: form.type,
            notes: form.notes || null,
          }),
        });
        const json = await res.json() as { status?: string; error?: string };
        if (res.ok) {
          resetForm();
          void fetchSources();
        } else {
          setError(typeof json.error === 'string' ? json.error : 'Gagal menambahkan sumber');
        }
      }
    } finally {
      setFormLoading(false);
    }
  };

  const toggleActive = async (source: MangaSource) => {
    const res = await fetch(`/api/v1/admin/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !source.is_active }),
    });
    if (res.ok) void fetchSources();
    else setError('Gagal mengubah status sumber.');
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus sumber "${name}"? Ini tidak menghapus manga yang sudah diimport.`)) return;
    const res = await fetch(`/api/v1/admin/sources/${id}`, { method: 'DELETE' });
    if (res.ok) void fetchSources();
    else setError('Gagal menghapus sumber.');
  };

  const triggerImport = async (source: MangaSource) => {
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/scrape/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sitemapUrls: source.sitemap_urls,
          sourceId: source.id,
          options: { importNew: true, importUpdates: fixCovers, batchSize: 3 },
        }),
      });
      const json = await res.json() as { data?: { jobId?: string }; error?: string };
      if (res.ok) {
        setError(null);
        setSuccessMsg(`Import dimulai dari sumber "${source.name}".`);
        setTimeout(() => setSuccessMsg(null), 5000);
        void fetchSources();
      } else {
        setError(`Gagal memulai import: ${json.error ?? 'Unknown error'}`);
      }
    } catch {
      setError('Gagal terhubung ke server.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Sumber Manga</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Kelola sumber scraping manga — tambah, nonaktifkan, atau hapus sumber
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSources}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => {
              if (showForm && editingId) { resetForm(); } // tutup edit form
              else { resetForm(); setShowForm(v => !v); } // toggle tambah form
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            <Plus size={13} />
            Tambah Sumber
          </button>
        </div>
      </div>

      {/* Feedback messages */}
      {successMsg && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
          {successMsg}
        </div>
      )}
      {error && !showForm && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Form tambah / edit */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--bg-card)', border: `1px solid ${editingId ? 'rgba(59,130,246,0.4)' : 'var(--color-primary)'}` }}
        >
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {editingId ? `Edit Sumber — ${form.name || '...'}` : 'Tambah Sumber Baru'}
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Nama Sumber">
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ManhwaLand"
                className="w-full rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              />
            </FormField>
            <FormField label="Base URL">
              <input
                required
                type="url"
                value={form.base_url}
                onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                placeholder="https://example.com"
                className="w-full rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              />
            </FormField>
          </div>

          <FormField label="Sitemap URLs (satu per baris)">
            <textarea
              required
              rows={4}
              value={form.sitemap_urls}
              onChange={e => setForm(f => ({ ...f, sitemap_urls: e.target.value }))}
              placeholder="https://example.com/manga-sitemap.xml&#10;https://example.com/manga-sitemap2.xml"
              className="w-full rounded-lg px-3 py-2 text-xs font-mono resize-none"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipe Konten">
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as MangaSource['type'] }))}
                className="w-full rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              >
                <option value="MANHWA">MANHWA</option>
                <option value="MANGA">MANGA</option>
                <option value="MANHUA">MANHUA</option>
                <option value="MIXED">MIXED</option>
              </select>
            </FormField>
            <FormField label="Notes (opsional)">
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Keterangan singkat"
                className="w-full rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              />
            </FormField>
          </div>

          {error && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg px-3 py-1.5 text-xs"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              style={{ background: editingId ? '#3b82f6' : 'var(--color-primary)', color: 'white' }}
            >
              {formLoading ? <RefreshCw size={11} className="animate-spin" /> : editingId ? <Pencil size={11} /> : <Plus size={11} />}
              {editingId ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      )}

      {/* List sumber */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 animate-pulse rounded-xl" style={{ background: 'var(--bg-card)' }} />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-xl py-10 text-center text-xs" style={{ background: 'var(--bg-card)', color: 'var(--text-tertiary)', border: '1px solid var(--border-light)' }}>
          Belum ada sumber manga. Klik &quot;Tambah Sumber&quot; untuk mulai.
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map(source => (
            <div
              key={source.id}
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: `1px solid ${source.is_active ? 'var(--border-light)' : 'rgba(156,163,175,0.2)'}` }}
            >
              {/* Row utama */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: source.is_active ? 'rgba(255,107,53,0.1)' : 'rgba(156,163,175,0.1)' }}
                >
                  <Globe size={14} style={{ color: source.is_active ? 'var(--color-primary)' : '#9ca3af' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: source.is_active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {source.name}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] uppercase font-medium"
                      style={{ background: TYPE_COLORS[source.type], color: TYPE_TEXT[source.type] }}
                    >
                      {source.type}
                    </span>
                    {!source.is_active && (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] uppercase" style={{ background: 'rgba(156,163,175,0.12)', color: '#9ca3af' }}>
                        nonaktif
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {source.base_url} · {source.sitemap_urls.length} sitemap
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Toggle aktif */}
                  <button
                    onClick={() => toggleActive(source)}
                    title={source.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: source.is_active ? '#22c55e' : '#9ca3af' }}
                  >
                    {source.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>

                  {/* Import sekarang */}
                  {source.is_active && (
                    <div className="flex items-center gap-1.5">
                      <label className="flex items-center gap-1 cursor-pointer" title="Perbaiki cover yang mati/null">
                        <input
                          type="checkbox"
                          checked={fixCovers}
                          onChange={e => setFixCovers(e.target.checked)}
                          className="w-3 h-3 accent-orange-500"
                        />
                        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Fix cover</span>
                      </label>
                      <button
                        onClick={() => triggerImport(source)}
                        title="Import manga dari sumber ini sekarang"
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
                        style={{ background: 'rgba(255,107,53,0.1)', color: 'var(--color-primary)' }}
                      >
                        <Plus size={11} />
                        Import
                      </button>
                    </div>
                  )}

                  {/* Edit */}
                  <button
                    onClick={() => startEdit(source)}
                    title="Edit sumber"
                    className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-blue-500/10"
                    style={{ color: editingId === source.id ? '#3b82f6' : 'var(--text-tertiary)' }}
                  >
                    <Pencil size={13} />
                  </button>

                  {/* Expand/collapse */}
                  <button
                    onClick={() => setExpandedId(expandedId === source.id ? null : source.id)}
                    className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {expandedId === source.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {/* Hapus */}
                  <button
                    onClick={() => handleDelete(source.id, source.name)}
                    className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: '#ef4444' }}
                    title="Hapus sumber"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Detail expanded */}
              {expandedId === source.id && (
                <div className="border-t px-4 pb-3 pt-2.5" style={{ borderColor: 'var(--border-light)' }}>
                  <p className="mb-1.5 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Sitemap URLs ({source.sitemap_urls.length}):
                  </p>
                  <div className="space-y-0.5">
                    {source.sitemap_urls.map(url => (
                      <div key={url} className="truncate text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        {url}
                      </div>
                    ))}
                  </div>
                  {source.notes && (
                    <p className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      Note: {source.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
