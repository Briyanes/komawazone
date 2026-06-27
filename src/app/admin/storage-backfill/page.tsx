'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, RefreshCw, Info, AlertTriangle, CheckCircle, Image, DownloadCloud, HardDrive, ExternalLink, Terminal, Copy, Server } from 'lucide-react';

export default function StorageBackfillPage() {
  const [status, setStatus] = useState<string>('idle');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [limit, setLimit] = useState(50);
  const [copiedScript, setCopiedScript] = useState(false);

  // R2 migration stats
  const [migrateStats, setMigrateStats] = useState<{
    chapter_images: { total: number; inR2: number; external: number; migrationProgress: string };
    estimate: { imagesRemaining: number; estimatedMinutes: number };
    script: string;
  } | null>(null);

  // Retry images state
  const [retryStatus, setRetryStatus] = useState<string>('idle');
  const [retryResult, setRetryResult] = useState<Record<string, unknown> | null>(null);
  const [retryLimit, setRetryLimit] = useState(50);

  // Regenerate thumbnails state
  const [thumbStatus, setThumbStatus] = useState<string>('idle');
  const [thumbResult, setThumbResult] = useState<Record<string, unknown> | null>(null);
  const [thumbLimit, setThumbLimit] = useState(500);
  const [thumbMangaId, setThumbMangaId] = useState('');
  const [thumbJobId, setThumbJobId] = useState<string | null>(null);
  const [thumbCompleted, setThumbCompleted] = useState<boolean>(false);

  const runBackfill = async () => {
    setStatus('loading');
    setResult(null);

    try {
      const res = await fetch('/api/v1/admin/storage/backfill-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });

      const data = await res.json();
      setResult(data);
      setStatus('success');
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
      setStatus('error');
    }
  };

  const checkStatus = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/v1/admin/storage/backfill-public');
      const data = await res.json();
      setResult(data);
      setStatus('success');
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
      setStatus('error');
    }
  };

  const runRetry = async () => {
    setRetryStatus('loading');
    setRetryResult(null);

    try {
      const res = await fetch('/api/v1/admin/storage/retry-failed-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: retryLimit }),
      });

      const data = await res.json();
      setRetryResult(data);
      setRetryStatus('success');
    } catch (err) {
      setRetryResult({ error: err instanceof Error ? err.message : String(err) });
      setRetryStatus('error');
    }
  };

  const checkRetryStatus = async () => {
    setRetryStatus('loading');
    try {
      const res = await fetch('/api/v1/admin/storage/retry-failed-images');
      const data = await res.json();
      setRetryResult(data);
      setRetryStatus('success');
    } catch (err) {
      setRetryResult({ error: err instanceof Error ? err.message : String(err) });
      setRetryStatus('error');
    }
  };

  const runRegenerate = async () => {
    setThumbStatus('loading');
    setThumbResult(null);

    try {
      const payload: Record<string, unknown> = { limit: thumbLimit };
      if (thumbMangaId.trim()) payload.mangaId = thumbMangaId.trim();

      const res = await fetch('/api/v1/admin/storage/regenerate-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setThumbResult(data);
      setThumbStatus('success');
      if (data.jobId) {
        setThumbJobId(data.jobId);
        setThumbCompleted(false);
      }
    } catch (err) {
      setThumbResult({ error: err instanceof Error ? err.message : String(err) });
      setThumbStatus('error');
    }
  };

  const checkThumbStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/storage/regenerate-thumbnails');
      const data = await res.json();
      setThumbResult(data);

      const jobData = data?.data as Record<string, unknown> | undefined;
      const job = jobData?.running_job as { processed_items: number; total_items: number; status: string } | undefined;

      if (!job && thumbJobId) {
        // Job selesai (tidak ada running_job lagi)
        setThumbCompleted(true);
        setThumbJobId(null);
      }
    } catch {
      // ignore polling errors
    }
  }, [thumbJobId]);

  // Auto-poll progress setiap 3 detik saat job sedang running
  useEffect(() => {
    if (!thumbJobId) return;
    const interval = setInterval(() => {
      checkThumbStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [thumbJobId, checkThumbStatus]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      // ignore
    }
  };

  // Load R2 migration stats on mount
  const loadMigrateStats = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/storage/migrate-stats');
      if (res.ok) {
        setMigrateStats(await res.json());
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    loadMigrateStats();
  }, [loadMigrateStats]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Storage Backfill
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Migrasi cover & repair chapter images ke Cloudflare R2
        </p>
      </div>

      {/* ── PROMINENT WARNING: Bulk migration needs local scripts ── */}
      {migrateStats && migrateStats.chapter_images.external > 0 && (
        <div
          className="rounded-xl p-5 space-y-3"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-bold" style={{ color: '#ef4444' }}>
                {migrateStats.chapter_images.external.toLocaleString()} gambar masih di CDN eksternal — butuh Local Scripts
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Dashboard Vercel punya timeout <strong>60 detik</strong>. Download {migrateStats.chapter_images.external.toLocaleString()} gambar
                butuh <strong>berhari-hari</strong> non-stop. Ini <strong>tidak bisa</strong> dilakukan dari dashboard —
                harus pakai terminal lokal (VSC) yang bisa run 24 jam tanpa timeout.
              </p>
            </div>
          </div>

          {/* Local script command */}
          <div className="space-y-2 mt-3">
            <p className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
              <Terminal size={12} /> Jalankan di Terminal VSC:
            </p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 text-xs font-mono px-3 py-2.5 rounded-lg overflow-x-auto"
                style={{ background: 'var(--bg-primary)', color: '#22c55e', border: '1px solid var(--border-light)' }}
              >
                {migrateStats.script || 'node scripts/download-to-r2-massive.mjs'}
              </code>
              <button
                onClick={() => copyToClipboard(migrateStats.script || 'node scripts/download-to-r2-massive.mjs')}
                className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                style={{ background: copiedScript ? 'rgba(34,197,94,0.1)' : 'var(--bg-tertiary)', color: copiedScript ? '#22c55e' : 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
                title="Copy command"
              >
                {copiedScript ? <CheckCircle size={14} /> : <Copy size={14} />}
                {copiedScript ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="flex flex-wrap gap-4 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              <span className="flex items-center gap-1">
                <Server size={10} /> Butuh: PROXY_LIST di .env.local
              </span>
              <span className="flex items-center gap-1">
                <RefreshCw size={10} /> Estimasi: 3-7 hari (24 jam non-stop)
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle size={10} /> Parallel: 10-50 concurrent downloads
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── R2 Migration Status ── */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              R2 Migration Status
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
              <HardDrive size={10} /> Storage
            </span>
          </div>
          <button
            onClick={loadMigrateStats}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            <RefreshCw size={10} /> Refresh
          </button>
        </div>

        {migrateStats ? (
          <>
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {migrateStats.chapter_images.inR2.toLocaleString()} / {migrateStats.chapter_images.total.toLocaleString()} images in R2
                </span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {migrateStats.chapter_images.migrationProgress}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${migrateStats.chapter_images.migrationProgress}%`, background: 'linear-gradient(90deg, #22c55e, #10b981)' }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-tertiary)' }}>
                <p className="text-lg font-bold" style={{ color: '#22c55e' }}>
                  {migrateStats.chapter_images.inR2.toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>In R2</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-tertiary)' }}>
                <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>
                  {migrateStats.chapter_images.external.toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>External CDN</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-tertiary)' }}>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                  {migrateStats.estimate.estimatedMinutes > 0 ? `~${Math.ceil(migrateStats.estimate.estimatedMinutes / 60)}h` : '✅'}
                </p>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Est. Time</p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <RefreshCw size={14} className="animate-spin" /> Loading stats...
          </div>
        )}
      </div>

      {/* ── Cover Backfill ── */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Cover Migration
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
            Backfill
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Limit per batch
            </label>
            <input
              type="number"
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              min={1}
              max={200}
              className="rounded-lg px-3 py-2 text-sm w-24"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            />
          </div>
          <button
            onClick={runBackfill}
            disabled={status === 'loading'}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {status === 'loading' ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {status === 'loading' ? 'Running...' : 'Start Backfill'}
          </button>
          <button
            onClick={checkStatus}
            disabled={status === 'loading'}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            <RefreshCw size={14} />
            Check Status
          </button>
        </div>

        {result && (
          <div
            className="rounded-lg p-4 overflow-auto max-h-96"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ── Retry Failed Images ── */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Retry Failed Chapter Images
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308' }}>
            <AlertTriangle size={10} /> Recovery
          </span>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Cari chapter dengan 0 gambar, re-scrape halaman source untuk dapat URL gambar baru,
          lalu download & upload ke R2. Berguna kalau CDN lama sudah mati.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Limit chapters
            </label>
            <input
              type="number"
              value={retryLimit}
              onChange={e => setRetryLimit(Number(e.target.value))}
              min={1}
              max={200}
              className="rounded-lg px-3 py-2 text-sm w-24"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            />
          </div>
          <button
            onClick={runRetry}
            disabled={retryStatus === 'loading'}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {retryStatus === 'loading' ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {retryStatus === 'loading' ? 'Starting...' : 'Retry Failed Images'}
          </button>
          <button
            onClick={checkRetryStatus}
            disabled={retryStatus === 'loading'}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            <RefreshCw size={14} />
            Check Progress
          </button>
        </div>

        {/* Show running job indicator */}
        {(() => {
          const data = retryResult?.data as Record<string, unknown> | undefined;
          const job = data?.running_job as { processed_items: number; total_items: number } | undefined;
          if (!job) return null;
          return (
            <div
              className="rounded-lg p-3 flex items-center gap-2 text-sm"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
            >
              <RefreshCw size={14} className="animate-spin text-blue-500" />
              <span style={{ color: 'var(--text-secondary)' }}>
                {`Job running: ${job.processed_items}/${job.total_items} chapters processed`}
              </span>
            </div>
          );
        })()}

        {/* Show success message */}
        {retryStatus === 'success' && retryResult?.total != null && (
          <div
            className="rounded-lg p-3 flex items-center gap-2 text-sm"
            style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <CheckCircle size={14} className="text-green-500" />
            <span style={{ color: 'var(--text-secondary)' }}>
              {`Job dimulai untuk ${String(retryResult.total)} chapters. Cek progress di Import Jobs.`}
            </span>
          </div>
        )}

        {retryResult && (
          <div
            className="rounded-lg p-4 overflow-auto max-h-96"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {JSON.stringify(retryResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ── Regenerate Thumbnails ── */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Regenerate Chapter Thumbnails
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- lucide icon, not an <img> */}
            <Image size={10} /> Thumbnail
          </span>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Update thumbnail chapter agar pakai gambar ke-5 (bukan gambar pertama).
          Fix bug thumbnail yang masih menampilkan gambar halaman cover.
          Kosongkan Manga ID untuk memproses semua manga.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Limit chapters
            </label>
            <input
              type="number"
              value={thumbLimit}
              onChange={e => setThumbLimit(Number(e.target.value))}
              min={1}
              max={2000}
              className="rounded-lg px-3 py-2 text-sm w-24"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Manga ID (opsional)
            </label>
            <input
              type="text"
              value={thumbMangaId}
              onChange={e => setThumbMangaId(e.target.value)}
              placeholder="UUID manga..."
              className="rounded-lg px-3 py-2 text-sm w-64"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            />
          </div>
          <button
            onClick={runRegenerate}
            disabled={thumbStatus === 'loading'}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {thumbStatus === 'loading' ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {thumbStatus === 'loading' ? 'Starting...' : 'Regenerate Thumbnails'}
          </button>
          <button
            onClick={checkThumbStatus}
            disabled={thumbStatus === 'loading'}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            <RefreshCw size={14} />
            Check Progress
          </button>
        </div>

        {/* Show running job indicator with progress bar */}
        {(() => {
          const data = thumbResult?.data as Record<string, unknown> | undefined;
          const job = data?.running_job as { processed_items: number; total_items: number } | undefined;
          if (!job) return null;
          const pct = job.total_items > 0 ? Math.round((job.processed_items / job.total_items) * 100) : 0;
          return (
            <div
              className="rounded-lg p-4 space-y-2"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
            >
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw size={14} className="animate-spin text-blue-500" />
                <span style={{ color: 'var(--text-secondary)' }}>
                  {`Job running: ${job.processed_items}/${job.total_items} chapters (${pct}%)`}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #3b82f6, #6366f1)' }}
                />
              </div>
            </div>
          );
        })()}

        {/* Show completion message */}
        {thumbCompleted && (
          <div
            className="rounded-lg p-3 flex items-center gap-2 text-sm"
            style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <CheckCircle size={14} className="text-green-500" />
            <span style={{ color: 'var(--text-secondary)' }}>
              ✅ Job regenerate thumbnail selesai! Semua chapter sudah di-update ke gambar ke-5.
            </span>
          </div>
        )}

        {/* Show success message */}
        {thumbStatus === 'success' && thumbResult?.total != null && !thumbJobId && (
          <div
            className="rounded-lg p-3 flex items-center gap-2 text-sm"
            style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <CheckCircle size={14} className="text-green-500" />
            <span style={{ color: 'var(--text-secondary)' }}>
              {`Job dimulai untuk ${String(thumbResult.total)} chapters. Progress akan update otomatis di bawah...`}
            </span>
          </div>
        )}

        {thumbResult && (
          <div
            className="rounded-lg p-4 overflow-auto max-h-96"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {JSON.stringify(thumbResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ── Info ── */}
      <div
        className="rounded-xl p-5 space-y-2"
        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Info size={14} className="text-blue-500" /> Info
        </p>
        <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>• <strong>Bulk Migration</strong> (lebih dari 10,000 images): Gunakan <strong>local scripts</strong> di terminal VSC</li>
          <li>• <strong>Cover Migration</strong>: Download cover manga ke R2 (max 200 per batch, OK di Vercel)</li>
          <li>• <strong>Retry Failed Images</strong>: Re-scrape chapter yang gagal (max 200 per batch, OK di Vercel)</li>
          <li>• <strong>Regenerate Thumbnails</strong>: Update thumbnail pakai gambar ke-5 (max 2000 per batch, OK di Vercel)</li>
          <li>• Semua proses berjalan di background, cek progress di Import Jobs</li>
        </ul>
      </div>
    </div>
  );
}