'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Download, RefreshCw, Play, CheckCircle, XCircle,
  Clock, BookOpen, FileText, AlertTriangle, Zap, StopCircle,
} from 'lucide-react';

interface ImportJob {
  id: string;
  job_type: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total_items: number;
  processed_items: number;
  new_manga: number;
  updated_manga: number;
  skipped_items: number;
  errors: Array<{ url?: string; error: string }> | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_by: string | null;
}

interface DashboardStats {
  totalManga: number;
  mangaWithSource: number;
  totalChapters: number;
  mangaWithoutChapters: number;
  recentJobs: ImportJob[];
}

const JOB_PAGE_SIZE = 10;

export function ImportDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [jobPage, setJobPage] = useState(1);
  const [includeImages, setIncludeImages] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/import-stats');
      if (!res.ok) return;
      const json = await res.json() as { status: string; data: DashboardStats };
      if (json.status === 'success') setStats(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setJobPage(1);
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchStats();
    const t = setInterval(fetchStats, 15000); // auto-refresh setiap 15s
    return () => clearInterval(t);
  }, [fetchStats]);

  const triggerBulkImport = async (onlyMissing: boolean) => {
    setBulkLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/admin/scrape/bulk-chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50, onlyMissing, metadataOnly: !includeImages }),
      });
      const json = await res.json() as { status?: string; message?: string; queued?: number; error?: string };
      if (res.ok && json.status === 'success') {
        setMessage({ type: 'success', text: `${json.message} (${json.queued} manga di-queue)` });
        setTimeout(fetchStats, 2000);
      } else {
        setMessage({ type: 'error', text: json.error ?? 'Gagal memulai bulk import' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setBulkLoading(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    setCancellingId(jobId);
    try {
      const res = await fetch(`/api/v1/admin/import-jobs/${jobId}/cancel`, { method: 'POST' });
      const json = await res.json() as { status?: string; message?: string; error?: string };
      if (res.ok) {
        setMessage({ type: 'success', text: json.message ?? 'Job dibatalkan' });
        void fetchStats();
      } else {
        setMessage({ type: 'error', text: json.error ?? 'Gagal membatalkan job' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setCancellingId(null);
    }
  };

  const statusIcon = (status: ImportJob['status']) => {
    if (status === 'running') return <RefreshCw size={14} className="animate-spin text-blue-400" />;
    if (status === 'completed') return <CheckCircle size={14} className="text-green-400" />;
    if (status === 'failed') return <XCircle size={14} className="text-red-400" />;
    return <AlertTriangle size={14} className="text-yellow-400" />;
  };

  const statusLabel = (status: ImportJob['status']) => ({
    running:   'BERJALAN',
    completed: 'SELESAI',
    failed:    'GAGAL',
    cancelled: 'DIBATALKAN',
  }[status] ?? status.toUpperCase());

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const jobTypeLabel = (t: string) => ({
    sitemap_import: 'Import Sitemap',
    bulk_chapters:  'Import Chapter Massal',
    chapter_import: 'Import Chapter',
  }[t] ?? t);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'rgba(255,107,53,0.12)' }}>
            <Download size={18} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Import Dashboard</h1>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Monitor & kelola import manga + chapter</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl" style={{ background: 'var(--bg-secondary)' }} />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={<BookOpen size={16} />} label="Total Manga" value={stats.totalManga} color="blue" />
          <StatCard icon={<Zap size={16} />} label="Punya Source URL" value={stats.mangaWithSource} color="orange" />
          <StatCard icon={<FileText size={16} />} label="Total Chapter" value={stats.totalChapters} color="green" />
          <StatCard icon={<AlertTriangle size={16} />} label="Belum Ada Chapter" value={stats.mangaWithoutChapters} color="yellow" />
        </div>
      ) : null}

      {/* Aksi cepat */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Aksi Cepat</h2>

          {/* Toggle: sertakan gambar */}
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <span className="text-xs" style={{ color: includeImages ? 'var(--color-primary)' : 'var(--text-tertiary)' }}>
              {includeImages ? 'Sertakan Gambar (lambat)' : 'Metadata Saja (cepat)'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={includeImages}
              onClick={() => setIncludeImages(v => !v)}
              className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
              style={{ background: includeImages ? 'var(--color-primary)' : 'var(--border-light)' }}
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                style={{ transform: includeImages ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </button>
          </label>
        </div>

        {/* Peringatan jika mode gambar aktif */}
        {includeImages && (
          <div className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            <span>Mode <b>Sertakan Gambar</b> aktif — setiap chapter akan scrape gambar satu per satu (2–3 detik/chapter). Untuk manga dengan 100+ chapter bisa memakan waktu sangat lama. Gunakan hanya untuk manga dengan chapter sedikit.</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <ActionButton
            icon={<Play size={14} />}
            label="Import Chapter Semua Manga"
            description="Sync chapters dari source URL (hanya tambah yang baru)"
            color="primary"
            loading={bulkLoading}
            onClick={() => triggerBulkImport(false)}
          />
          <ActionButton
            icon={<Download size={14} />}
            label="Import Manga Tanpa Chapter"
            description="Hanya manga yang belum punya chapter sama sekali"
            color="secondary"
            loading={bulkLoading}
            onClick={() => triggerBulkImport(true)}
          />
        </div>

        {message && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs"
            style={{
              background: message.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              color: message.type === 'success' ? '#22c55e' : '#ef4444',
              border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Riwayat import jobs */}
      <div className="rounded-xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border-light)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Riwayat Import Job</h2>
          {stats && stats.recentJobs.length > 0 && (
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {stats.recentJobs.length} job
            </span>
          )}
        </div>

        {!stats || stats.recentJobs.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Belum ada import job
          </div>
        ) : (() => {
          const allJobs = stats.recentJobs;
          const totalJobPages = Math.max(1, Math.ceil(allJobs.length / JOB_PAGE_SIZE));
          const pagedJobs = allJobs.slice((jobPage - 1) * JOB_PAGE_SIZE, jobPage * JOB_PAGE_SIZE);
          return (
            <>
              <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                {pagedJobs.map(job => (
                  <div key={job.id} className="flex items-center gap-3 px-4 py-3 text-xs">
                    {statusIcon(job.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {jobTypeLabel(job.job_type)}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                          style={{
                            background: ({
                              running: 'rgba(59,130,246,0.12)', completed: 'rgba(34,197,94,0.12)',
                              failed: 'rgba(239,68,68,0.12)', cancelled: 'rgba(156,163,175,0.12)',
                            } as Record<string, string>)[job.status] ?? 'rgba(156,163,175,0.12)',
                            color: ({
                              running: '#3b82f6', completed: '#22c55e',
                              failed: '#ef4444', cancelled: '#9ca3af',
                            } as Record<string, string>)[job.status] ?? '#9ca3af',
                          }}
                        >
                          {statusLabel(job.status)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {fmtDate(job.started_at)}
                        </span>
                        <span>{job.processed_items}/{job.total_items} diproses</span>
                        {job.new_manga > 0 && <span className="text-green-400">+{job.new_manga} manga baru</span>}
                        {job.updated_manga > 0 && (
                          <span className="text-blue-400">
                            ↑{job.updated_manga} {job.job_type === 'bulk_chapters' ? 'manga diperbarui' : 'diupdate'}
                          </span>
                        )}
                        {job.skipped_items > 0 && <span className="text-yellow-500">⤻{job.skipped_items} skip</span>}
                      </div>
                    </div>
                    {job.status === 'running' && (
                      <button
                        onClick={() => void cancelJob(job.id)}
                        disabled={cancellingId === job.id}
                        title="Batalkan job ini"
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-opacity disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        <StopCircle size={11} />
                        {cancellingId === job.id ? '...' : 'Batalkan'}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalJobPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-2.5" style={{ borderColor: 'var(--border-light)' }}>
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {(jobPage - 1) * JOB_PAGE_SIZE + 1}–{Math.min(jobPage * JOB_PAGE_SIZE, allJobs.length)} dari {allJobs.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setJobPage(1)}
                      disabled={jobPage === 1}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-xs disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-secondary)' }}
                    >«</button>
                    <button
                      onClick={() => setJobPage(p => Math.max(1, p - 1))}
                      disabled={jobPage === 1}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-xs disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-secondary)' }}
                    >‹</button>
                    {Array.from({ length: Math.min(5, totalJobPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(jobPage - 2, totalJobPages - 4));
                      const p = start + i;
                      return (
                        <button
                          key={p}
                          onClick={() => setJobPage(p)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium"
                          style={{
                            background: p === jobPage ? 'var(--color-primary)' : 'transparent',
                            color: p === jobPage ? '#fff' : 'var(--text-secondary)',
                          }}
                        >{p}</button>
                      );
                    })}
                    <button
                      onClick={() => setJobPage(p => Math.min(totalJobPages, p + 1))}
                      disabled={jobPage === totalJobPages}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-xs disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-secondary)' }}
                    >›</button>
                    <button
                      onClick={() => setJobPage(totalJobPages)}
                      disabled={jobPage === totalJobPages}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-xs disabled:opacity-30 hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-secondary)' }}
                    >»</button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number;
  color: 'blue' | 'orange' | 'green' | 'yellow';
}) {
  const colors = {
    blue: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
    orange: { bg: 'rgba(255,107,53,0.1)', text: 'var(--color-primary)' },
    green: { bg: 'rgba(34,197,94,0.1)', text: '#22c55e' },
    yellow: { bg: 'rgba(234,179,8,0.1)', text: '#eab308' },
  }[color];

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
      <div className="mb-2 flex size-7 items-center justify-center rounded-lg" style={{ background: colors.bg, color: colors.text }}>
        {icon}
      </div>
      <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value.toLocaleString('id-ID')}</div>
      <div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
    </div>
  );
}

function ActionButton({ icon, label, description, color, loading, onClick }: {
  icon: React.ReactNode; label: string; description: string;
  color: 'primary' | 'secondary'; loading: boolean; onClick: () => void;
}) {
  const isPrimary = color === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-start gap-2.5 rounded-xl p-3 text-left transition-opacity disabled:opacity-60"
        style={{
        background: isPrimary ? 'var(--color-primary)' : 'var(--bg-tertiary)',
        border: isPrimary ? 'none' : '1px solid var(--border-light)',
        minWidth: 220,
      }}
    >
      <span
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg"
        style={{ background: isPrimary ? 'rgba(255,255,255,0.2)' : 'rgba(255,107,53,0.1)', color: isPrimary ? 'white' : 'var(--color-primary)' }}
      >
        {loading ? <RefreshCw size={12} className="animate-spin" /> : icon}
      </span>
      <div>
        <div className="text-xs font-semibold" style={{ color: isPrimary ? 'white' : 'var(--text-primary)' }}>{label}</div>
        <div className="mt-0.5 text-[11px]" style={{ color: isPrimary ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)' }}>{description}</div>
      </div>
    </button>
  );
}
