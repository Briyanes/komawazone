'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Play, XCircle, CheckCircle, Clock, ExternalLink, Download } from 'lucide-react';

const DEFAULT_SITEMAPS = [
  'https://04x.manhwaland.land/manga-sitemap.xml',
  'https://04x.manhwaland.land/manga-sitemap2.xml',
  'https://04x.manhwaland.land/manga-sitemap3.xml',
  'https://04x.manhwaland.land/manga-sitemap4.xml',
  'https://04x.manhwaland.land/manga-sitemap5.xml',
  'https://04x.manhwaland.land/manga-sitemap6.xml',
  'https://04x.manhwaland.land/manga-sitemap7.xml',
];

interface ImportJob {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total_items: number;
  processed_items: number;
  new_manga: number;
  updated_manga: number;
  skipped_items: number;
  errors: Array<{ url: string; error: string }>;
  started_at: string;
  completed_at: string | null;
}

export function SitemapImportTool() {
  const [sitemaps, setSitemaps] = useState<string[]>(DEFAULT_SITEMAPS);
  const [newUrl, setNewUrl] = useState('');
  const [options, setOptions] = useState({
    importNew: true,
    importUpdates: true,
    batchSize: 3, // Conservative default to avoid rate-limiting
  });
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Add new sitemap URL
  const addSitemap = () => {
    if (newUrl && !sitemaps.includes(newUrl)) {
      setSitemaps([...sitemaps, newUrl]);
      setNewUrl('');
    }
  };

  // Remove sitemap URL
  const removeSitemap = (url: string) => {
    setSitemaps(sitemaps.filter(s => s !== url));
  };

  // Start import
  const startImport = async () => {
    if (sitemaps.length === 0) {
      setError('Add at least one sitemap URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/admin/scrape/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sitemapUrls: sitemaps,
          options,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      // Start polling for job status
      setActiveJob({
        id: data.data.jobId,
        status: 'running',
        total_items: 0,
        processed_items: 0,
        new_manga: 0,
        updated_manga: 0,
        skipped_items: 0,
        errors: [],
        started_at: new Date().toISOString(),
        completed_at: null,
      });

      // Poll every 2 seconds
      pollIntervalRef.current = setInterval(() => pollJobStatus(data.data.jobId), 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setLoading(false);
    }
  };

  // Poll job status
  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/v1/admin/import/jobs?job_id=${jobId}`);
      const data = await response.json();

      if (data.status === 'success' && data.data.jobs.length > 0) {
        const job = data.data.jobs[0] as ImportJob;
        setActiveJob(job);

        // Stop polling if job is complete
        if (job.status !== 'running') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setLoading(false);
        }
      }
    } catch {
      // silent — polling will retry on next interval
    }
  };

  // Export to Google Sheets
  const exportToGoogleSheets = async () => {
    if (!activeJob) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/admin/export/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: activeJob.id,
          tab: 'HISTORY',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Export failed');
      }

      alert('Exported to Google Sheets successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  // Cancel job
  const cancelJob = async () => {
    if (!activeJob) return;

    try {
      await fetch('/api/v1/admin/import/jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: activeJob.id }),
      });

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      setActiveJob(null);
      setLoading(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  // Calculate progress percentage
  const progress = activeJob && activeJob.total_items > 0
    ? (activeJob.processed_items / activeJob.total_items) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Sitemap Import
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Import manga from sitemap XML files with automatic update detection
        </p>
      </div>

      {/* Sitemap URLs */}
      <div
        className="rounded-2xl border p-6 space-y-4"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
      >
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Sitemap URLs
        </h3>

        {/* URL List */}
        <div className="space-y-2">
          {sitemaps.map((url) => (
            <div
              key={url}
              className="flex items-center justify-between gap-2 p-3 rounded-lg"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                {url}
              </span>
              <button
                onClick={() => removeSitemap(url)}
                className="text-red-500 hover:text-red-600 transition-colors"
              >
                <XCircle size={16} />
              </button>
            </div>
          ))}

          {/* Add New URL */}
          <div className="flex gap-2">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="Add sitemap URL..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border-light)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={addSitemap}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-primary)' }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Import Options */}
      <div
        className="rounded-2xl border p-6 space-y-4"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
      >
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Import Options
        </h3>

        <div className="space-y-3">
          {/* Import New */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Import new manga
            </span>
            <input
              type="checkbox"
              checked={options.importNew}
              onChange={(e) => setOptions({ ...options, importNew: e.target.checked })}
              className="w-5 h-5 rounded"
              style={{ accentColor: 'var(--color-primary)' }}
            />
          </label>

          {/* Import Updates */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Check for updates
            </span>
            <input
              type="checkbox"
              checked={options.importUpdates}
              onChange={(e) => setOptions({ ...options, importUpdates: e.target.checked })}
              className="w-5 h-5 rounded"
              style={{ accentColor: 'var(--color-primary)' }}
            />
          </label>

          {/* Batch Size */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Concurrent requests: {options.batchSize}
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="20"
              value={options.batchSize}
              onChange={(e) => setOptions({ ...options, batchSize: parseInt(e.target.value) })}
              className="w-full"
              style={{ accentColor: 'var(--color-primary)' }}
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              <span>Conservative (5)</span>
              <span>Aggressive (20)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div
          className="p-4 rounded-lg text-sm"
          style={{ background: 'var(--bg-error)', color: 'var(--text-error)', border: '1px solid var(--border-error)' }}
        >
          {error}
        </div>
      )}

      {/* Active Job Progress */}
      {activeJob && (
        <div
          className="rounded-2xl border p-6 space-y-4"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Import Progress
            </h3>
            <div className="flex items-center gap-2">
              {activeJob.status === 'running' && <Clock size={16} className="animate-spin" />}
              {activeJob.status === 'completed' && <CheckCircle size={16} className="text-green-500" />}
              {activeJob.status === 'failed' && <XCircle size={16} className="text-red-500" />}
              <span className="text-xs uppercase font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                {activeJob.status}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              <span>{activeJob.processed_items} / {activeJob.total_items} processed</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${progress}%`,
                  background: 'var(--color-primary)',
                }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                {activeJob.new_manga}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>New</div>
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                {activeJob.updated_manga}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Updated</div>
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                {activeJob.skipped_items}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Skipped</div>
            </div>
          </div>

          {/* Cancel Button */}
          {activeJob.status === 'running' && (
            <button
              onClick={cancelJob}
              className="w-full px-4 py-3 text-sm font-semibold rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              Cancel Import
            </button>
          )}

          {/* Export to Google Sheets (when completed) */}
          {activeJob.status === 'completed' && (
            <button
              onClick={exportToGoogleSheets}
              disabled={loading}
              className="w-full px-4 py-3 text-sm font-semibold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#0F9D58' }}
            >
              <Download size={16} />
              {loading ? 'Exporting...' : 'Export to Google Sheets'}
            </button>
          )}

          {/* Errors */}
          {activeJob.errors.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Errors ({activeJob.errors.length})
              </h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {activeJob.errors.slice(0, 10).map((err, idx) => (
                  <div
                    key={idx}
                    className="text-xs p-2 rounded"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-error)' }}
                  >
                    {err.error}
                  </div>
                ))}
                {activeJob.errors.length > 10 && (
                  <div className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                    ... and {activeJob.errors.length - 10} more errors
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Start Button */}
      {!activeJob && (
        <button
          onClick={startImport}
          disabled={loading || sitemaps.length === 0}
          className="w-full px-6 py-4 text-lg font-bold rounded-xl text-white transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #f59e0b 0%, var(--color-primary) 100%)' }}
        >
          <Upload size={20} />
          {loading ? 'Starting Import...' : 'Start Import'}
        </button>
      )}
    </div>
  );
}