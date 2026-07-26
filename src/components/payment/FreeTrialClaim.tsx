'use client';

import { useState, useEffect } from 'react';
import { Gift, Loader2, CheckCircle2, LogIn, BookOpen, Home, PartyPopper, Check, AlertTriangle, Clock, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface FreeTrialClaimProps {
  /** True if user is logged in. */
  isAuthenticated: boolean;
  /** True if user is still eligible to claim (never claimed, not VIP). */
  trialEligible: boolean;
  /** True if trial already claimed (to show "claimed" state). */
  alreadyClaimed: boolean;
  /** ISO date string of when the existing trial expires (if already claimed). */
  claimedExpiresAt?: string | null;
  /** URL to return to after claim (e.g. chapter page). Default: '/' */
  returnTo?: string;
  /** True when user just came back from a chapter that triggered the gate. */
  fromChapter?: boolean;
  /** Pre-filled referral code from URL ?ref= param. */
  initialReferralCode?: string | null;
}

type ClaimState = 'idle' | 'loading' | 'success' | 'error';

export function FreeTrialClaim({
  isAuthenticated,
  trialEligible,
  alreadyClaimed,
  claimedExpiresAt,
  returnTo,
  fromChapter,
  initialReferralCode,
}: FreeTrialClaimProps) {
  const [state, setState] = useState<ClaimState>('idle');
  const [message, setMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [referralCode, setReferralCode] = useState(initialReferralCode ?? '');
  const [referralRewarded, setReferralRewarded] = useState(false);
  const [showReferralInput, setShowReferralInput] = useState(
    !!initialReferralCode && !alreadyClaimed
  );
  const router = useRouter();

  // Smart return URL: prefer chapter, fallback to home.
  const targetPath = returnTo || '/';
  const loginRedirect = `/vip${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`;

  // Auto-redirect to chapter 3s after successful claim (only when from chapter).
  useEffect(() => {
    if (state === 'success' && fromChapter && returnTo) {
      const t = setTimeout(() => router.push(returnTo), 3000);
      return () => clearTimeout(t);
    }
  }, [state, fromChapter, returnTo, router]);

  async function handleClaim() {
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/v1/vip/claim-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referralCode: referralCode.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(data.error || 'Gagal klaim free trial.');
        return;
      }
      setState('success');
      setExpiresAt(data.expiresAt);
      setMessage(data.message);
      setReferralRewarded(!!data.referralRewarded);
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
          <p className="flex items-center justify-center gap-1.5 text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            <Gift size={16} className="shrink-0 text-emerald-500" />
            FREE 1 Bulan VIP!
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {fromChapter
              ? 'Login dulu untuk klaim free trial VIP 30 hari. Otomatis balik ke chapter setelah login!'
              : 'Login dulu untuk klaim free trial VIP 30 hari. Gratis, tanpa kartu kredit.'}
          </p>
        </div>
        <Link
          href={`/login?redirect=${encodeURIComponent(loginRedirect)}`}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)' }}
        >
          <LogIn size={14} />
          {fromChapter ? 'Login & Klaim Gratis' : 'Login untuk Klaim'}
        </Link>
      </div>
    );
  }

  // ── Already claimed / just claimed ──
  if (alreadyClaimed || state === 'success') {
    const expiry = expiresAt || claimedExpiresAt;
    return (
      <div
        className="rounded-2xl border p-5 text-center space-y-3"
        style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.3)' }}
      >
        <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
        <p className="flex items-center justify-center gap-1.5 text-base font-bold text-emerald-500">
          {state === 'success' ? 'VIP Trial Aktif!' : 'Free Trial Sudah Aktif!'}
          <PartyPopper size={16} className="shrink-0" />
        </p>
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
        {referralRewarded && (
          <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-500">
            <Gift size={11} className="shrink-0" />
            Bonus referral +7 hari sudah ditambahkan!
          </p>
        )}

        {/* Smart CTA: return to chapter if available */}
        {fromChapter && (
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href={targetPath}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)' }}
            >
              <BookOpen size={14} />
              Baca Chapter Sekarang
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <Home size={12} />
              Ke Beranda
            </Link>
          </div>
        )}
        {state === 'success' && fromChapter && (
          <p className="flex items-center justify-center gap-1 text-[11px] italic" style={{ color: 'var(--text-tertiary)' }}>
            <Clock size={10} className="shrink-0" />
            Mengarahkan otomatis ke chapter dalam 3 detik...
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
          <p className="flex items-center gap-1.5 text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            <Gift size={16} className="shrink-0 text-emerald-500" />
            FREE 1 Bulan VIP
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {fromChapter
              ? 'Launch Special — Klaim & langsung lanjut baca chapter ini!'
              : 'Launch Special — Klaim sekarang, berlaku 30 hari!'}
          </p>
        </div>
      </div>

      <ul className="text-xs space-y-1.5 pl-1" style={{ color: 'var(--text-secondary)' }}>
        <li className="flex items-center gap-1.5"><Check size={12} className="shrink-0 text-emerald-500" /> Akses semua chapter 18+ tanpa batas</li>
        <li className="flex items-center gap-1.5"><Check size={12} className="shrink-0 text-emerald-500" /> Baca tanpa iklan</li>
        <li className="flex items-center gap-1.5"><Check size={12} className="shrink-0 text-emerald-500" /> Tanpa kartu kredit, langsung aktif</li>
        <li className="flex items-center gap-1.5"><AlertTriangle size={12} className="shrink-0 text-amber-500" /> Hanya 1x per akun</li>
      </ul>

      {/* Referral code input (collapsible) */}
      {!alreadyClaimed && (
        <div className="space-y-1.5">
          {showReferralInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="OLLUQ-XXXXXX"
                className="flex-1 rounded-xl border px-3 py-2 text-xs font-mono uppercase tracking-wider"
                style={{
                  borderColor: 'rgba(34,197,94,0.3)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
                maxLength={12}
              />
              {!initialReferralCode && (
                <button
                  type="button"
                  onClick={() => {
                    setShowReferralInput(false);
                    setReferralCode('');
                  }}
                 className="rounded-xl px-2 text-xs"
                   style={{ color: 'var(--text-tertiary)' }}
                 >
                   <X size={12} />
                 </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowReferralInput(true)}
              className="flex items-center gap-1 text-[11px] font-medium underline transition-opacity hover:opacity-70"
               style={{ color: 'rgba(34,197,94,0.9)' }}
             >
               <Gift size={11} className="shrink-0" />
               Punya kode referral? +7 hari bonus!
             </button>
          )}
        </div>
      )}

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