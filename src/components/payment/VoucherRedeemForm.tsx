'use client';

import { useState } from 'react';
import { Ticket, Check, AlertCircle } from 'lucide-react';
import OlluqLoader from '@/components/ui/OlluqLoader';

/** Auto-format voucher code: OLLUQ-XXXX-XXXX (3 groups) */
function formatVoucherCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const parts = [clean.slice(0, 5), clean.slice(5, 9), clean.slice(9, 13)];
  return parts.filter(Boolean).join('-');
}

export function VoucherRedeemForm() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(formatVoucherCode(e.target.value));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setCode(formatVoucherCode(e.clipboardData.getData('text')));
  };

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
      id="redeem"
      className="rounded-2xl border p-4 sm:p-6 space-y-4 scroll-mt-4"
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
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Punya Kode Voucher?
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Masukin kode di sini, VIP lu langsung aktif
          </p>
        </div>
      </div>

      <form onSubmit={handleRedeem} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={code}
            onChange={handleChange}
            onPaste={handlePaste}
            placeholder="OLLUQ-XXXX-XXXX"
            maxLength={14}
            autoComplete="off"
            spellCheck={false}
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
            className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {loading ? (
              <OlluqLoader size="sm" />
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
        Belum punya kode? Scroll ke atas buat beli via Tokopedia/Shopee 👆
      </p>
    </div>
  );
}