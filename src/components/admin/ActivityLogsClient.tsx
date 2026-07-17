'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Search, RefreshCw,
  Plus, Pencil, Trash2, Download as DownloadIcon, Upload as UploadIcon,
  Zap, AlertTriangle, RotateCcw, Settings as SettingsIcon, FileText,
} from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Types ──────────────────────────────────────────────────────────── */

interface LogEntry {
  id: string;
  created_at: string;
  admin_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  method: string;
  path: string;
  status_code: number | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
}

interface ApiResponse {
  status: 'success' | 'error';
  data?: LogEntry[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  error?: string;
}

/* ── Constants ──────────────────────────────────────────────────────── */

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'SCRAP', 'IMPORT', 'EXPORT', 'BULK_UPDATE', 'BULK_DELETE', 'REGENERATE', 'RETRY', 'OTHER'] as const;
const ENTITIES = ['manga', 'chapter', 'genre', 'user', 'voucher', 'voucher_code', 'settings', 'ads', 'comment', 'report', 'subscription', 'storage', 'import', 'other'] as const;

const ACTION_STYLES: Record<string, { icon: typeof Plus; bg: string; text: string }> = {
  CREATE:        { icon: Plus,           bg: 'rgba(34,197,94,0.12)',  text: '#22C55E' },
  UPDATE:        { icon: Pencil,         bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
  DELETE:        { icon: Trash2,         bg: 'rgba(239,68,68,0.12)',  text: '#EF4444' },
  BULK_UPDATE:   { icon: Pencil,         bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
  BULK_DELETE:   { icon: Trash2,         bg: 'rgba(239,68,68,0.12)',  text: '#EF4444' },
  SCRAP:         { icon: Zap,            bg: 'rgba(168,85,247,0.12)', text: '#A855F7' },
  IMPORT:        { icon: UploadIcon,     bg: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
  EXPORT:        { icon: DownloadIcon,   bg: 'rgba(99,102,241,0.12)', text: '#6366F1' },
  REGENERATE:    { icon: RotateCcw,      bg: 'rgba(14,165,233,0.12)', text: '#0EA5E9' },
  RETRY:         { icon: RotateCcw,      bg: 'rgba(14,165,233,0.12)', text: '#0EA5E9' },
  OTHER:         { icon: FileText,       bg: 'rgba(107,114,128,0.12)', text: '#6B7280' },
};

/* ── Component ──────────────────────────────────────────────────────── */

export function ActivityLogsClient() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [page, setPage]         = useState(1);
  const [action, setAction]     = useState('');
  const [entity, setEntity]     = useState('');
  const [search, setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (action) params.set('action', action);
      if (entity) params.set('entity', entity);
      if (search) params.set('search', search);

      const res = await fetch(`/api/v1/admin/activity-logs?${params.toString()}`);
      const json: ApiResponse = await res.json();

      if (json.status === 'error') throw new Error(json.error ?? 'Unknown error');

      setLogs(json.data ?? []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [page, action, entity, search]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000)    return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Activity Logs
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {total.toLocaleString()} entri — riwayat aksi admin
          </p>
        </div>
        <button
          onClick={() => void fetchLogs()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by path..."
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none transition-colors"
            style={{
              borderColor: 'var(--border-light)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Action filter */}
        <select
          value={action}
          onChange={handleFilterChange(setAction)}
          className="rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
          style={{
            borderColor: 'var(--border-light)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">All Actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {/* Entity filter */}
        <select
          value={entity}
          onChange={handleFilterChange(setEntity)}
          className="rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
          style={{
            borderColor: 'var(--border-light)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">All Entities</option>
          {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#EF4444' }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-secondary)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border-light)' }}>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: 'var(--text-tertiary)' }}>Time</th>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: 'var(--text-tertiary)' }}>Admin</th>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: 'var(--text-tertiary)' }}>Action</th>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: 'var(--text-tertiary)' }}>Entity</th>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: 'var(--text-tertiary)' }}>Method</th>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: 'var(--text-tertiary)' }}>Path</th>
                <th className="px-3 py-2.5 text-center font-semibold" style={{ color: 'var(--text-tertiary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    <RefreshCw size={20} className="mx-auto mb-2 animate-spin" />
                    Loading...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    No activity logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const style = ACTION_STYLES[log.action] ?? ACTION_STYLES.OTHER;
                  const ActionIcon = style.icon;
                  const isExpanded = expandedId === log.id;
                  const isError = log.status_code !== null && log.status_code >= 400;
                  return (
                    <>
                      <tr
                        key={log.id}
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="cursor-pointer border-b transition-colors last:border-0 hover:bg-[var(--bg-tertiary)]"
                        style={{ borderColor: 'var(--border-light)' }}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {formatDate(log.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {log.admin_email ?? 'Unknown'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ background: style.bg, color: style.text }}
                          >
                            <ActionIcon size={10} />
                            {log.action}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {log.entity_type}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                            {log.method}
                          </span>
                        </td>
                        <td className="max-w-[300px] truncate px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {log.path}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {log.status_code !== null ? (
                            <span className={cn('text-xs font-bold', isError ? 'text-red-500' : 'text-green-500')}>
                              {log.status_code}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b last:border-0" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-primary)' }}>
                          <td colSpan={7} className="px-4 py-3">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="space-y-1.5 text-xs">
                                <DetailRow label="ID" value={log.id} />
                                <DetailRow label="Entity ID" value={log.entity_id ?? '—'} />
                                <DetailRow label="IP Address" value={log.ip_address ?? '—'} />
                                <DetailRow label="User Agent" value={log.user_agent ?? '—'} />
                                <DetailRow label="Exact Time" value={new Date(log.created_at).toLocaleString('id-ID')} />
                              </div>
                              {log.details && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                                    Details
                                  </p>
                                  <pre
                                    className="max-h-48 overflow-auto rounded-lg border p-2.5 text-[11px] leading-relaxed"
                                    style={{
                                      borderColor: 'var(--border-light)',
                                      background: 'var(--bg-secondary)',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
              style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
              style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helper ─────────────────────────────────────────────────────────── */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      <span className="break-all font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {value}
      </span>
    </div>
  );
}