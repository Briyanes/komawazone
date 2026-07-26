'use client';

import { useState } from 'react';
import { Gift, Loader2, CheckCircle2, LogIn } from 'lucide-react';
import Link from 'next/link';

interface FreeTrialClaimProps {
  /** True if user is logged in. */
  isAuthenticated: boolean;
  /** True if user is still eligible to claim (never claimed, not VIP). */
  trialEligible: boolean;
  /** True if trial already claimed (to show "claimed" state). */
  alreadyClaimed: boolean;
  /** ISO date string of when the existing trial expires (if already claimed). */
  claimedExpiresAt?: string | null;
}

type ClaimState = 'idle' | 'loading' | 'success' | 'error';

export function FreeTrialClaim({
  isAuthenticated,
  trialEligible,
  alreadyClaimed,
  claimedExpiresAt,
}: FreeTrialClaimProps) {
  const [state, setState] = useState<ClaimState>('idle');
  const [message, setMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  async function handleClaim() {
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/v1/vip/claim-trial', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(data.error || 'Gagal klaim free trial.');
        return;
      }
      setState('success');
      setExpiresAt(data.expiresAt);
      setMessage(data.message);
    } catch {
      setState('error');
      setMessage('Koneksi bermasalah. Coba lagi ya.');
    }
  }

  // ── Not logged in: prompt to login first ──
  if (!isAuthenticated) {
    return (
      <div
        className="rounded-2xl border p-5 text-center space-y-3"
        style={{
          background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(16,185,129,0.05) 100%)',
          borderColor: 'rgba(34,197,94,0.35)',
        }}
      >
        <div
          className="mx-auto flex size-12 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(34,197,94,0.15)' }}
        >
          <Gift size={24} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            🎁 FREE 1 Bulan VIP!
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Login dulu untuk klaim free trial VIP 30 hari. Gratis, tanpa kartu kredit.
          </p>
        </div>
        <Link
          href="/login?redirect=%2Fvip"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)' }}
        >
          <LogIn size={14} />
          Login untuk Klaim
        </Link>
      </div>
    );
  }

  // ── Already claimed ──
  if (alreadyClaimed || state === 'success') {
    const expiry = expiresAt || claimedExpiresAt;
    return (
      <div
        className="rounded-2xl border p-5 text-center space-y-2"
        style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.3)' }}
      >
        <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
        <p className="text-base font-bold text-emerald-500">Free Trial Sudah Aktif! 🎉</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {message || 'Kamu sudah klaim free trial VIP. Nikmati semua chapter 18+ sekarang!'}
        </p>
        {expiry && (
          <p className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
            Berlaku hingga:{' '}
            {new Date(expiry).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
      </div>
    );
  }

  // ── Eligible to claim ──
  if (!trialEligible) return null;

  return (
    <div
      className="rounded-2xl border p-5 space-y-3"
      style={{
        background: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(16,185,129,0.06) 100%)',
        borderColor: 'rgba(34,197,94,0.4)',
        boxShadow: '0 0 32px rgba(34,197,94,0.08)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(34,197,94,0.2)' }}
        >
          <Gift size={24} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            🎁 FREE 1 Bulan VIP
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Launch Special — Klaim sekarang, berlaku 30 hari!
          </p>
        </div>
      </div>

      <ul className="text-xs space-y-1 pl-1" style={{ color: 'var(--text-secondary)' }}>
        <li>✅ Akses semua chapter 18+ tanpa batas</li>
        <li>✅ Baca tanpa iklan</li>
        <li>✅ Tanpa kartu kredit, langsung aktif</li>
        <li>⚠️ Hanya 1x per akun</li>
      </ul>

      {state === 'error' && (
        <p className="text-xs font-medium text-red-500">{message}</p>
      )}

      <button
        onClick={handleClaim}
        disabled={state === 'loading'}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)' }}
      >
        {state === 'loading' ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Mengaktifkan...
          </>
        ) : (
          <>
            <Gift size={14} />
            Klaim FREE Trial Sekarang
          </>
        )}
      </button>
    </div>
  );
}