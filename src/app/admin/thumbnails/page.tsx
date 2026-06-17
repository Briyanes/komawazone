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
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">🖼️ Thumbnail Audit</h1>
            <p className="text-gray-400 text-sm mt-1">
              Audit & regenerate thumbnail chapter (pakai gambar ke-5)
            </p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
          >
            ← Dashboard
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50 border border-green-700' : 'bg-red-900/50 border border-red-700'}`}>
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide">Total Chapters</p>
            <p className="text-2xl font-bold mt-1">{stats?.total_chapters.toLocaleString() ?? '—'}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide">Thumbnail NULL</p>
            <p className="text-2xl font-bold mt-1 text-red-400">{stats?.null_thumbnails.toLocaleString() ?? '—'}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide">Wrong (sampled)</p>
            <p className="text-2xl font-bold mt-1 text-yellow-400">
              {stats?.wrong_thumbnails_sampled ?? '—'}
              {stats && stats.audited > 0 && (
                <span className="text-sm text-gray-500 ml-1">/{stats.audited} ({wrongPct}%)</span>
              )}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide">Estimasi Wrong Total</p>
            <p className="text-2xl font-bold mt-1 text-orange-400">~{estimatedWrongTotal.toLocaleString()}</p>
          </div>
        </div>

        {/* Running Job Banner */}
        {stats?.running_job && (
          <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full" />
              <div className="flex-1">
                <p className="text-sm font-medium">Job regenerate berjalan...</p>
                <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${(stats.running_job.processed_items / stats.running_job.total_items) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {stats.running_job.processed_items} / {stats.running_job.total_items} chapter diproses
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="font-semibold mb-3">⚡ Regenerate Thumbnails</h2>
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Filter by manga ID (opsional)"
              value={mangaFilter}
              onChange={(e) => setMangaFilter(e.target.value)}
              className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={() => handleRegenerate(500)}
              disabled={regenerating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition"
            >
              Regenerate 500
            </button>
            <button
              onClick={() => handleRegenerate(2000)}
              disabled={regenerating}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium transition"
            >
              Regenerate 2000 (MAX)
            </button>
            <button
              onClick={() => fetchStats()}
              disabled={loading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm transition"
            >
              {loading ? 'Loading...' : '↻ Refresh'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Prioritas: chapter dengan thumbnail NULL dulu, lalu yang wrong. Logic: gambar ke-5 (index 4),
            fallback ke gambar pertama kalau {'<'} 5 halaman.
          </p>
        </div>

        {/* Visual Audit Grid */}
        {filteredSample.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">🔍 Visual Audit (100 sample)</h2>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg ${filter === 'all' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                  All ({stats?.sample?.length ?? 0})
                </button>
                <button
                  onClick={() => setFilter('wrong')}
                  className={`px-3 py-1.5 rounded-lg ${filter === 'wrong' ? 'bg-yellow-600' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                  ⚠️ Wrong ({stats?.sample?.filter(s => s.is_wrong).length ?? 0})
                </button>
                <button
                  onClick={() => setFilter('null')}
                  className={`px-3 py-1.5 rounded-lg ${filter === 'null' ? 'bg-red-600' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                  ❌ NULL ({stats?.sample?.filter(s => s.is_null).length ?? 0})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredSample.map(item => (
                <div
                  key={item.chapter_id}
                  className={`border rounded-lg overflow-hidden ${
                    item.is_null ? 'border-red-600' : item.is_wrong ? 'border-yellow-600' : 'border-gray-700'
                  }`}
                >
                  <div className="aspect-[2/3] bg-gray-950 relative">
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
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                        NO THUMBNAIL
                      </div>
                    )}
                    {/* Status badge */}
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      {item.is_null && <span className="bg-red-600 text-white px-1 rounded">NULL</span>}
                      {item.is_wrong && <span className="bg-yellow-600 text-black px-1 rounded">WRONG</span>}
                    </div>
                  </div>
                  <div className="p-2 text-xs">
                    <p className="font-medium">Chapter {item.chapter_number}</p>
                    <p className="text-gray-500">{item.image_count} pages</p>
                    {item.is_wrong && item.expected_thumbnail && (
                      <div className="mt-1 pt-1 border-t border-gray-800">
                        <p className="text-gray-500 text-[10px]">Expected (5th):</p>
                        <div className="aspect-[2/3] mt-1 bg-gray-950 rounded overflow-hidden">
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
          <div className="text-center py-12 text-gray-500">
            <div className="animate-spin h-8 w-8 border-2 border-gray-600 border-t-transparent rounded-full mx-auto mb-3" />
            Memuat audit...
          </div>
        )}
      </div>
    </div>
  );
}