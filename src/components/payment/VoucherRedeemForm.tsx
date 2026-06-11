'use client';

import { useState } from 'react';
import { Ticket, Check, AlertCircle, Loader2 } from 'lucide-react';

export function VoucherRedeemForm() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/v1/vip/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ success: true, message: data.message });
        setCode('');
      } else {
        setResult({ success: false, message: data.error || 'Terjadi kesalahan' });
      }
    } catch {
      setResult({ success: false, message: 'Gagal terhubung ke server' });
    }

    setLoading(false);
  };

  return (
    <div
      className="rounded-2xl border p-6 space-y-4"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,107,53,0.12)' }}
        >
          <Ticket size={20} style={{ color: 'var(--color-primary)' }} />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Redeem Kode Voucher
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Masukkan kode voucher untuk mengaktifkan VIP secara otomatis
          </p>
        </div>
      </div>

      <form onSubmit={handleRedeem} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="OLLUQ-XXXX-XXXX"
            maxLength={18}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-light)',
            }}
          />
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Ticket size={16} />
            )}
            Redeem
          </button>
        </div>
      </form>

      {result && (
        <div
          className="flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{
            background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          }}
        >
          {result.success ? (
            <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          )}
          <p style={{ color: result.success ? '#22c55e' : '#ef4444' }}>
            {result.message}
          </p>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Belum punya kode? Hubungi admin atau beli voucher di toko online kami.
      </p>
    </div>
  );
}