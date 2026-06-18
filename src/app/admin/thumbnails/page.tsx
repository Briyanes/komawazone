'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
  // R2 internal: /api/r2/image/<key>
  if (url.startsWith('/api/r2/image/')) return url;
  // R2 full URL: extract key
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
    <div className="space-y-5 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            🖼️ Thumbnail Audit
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Audit & regenerate thumbnail chapter (pakai gambar ke-5)
          </p>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        >
          ← Dashboard
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className="rounded-lg p-4 border"
          style={
            message.type === 'success'
              ? { background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.3)' }
              : { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }
          }
        >
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{message.text}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Total Chapters</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: 'var(--text-primary)' }}>
            {stats?.total_chapters.toLocaleString() ?? '—'}
          </p>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Thumbnail NULL</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: '#ef4444' }}>
            {stats?.null_thumbnails.toLocaleString() ?? '—'}
          </p>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Wrong (sampled)</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: '#f59e0b' }}>
            {stats?.wrong_thumbnails_sampled ?? '—'}
            {stats && stats.audited > 0 && (
              <span className="text-sm ml-1" style={{ color: 'var(--text-tertiary)' }}>
                /{stats.audited} ({wrongPct}%)
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Estimasi Wrong Total</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: '#f97316' }}>
            ~{estimatedWrongTotal.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Running Job Banner */}
      {stats?.running_job && (
        <div className="rounded-xl p-4 border" style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)' }}>
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 rounded-full" style={{ borderColor: '#3b82f6', borderTopColor: 'transparent' }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Job regenerate berjalan...</p>
              <div className="w-full rounded-full h-2 mt-2" style={{ background: 'var(--bg-tertiary)' }}>
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${(stats.running_job.processed_items / stats.running_job.total_items) * 100}%`,
                    background: '#3b82f6',
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

      {/* Actions */}
      <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>⚡ Regenerate Thumbnails</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Filter by manga ID (opsional)"
            value={mangaFilter}
            onChange={(e) => setMangaFilter(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg px-3 py-2 text-sm border outline-none"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--border-light)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={() => handleRegenerate(500)}
            disabled={regenerating}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: '#3b82f6' }}
          >
            Regenerate 500
          </button>
          <button
            onClick={() => handleRegenerate(2000)}
            disabled={regenerating}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: '#8b5cf6' }}
          >
            Regenerate 2000 (MAX)
          </button>
          <button
            onClick={() => fetchStats()}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {loading ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
          Prioritas: chapter dengan thumbnail NULL dulu, lalu yang wrong. Logic: gambar ke-5 (index 4),
          fallback ke gambar pertama jika kurang dari 5 halaman.
        </p>
      </div>

      {/* Visual Audit Grid */}
      {filteredSample.length > 0 && (
        <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>🔍 Visual Audit (100 sample)</h2>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setFilter('all')}
                className="rounded-lg px-3 py-1.5 font-medium transition-colors"
                style={
                  filter === 'all'
                    ? { background: '#3b82f6', color: 'white' }
                    : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
                }
              >
                All ({stats?.sample?.length ?? 0})
              </button>
              <button
                onClick={() => setFilter('wrong')}
                className="rounded-lg px-3 py-1.5 font-medium transition-colors"
                style={
                  filter === 'wrong'
                    ? { background: '#f59e0b', color: 'white' }
                    : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
                }
              >
                ⚠️ Wrong ({stats?.sample?.filter(s => s.is_wrong).length ?? 0})
              </button>
              <button
                onClick={() => setFilter('null')}
                className="rounded-lg px-3 py-1.5 font-medium transition-colors"
                style={
                  filter === 'null'
                    ? { background: '#ef4444', color: 'white' }
                    : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
                }
              >
                ❌ NULL ({stats?.sample?.filter(s => s.is_null).length ?? 0})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredSample.map(item => (
              <div
                key={item.chapter_id}
                className="border rounded-lg overflow-hidden"
                style={{
                  borderColor: item.is_null ? '#ef4444' : item.is_wrong ? '#f59e0b' : 'var(--border-light)',
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
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    {item.is_null && <span className="text-white px-1 rounded" style={{ background: '#ef4444' }}>NULL</span>}
                    {item.is_wrong && <span className="text-black px-1 rounded" style={{ background: '#f59e0b' }}>WRONG</span>}
                  </div>
                </div>
                <div className="p-2 text-xs">
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Chapter {item.chapter_number}</p>
                  <p style={{ color: 'var(--text-tertiary)' }}>{item.image_count} pages</p>
                  {item.is_wrong && item.expected_thumbnail && (
                    <div className="mt-1 pt-1 border-t" style={{ borderColor: 'var(--border-light)' }}>
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

      {loading && !stats && (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          <div className="animate-spin h-8 w-8 border-2 border-t-transparent rounded-full mx-auto mb-3" style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
          Memuat audit...
        </div>
      )}
    </div>
  );
}