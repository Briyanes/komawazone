'use client';

import { useState } from 'react';
import { Play, RefreshCw, Info, AlertTriangle, CheckCircle } from 'lucide-react';

export default function StorageBackfillPage() {
  const [status, setStatus] = useState<string>('idle');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [limit, setLimit] = useState(50);

  // Retry images state
  const [retryStatus, setRetryStatus] = useState<string>('idle');
  const [retryResult, setRetryResult] = useState<Record<string, unknown> | null>(null);
  const [retryLimit, setRetryLimit] = useState(50);

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
        {retryResult?.data && (retryResult.data as Record<string, unknown>).running_job && (
          <div
            className="rounded-lg p-3 flex items-center gap-2 text-sm"
            style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
          >
            <RefreshCw size={14} className="animate-spin text-blue-500" />
            <span style={{ color: 'var(--text-secondary)' }}>
              {(() => {
                const job = (retryResult.data as Record<string, unknown>).running_job as { processed_items: number; total_items: number } | undefined;
                return job ? `Job running: ${job.processed_items}/${job.total_items} chapters processed` : '';
              })()}
            </span>
          </div>
        )}

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

      {/* ── Info ── */}
      <div
        className="rounded-xl p-5 space-y-2"
        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Info size={14} className="text-blue-500" /> Info
        </p>
        <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>• <strong>Cover Migration</strong>: Download cover manga dan upload ke R2</li>
          <li>• <strong>Retry Failed Images</strong>: Re-scrape chapter yang gagal download gambarnya</li>
          <li>• Kedua proses berjalan di background, cek progress di Import Jobs</li>
          <li>• Max 200 item per batch</li>
        </ul>
      </div>
    </div>
  );
}