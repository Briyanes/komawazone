'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Play, RefreshCw, Info, AlertTriangle, CheckCircle, Image as ImageIcon, Search, ArrowLeft, Activity } from 'lucide-react';

interface SampleItem {
  chapter_id: string;
  chapter_number: number;
  manga_id: string;
  current_thumbnail: string | null;
  expected_thumbnail: string | null;
  image_count: number;
  is_wrong: boolean;
  is_null: boolean;
}

interface Stats {
  total_chapters: number;
  null_thumbnails: number;
  wrong_thumbnails_sampled: number;
  audited: number;
  sample?: SampleItem[];
  running_job: {
    id: string;
    processed_items: number;
    total_items: number;
    status: string;
    created_at: string;
  } | null;
}

/** Convert source-CDN URL or R2 key to a proxy-safe URL */
function toProxyUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('/api/r2/image/')) return url;
  if (url.includes('r2.dev') || url.includes('r2.cloudflarestorage.com')) {
    const m = url.match(/\/([^/]+(?:\/[^/]+)+\.(?:jpg|jpeg|png|webp|gif|avif))/i);
    if (m) return `/api/r2/image/${m[1]}`;
  }
  return url;
}

export default function ThumbnailAuditPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'wrong' | 'null'>('all');
  const [mangaFilter, setMangaFilter] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStats = useCallback(async (detailed = true) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (detailed) params.set('detailed', '1');
      if (mangaFilter) params.set('mangaId', mangaFilter);
      const res = await fetch(`/api/v1/admin/storage/regenerate-thumbnails?${params}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      const json = await res.json();
      setStats(json.data);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal memuat data' });
    } finally {
      setLoading(false);
    }
  }, [mangaFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Poll running job
  useEffect(() => {
    if (!stats?.running_job) return;
    const interval = setInterval(() => fetchStats(false), 5000);
    return () => clearInterval(interval);
  }, [stats?.running_job, fetchStats]);

  const handleRegenerate = async (limit: number) => {
    setRegenerating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/admin/storage/regenerate-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mangaId: mangaFilter || undefined, limit }),
      });
      if (!res.ok) throw new Error('Gagal memulai regenerate');
      const json = await res.json();
      setMessage({
        type: 'success',
        text: `Job dimulai: ${json.total} chapter (${json.nullThumbnails} NULL + ${json.total - json.nullThumbnails} re-fix). Job ID: ${json.jobId}`,
      });
      setTimeout(() => fetchStats(), 2000);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal' });
    } finally {
      setRegenerating(false);
    }
  };

  const filteredSample = (stats?.sample ?? []).filter(item => {
    if (filter === 'wrong') return item.is_wrong;
    if (filter === 'null') return item.is_null;
    return true;
  });

  const wrongPct = stats && stats.audited > 0
    ? Math.round((stats.wrong_thumbnails_sampled / stats.audited) * 100)
    : 0;

  const estimatedWrongTotal = stats
    ? Math.round((stats.wrong_thumbnails_sampled / Math.max(stats.audited, 1)) * stats.total_chapters)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Thumbnail Audit
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Audit & regenerate thumbnail chapter (pakai gambar ke-5 teratas)
          </p>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
        >
          <ArrowLeft size={14} />
          Dashboard
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className="rounded-lg p-4 flex items-center gap-2 text-sm"
          style={
            message.type === 'success'
              ? { background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }
              : { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }
          }
        >
          {message.type === 'success' ? (
            <CheckCircle size={14} className="text-green-500" />
          ) : (
            <AlertTriangle size={14} className="text-red-500" />
          )}
          <span style={{ color: 'var(--text-secondary)' }}>{message.text}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Total Chapters</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: 'var(--text-primary)' }}>
            {stats?.total_chapters.toLocaleString() ?? '—'}
          </p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Thumbnail NULL</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: 'var(--color-error)' }}>
            {stats?.null_thumbnails.toLocaleString() ?? '—'}
          </p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Wrong (sampled)</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: 'var(--color-warning)' }}>
            {stats?.wrong_thumbnails_sampled ?? '—'}
            {stats && stats.audited > 0 && (
              <span className="text-sm ml-1" style={{ color: 'var(--text-tertiary)' }}>
                /{stats.audited} ({wrongPct}%)
              </span>
            )}
          </p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Estimasi Wrong Total</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: '#f97316' }}>
            ~{estimatedWrongTotal.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Running Job Banner */}
      {stats?.running_job && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          <div className="flex items-center gap-3">
            <RefreshCw size={16} className="animate-spin text-blue-500" />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Job regenerate berjalan...</p>
              <div className="w-full h-2 rounded-full overflow-hidden mt-2" style={{ background: 'var(--bg-tertiary)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.running_job.total_items > 0 ? Math.min(100, (stats.running_job.processed_items / stats.running_job.total_items) * 100) : 0}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
                  }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {stats.running_job.processed_items} / {stats.running_job.total_items} chapter diproses
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate Section */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Regenerate Thumbnails
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
            <ImageIcon size={10} /> Thumbnail
          </span>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Update thumbnail chapter agar pakai gambar ke-5 (bukan gambar pertama).
          Fix bug thumbnail yang masih menampilkan gambar halaman cover.
          Prioritas: chapter dengan thumbnail NULL dulu, lalu yang wrong.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Manga ID (opsional)
            </label>
            <input
              type="text"
              placeholder="UUID manga..."
              value={mangaFilter}
              onChange={e => setMangaFilter(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm w-64"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            />
          </div>
          <button
            onClick={() => handleRegenerate(500)}
            disabled={regenerating}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {regenerating ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Regenerate 500
          </button>
          <button
            onClick={() => handleRegenerate(2000)}
            disabled={regenerating}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {regenerating ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Regenerate 2000 (MAX)
          </button>
          <button
            onClick={() => fetchStats()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            <RefreshCw size={14} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Visual Audit Grid */}
      {filteredSample.length > 0 && (
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Visual Audit
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                <Search size={10} /> {stats?.sample?.length ?? 0} Sample
              </span>
            </div>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setFilter('all')}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium transition-opacity hover:opacity-80"
                style={
                  filter === 'all'
                    ? { background: 'var(--color-primary)', color: 'white' }
                    : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }
                }
              >
                <Activity size={10} />
                All ({stats?.sample?.length ?? 0})
              </button>
              <button
                onClick={() => setFilter('wrong')}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium transition-opacity hover:opacity-80"
                style={
                  filter === 'wrong'
                    ? { background: 'var(--color-warning)', color: 'white' }
                    : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }
                }
              >
                <AlertTriangle size={10} />
                Wrong ({stats?.sample?.filter(s => s.is_wrong).length ?? 0})
              </button>
              <button
                onClick={() => setFilter('null')}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium transition-opacity hover:opacity-80"
                style={
                  filter === 'null'
                    ? { background: 'var(--color-error)', color: 'white' }
                    : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }
                }
              >
                <AlertTriangle size={10} />
                NULL ({stats?.sample?.filter(s => s.is_null).length ?? 0})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredSample.map(item => (
              <div
                key={item.chapter_id}
                className="rounded-lg overflow-hidden"
                style={{
                  border: `1px solid ${item.is_null ? 'var(--color-error)' : item.is_wrong ? 'var(--color-warning)' : 'var(--border-light)'}`,
                }}
              >
                <div className="aspect-[2/3] relative" style={{ background: 'var(--bg-primary)' }}>
                  {toProxyUrl(item.current_thumbnail) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={toProxyUrl(item.current_thumbnail)!}
                      alt={`Ch ${item.chapter_number}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.opacity = '0.2';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      NO THUMBNAIL
                    </div>
                  )}
                  {/* Status badge */}
                  <div className="absolute top-1 left-1">
                    {item.is_null && (
                      <span className="text-white px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--color-error)' }}>NULL</span>
                    )}
                    {item.is_wrong && (
                      <span className="text-white px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--color-warning)' }}>WRONG</span>
                    )}
                  </div>
                </div>
                <div className="p-2 text-xs">
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Chapter {item.chapter_number}</p>
                  <p style={{ color: 'var(--text-tertiary)' }}>{item.image_count} pages</p>
                  {item.is_wrong && item.expected_thumbnail && (
                    <div className="mt-1 pt-1" style={{ borderTop: '1px solid var(--border-light)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Expected (5th):</p>
                      <div className="aspect-[2/3] mt-1 rounded overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={toProxyUrl(item.expected_thumbnail)!}
                          alt="Expected"
                          className="w-full h-full object-cover opacity-70"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div
        className="rounded-xl p-5 space-y-2"
        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Info size={14} className="text-blue-500" /> Info
        </p>
        <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>• <strong>Thumbnail Audit</strong>: Cek apakah thumbnail chapter sudah pakai gambar ke-5</li>
          <li>• <strong>NULL</strong>: Chapter tidak punya thumbnail sama sekali</li>
          <li>• <strong>Wrong</strong>: Thumbnail masih pakai gambar pertama (cover), harusnya gambar ke-5</li>
          <li>• <strong>Regenerate</strong>: Update thumbnail ke gambar ke-5 teratas, fallback ke gambar pertama jika kurang dari 5 halaman</li>
          <li>• <strong>Filter Manga ID</strong>: Hanya audit/regenerate chapter dari manga tertentu</li>
          <li>• Job berjalan di background, progress update otomatis setiap 5 detik</li>
          <li>• Max 2000 chapter per batch regenerate</li>
        </ul>
      </div>

      {loading && !stats && (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
          Memuat audit...
        </div>
      )}
    </div>
  );
}