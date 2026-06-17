'use client';

import { useEffect, useState } from 'react';
import { X, Crown, Check, Zap, Ticket, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'vip_promo_v1';

const BENEFITS = [
  'Akses Genre 18+ (Mature, Ecchi, Adult, Smut)',
  'Baca tanpa iklan',
  'Early access chapter terbaru',
  'Badge VIP eksklusif di profil',
];

export function VIPPromoModal() {
  const { isVip } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isVip) return; // already VIP — don't show
    if (localStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(timer);
  }, [isVip]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'rgba(245,158,11,0.15)' }}
            >
              <Crown size={20} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Upgrade ke VIP
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Hanya <span className="font-semibold text-amber-500">Rp 15.000</span>/bulan
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="flex size-7 items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Benefits */}
        <ul className="space-y-2 mb-4">
          {BENEFITS.map(b => (
            <li key={b} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              {b}
            </li>
          ))}
        </ul>

        {/* Pricing */}
        <div
          className="rounded-xl border p-3 mb-4 text-center"
          style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.3)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Mulai dari</p>
          <p className="text-xl font-bold text-amber-500">Rp 15.000</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>per bulan</p>
        </div>

        {/* Gimana Cara Beli? */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <ShoppingBag size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Gimana Cara Beli?
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Tokopedia */}
            <a
              href="/vip#marketplace"
              className="flex items-center justify-center rounded-xl px-2 py-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/tokped.png" alt="Beli di Tokopedia" style={{ height: '32px', width: 'auto', maxWidth: '100%' }} className="shrink-0" />
            </a>
            {/* Shopee */}
            <a
              href="/vip#marketplace"
              className="flex items-center justify-center rounded-xl px-2 py-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/shopee.svg" alt="Beli di Shopee" style={{ height: '32px', width: 'auto', maxWidth: '100%' }} className="shrink-0" />
            </a>
          </div>
          <p className="text-[11px] mt-1.5 text-center" style={{ color: 'var(--text-tertiary)' }}>
            Klik untuk lihat link & cara pembayaran lengkap
          </p>
        </div>

        {/* Punya Code Voucher? */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Ticket size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Punya Code Voucher?
            </h3>
          </div>
          <a
            href="/vip#redeem"
            className="flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-primary)',
              color: 'var(--color-primary)',
            }}
          >
            <Ticket size={14} />
            Redeem Voucher di Sini
          </a>
        </div>

        {/* CTA */}
        <a
          href="/vip"
          className="flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #f59e0b 0%, var(--color-primary) 100%)' }}
        >
          <Zap size={14} />
          Lihat Detail VIP
        </a>
        <button
          onClick={dismiss}
          className="mt-2 w-full py-1.5 text-xs text-center transition-colors hover:underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Mungkin nanti
        </button>
      </div>
    </div>
  );
}