'use client';

import { useState, useEffect, useCallback } from 'react';
import { Ticket, Plus, Trash2, Copy, Check, RefreshCw, Crown } from 'lucide-react';

interface VoucherCode {
  id: string;
  code: string;
  plan: '1-month' | '3-month' | '6-month';
  created_by: string | null;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
  users?: { id: string; email: string; username: string | null } | null;
}

const PLAN_LABELS: Record<string, string> = {
  '1-month': '1 Bulan',
  '3-month': '3 Bulan',
  '6-month': '6 Bulan',
};

export default function VoucherCodesPage() {
  const [codes, setCodes] = useState<VoucherCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);

  // Generate form
  const [genPlan, setGenPlan] = useState<'1-month' | '3-month' | '6-month'>('1-month');
  const [genCount, setGenCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<VoucherCode[]>([]);
  const [genError, setGenError] = useState<string | null>(null); // Bug fix #6: error feedback

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', page.toString());
    if (statusFilter) params.set('status', statusFilter);
    if (planFilter) params.set('plan', planFilter);

    try {
      const res = await fetch(`/api/v1/admin/voucher-codes?${params}`);
      const data = await res.json();
      setCodes(data.codes ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      // Bug fix #6: catch network errors instead of silently crashing
      setCodes([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, planFilter]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratedCodes([]);
    setGenError(null); // Bug fix #6: reset error
    try {
      const res = await fetch('/api/v1/admin/voucher-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: genPlan, count: genCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || 'Gagal generate kode');
        return;
      }
      if (data.codes) {
        setGeneratedCodes(data.codes);
        fetchCodes();
      }
    } catch {
      // Bug fix #6: show error to user, not just console.error
      setGenError('Gagal terhubung ke server');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus kode ini?')) return;
    try {
      const res = await fetch('/api/v1/admin/voucher-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      // Bug fix #6: verify delete success before refetch
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Gagal menghapus kode');
        return;
      }
      fetchCodes();
    } catch {
      alert('Gagal terhubung ke server');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAllCodes = () => {
    const allCodes = codes
      .filter(c => !c.used_by)
      .map(c => `${c.code} (${PLAN_LABELS[c.plan]})`)
      .join('\n');
    navigator.clipboard.writeText(allCodes);
    setCopied('all');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyGenerated = () => {
    const text = generatedCodes.map(c => c.code).join('\n');
    navigator.clipboard.writeText(text);
    setCopied('generated');
    setTimeout(() => setCopied(null), 2000);
  };

  // Stats
  const activeCount = codes.filter(c => !c.used_by).length;
  const usedCount = codes.filter(c => c.used_by).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Voucher Codes
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Generate & kelola kode VIP voucher
          </p>
        </div>
        <button
          onClick={fetchCodes}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: total, color: 'var(--color-primary)' },
          { label: 'Aktif', value: activeCount, color: '#22c55e' },
          { label: 'Digunakan', value: usedCount, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Generate */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Plus size={16} style={{ color: 'var(--color-primary)' }} /> Generate Kode Baru
        </h2>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Paket</label>
            <select
              value={genPlan}
              onChange={e => setGenPlan(e.target.value as '1-month' | '3-month' | '6-month')}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            >
              <option value="1-month">1 Bulan</option>
              <option value="3-month">3 Bulan</option>
              <option value="6-month">6 Bulan</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Jumlah</label>
            <input
              type="number"
              min={1}
              max={100}
              value={genCount}
              onChange={e => setGenCount(Math.min(100, Math.max(1, Number(e.target.value))))}
              className="rounded-lg px-3 py-2 text-sm w-20"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {generating ? <RefreshCw size={14} className="animate-spin" /> : <Ticket size={14} />}
            Generate {genCount} Kode
          </button>
        </div>

        {/* Bug fix #6: Show generate error feedback */}
        {genError && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
          >
            <span>⚠️</span>
            <span>{genError}</span>
          </div>
        )}

        {/* Generated codes result */}
        {generatedCodes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                ✅ {generatedCodes.length} kode berhasil di-generate:
              </p>
              <button
                onClick={copyGenerated}
                className="flex items-center gap-1 text-xs font-medium rounded px-2 py-1 transition-colors hover:opacity-80"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--color-primary)' }}
              >
                {copied === 'generated' ? <Check size={12} /> : <Copy size={12} />}
                Copy Semua
              </button>
            </div>
            <div
              className="rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs space-y-1"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
            >
              {generatedCodes.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <span>{c.code}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{PLAN_LABELS[c.plan]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
        >
          <option value="">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="used">Digunakan</option>
        </select>
        <select
          value={planFilter}
          onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
        >
          <option value="">Semua Paket</option>
          <option value="1-month">1 Bulan</option>
          <option value="3-month">3 Bulan</option>
          <option value="6-month">6 Bulan</option>
        </select>
        {codes.filter(c => !c.used_by).length > 0 && (
          <button
            onClick={copyAllCodes}
            className="flex items-center gap-1 text-xs font-medium rounded-lg px-3 py-2 transition-colors hover:opacity-80"
            style={{ background: 'var(--bg-secondary)', color: 'var(--color-primary)', border: '1px solid var(--border-light)' }}
          >
            {copied === 'all' ? <Check size={12} /> : <Copy size={12} />}
            {copied === 'all' ? 'Copied!' : 'Copy Kode Aktif'}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Kode</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Paket</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Digunakan Oleh</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Tanggal</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    Memuat...
                  </td>
                </tr>
              ) : codes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    Belum ada kode voucher
                  </td>
                </tr>
              ) : (
                codes.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{c.code}</code>
                        <button
                          onClick={() => copyToClipboard(c.code, c.id)}
                          className="transition-opacity hover:opacity-70"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {copied === c.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: 'rgba(255,107,53,0.1)', color: 'var(--color-primary)' }}>
                        <Crown size={10} /> {PLAN_LABELS[c.plan]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.used_by ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                          Digunakan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                          Aktif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {c.users ? (c.users.username ?? c.users.email) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(c.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!c.used_by && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="transition-opacity hover:opacity-70"
                          style={{ color: '#ef4444' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-30"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            ← Prev
          </button>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-30"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}