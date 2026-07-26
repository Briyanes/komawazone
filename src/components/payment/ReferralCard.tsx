'use client';

import { useState } from 'react';
import { Users, Copy, Check, Share2, Gift, ChevronRight } from 'lucide-react';

interface ReferralCardProps {
  /** User's referral code (OLLUQ-XXXXXX). If null, will be generated lazily. */
  referralCode: string | null;
  /** Total successful referrals. */
  totalReferrals: number;
  /** Remaining slots (max 5 - current). */
  remainingSlots: number;
  /** Total reward days earned. */
  rewardDaysEarned: number;
}

export function ReferralCard({
  referralCode,
  totalReferrals,
  remainingSlots,
  rewardDaysEarned,
}: ReferralCardProps) {
  const [copied, setCopied] = useState(false);

  // If no code yet, show prompt to generate (will happen automatically server-side).
  if (!referralCode) {
    return (
      <div
        className="rounded-2xl border p-5 space-y-2"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(168,85,247,0.04) 100%)',
          borderColor: 'rgba(139,92,246,0.25)',
        }}
      >
        <div className="flex items-center gap-2">
          <Users size={16} className="text-violet-500" />
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Program Referral
          </p>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Kode referral akan otomatis tersedia setelah kamu klaim free trial.
        </p>
      </div>
    );
  }

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/vip?ref=${referralCode}`;
  const shareText = `Baca manga/manhwa 18+ tanpa iklan di Manga Zone! Pakai kode referral saya ${referralCode} untuk klaim FREE 1 bulan VIP + bonus 7 hari. ${shareUrl}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralCode!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = referralCode!;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Manga Zone — FREE VIP 1 Bulan!',
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User cancelled share — no-op.
      }
    } else {
      handleCopy();
    }
  }

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(168,85,247,0.05) 100%)',
        borderColor: 'rgba(139,92,246,0.3)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex size-9 items-center justify-center rounded-xl"
          style={{ background: 'rgba(139,92,246,0.15)' }}
        >
          <Users size={18} className="text-violet-500" />
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            <Gift size={15} className="shrink-0 text-violet-500" />
            Ajak Teman, Dapat Bonus VIP!
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Kamu +7 hari, teman +7 hari. Maksimal 5 teman.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div
          className="rounded-xl p-2.5 text-center"
          style={{ background: 'rgba(139,92,246,0.08)' }}
        >
          <p className="text-lg font-bold text-violet-500">{totalReferrals}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            Teman
          </p>
        </div>
        <div
          className="rounded-xl p-2.5 text-center"
          style={{ background: 'rgba(139,92,246,0.08)' }}
        >
          <p className="text-lg font-bold text-violet-500">{remainingSlots}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            Slot Tersisa
          </p>
        </div>
        <div
          className="rounded-xl p-2.5 text-center"
          style={{ background: 'rgba(34,197,94,0.08)' }}
        >
          <p className="text-lg font-bold text-emerald-500">+{rewardDaysEarned}d</p>
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            Bonus VIP
          </p>
        </div>
      </div>

      {/* Referral code + copy */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
          KODE REFERRAL KAMU
        </p>
        <div className="flex gap-2">
          <div
            className="flex-1 rounded-xl border border-dashed px-3 py-2.5 text-center font-mono text-sm font-bold tracking-widest"
            style={{
              borderColor: 'rgba(139,92,246,0.4)',
              background: 'rgba(139,92,246,0.05)',
              color: 'var(--text-primary)',
            }}
          >
            {referralCode}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center rounded-xl px-3 text-white transition-opacity hover:opacity-90"
            style={{ background: 'rgba(139,92,246,0.8)' }}
            aria-label="Copy referral code"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        {copied && (
          <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-500">
            <Check size={11} className="shrink-0" />
            Kode disalin! Bagikan ke teman.
          </p>
        )}
      </div>

      {/* Share button */}
      <button
        onClick={handleShare}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)' }}
      >
        <Share2 size={14} />
        Bagikan Link Referral
      </button>

      <p className="flex items-center justify-center gap-1 text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>
        <Gift size={10} className="shrink-0" />
        Teman klaim trial pakai kodemu
        <ChevronRight size={10} className="shrink-0" />
        kamu & dia +7 hari VIP
      </p>
    </div>
  );
}