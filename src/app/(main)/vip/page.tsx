import Link from 'next/link';
import { Crown, Check, Zap, Lock, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { VoucherRedeemForm } from '@/components/payment/VoucherRedeemForm';
import { MarketplaceLinks } from '@/components/payment/MarketplaceLinks';
import { FreeTrialClaim } from '@/components/payment/FreeTrialClaim';
import { ReferralCard } from '@/components/payment/ReferralCard';
import { getVipStatus } from '@/lib/vip';
import { ensureReferralCode, getReferralStats } from '@/lib/referral';

export const metadata: Metadata = {
  title: 'VIP — OLLUQ',
  description:
    'Klaim FREE 1 bulan VIP atau upgrade ke OLLUQ VIP untuk akses penuh konten 18+, baca tanpa iklan, badge eksklusif, dan semua chapter terbuka. Mulai dari Rp 15.000.',
  openGraph: {
    title: 'OLLUQ VIP — Beyond Every Story',
    description:
      'FREE 1 bulan VIP! Bebas baca 18+, tanpa iklan, akses semua chapter. Klaim sekarang.',
  },
};

const BENEFITS = [
  {
    title: 'Bebas Baca 18+',
    desc: 'Akses penuh semua chapter konten Mature, Ecchi, Adult, Smut, dan genre dewasa lainnya',
  },
  {
    title: 'Baca Tanpa Iklan',
    desc: 'Pengalaman membaca tanpa gangguan iklan sama sekali',
  },
  {
    title: 'Akses Seluruh Chapter',
    desc: 'Buka semua chapter yang terkunci di manga 18+ (gratisan cuma bisa 3 chapter awal)',
  },
  {
    title: 'Badge VIP',
    desc: 'Tampilkan status VIP eksklusif di profil dan komentar kamu',
  },
];

const PACKAGES = [
  { plan: '1 Bulan', price: 'Rp 15.000', code: '1-month' },
  { plan: '3 Bulan', price: 'Rp 40.000', code: '3-month', badge: 'Hemat 11%' },
  { plan: '6 Bulan', price: 'Rp 75.000', code: '6-month', badge: 'Hemat 17%' },
];

interface Props {
  searchParams: Promise<{
    reason?: string;
    manga?: string;
    chapter?: string;
    returnTo?: string;
    ref?: string;
  }>;
}

export default async function VIPPage({ searchParams }: Props) {
  const { reason, manga, chapter, returnTo, ref } = await searchParams;
  const isMatureGate = reason === 'mature';

  // Build smart return URL: explicit returnTo > chapter+manga reconstruction > manga page
  const chapterReturnPath =
    returnTo ||
    (manga && chapter
      ? `/manga/${manga}/chapter/${chapter}`
      : manga
        ? `/manga/${manga}`
        : '/');
  const fromChapter = !!(manga || returnTo);

  const supabase = await createClient();

  // ── Check user VIP/trial status via centralised helper ──
  const vipStatus = await getVipStatus(supabase);
  const {
    isVip,
    vipExpiresAt,
    isAuthenticated,
    trialEligible,
    trialClaimedAt,
    referralCode: existingReferralCode,
    userId,
  } = vipStatus;

  // ── Referral: ensure code exists + fetch stats (authenticated users only) ──
  let referralCode = existingReferralCode;
  let referralStats = {
    totalReferrals: 0,
    successfulReferrals: 0,
    remainingSlots: 5,
    rewardDaysEarned: 0,
  };
  if (isAuthenticated && userId) {
    try {
      referralCode = await ensureReferralCode(supabase, userId);
      referralStats = await getReferralStats(supabase, userId);
    } catch {
      // Non-critical — fall back to whatever we have.
    }
  }

  // Referral code from URL (?ref=OLLUQ-XXXXXX) — pre-fill into trial claim.
  const initialReferralCode = ref?.trim().toUpperCase() || null;

  // Fetch marketplace links server-side so they render immediately (no client fetch)
  const marketKeys = [
    'marketplace_tokopedia_url',
    'marketplace_shopee_url',
    'marketplace_whatsapp_url',
    'marketplace_wa_label',
  ];
  const { data: settingRows } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', marketKeys);
  const settingsMap: Record<string, string> = {};
  for (const row of settingRows ?? []) {
    settingsMap[row.key] =
      typeof row.value === 'string' ? row.value : String(row.value ?? '');
  }
  const marketLinks = {
    tokopedia_url: settingsMap.marketplace_tokopedia_url || '',
    shopee_url: settingsMap.marketplace_shopee_url || '',
    whatsapp_url: settingsMap.marketplace_whatsapp_url || '',
    whatsapp_label: settingsMap.marketplace_wa_label || '',
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12 space-y-8 md:space-y-10">
      {/* ── Already VIP banner ── */}
      {isVip && (
        <div
          className="flex items-center gap-3 rounded-2xl border p-4"
          style={{
            background: 'rgba(34,197,94,0.08)',
            borderColor: 'rgba(34,197,94,0.35)',
          }}
        >
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(34,197,94,0.15)' }}
          >
            <Sparkles size={18} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-500">VIP Aktif 🎉</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {vipExpiresAt
                ? `Berlaku sampai ${new Date(vipExpiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}. Nikmati semua konten 18+ dan baca tanpa iklan!`
                : 'Status admin — akses penuh tanpa batas.'}
            </p>
          </div>
        </div>
      )}

      {/* Contextual banner — shown when redirected from mature content */}
      {isMatureGate && !isVip && (
        <div
          className="flex items-start gap-3 rounded-2xl border p-4"
          style={{
            background: 'rgba(245,158,11,0.08)',
            borderColor: 'rgba(245,158,11,0.4)',
          }}
        >
          <Lock size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
              Konten 18+ — Khusus VIP
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {manga
                ? `Manga ini mengandung konten dewasa. Upgrade ke VIP untuk membaca.`
                : 'Kamu perlu VIP untuk mengakses konten ini.'}
            </p>
            {manga && (
              <Link
                href={`/manga/${manga}`}
                className="mt-2 inline-flex text-xs underline hover:no-underline"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Kembali ke manga
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Free Trial Claim section (only when not VIP) ── */}
      {!isVip && (
        <FreeTrialClaim
          isAuthenticated={isAuthenticated}
          trialEligible={trialEligible}
          alreadyClaimed={!!trialClaimedAt}
          claimedExpiresAt={vipExpiresAt}
          returnTo={chapterReturnPath}
          fromChapter={fromChapter}
          initialReferralCode={initialReferralCode}
        />
      )}

      {/* ── Referral Program section (authenticated users only) ── */}
      {isAuthenticated && (
        <ReferralCard
          referralCode={referralCode}
          totalReferrals={referralStats.totalReferrals}
          remainingSlots={referralStats.remainingSlots}
          rewardDaysEarned={referralStats.rewardDaysEarned}
        />
      )}

      {/* Hero */}
      <div className="text-center space-y-3">
        <div
          className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(245,158,11,0.15)' }}
        >
          <Crown size={32} className="text-amber-500" />
        </div>
        <h1
          className="text-2xl md:text-3xl font-bold leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          OLLUQ VIP
        </h1>
        <p className="text-sm md:text-base font-semibold" style={{ color: '#f59e0b' }}>
          All Look Beyond Fantasy
        </p>
        <p className="text-sm md:text-base" style={{ color: 'var(--text-secondary)' }}>
          Dukung OLLUQ dan nikmati fitur eksklusif untuk Beyond Every Story.
        </p>
      </div>

      {/* Benefits */}
      <div className="grid gap-3 sm:grid-cols-2">
        {BENEFITS.map((b) => (
          <div
            key={b.title}
            className="rounded-xl border p-4 space-y-1"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-light)',
            }}
          >
            <div className="flex items-center gap-2">
              <Check size={14} className="text-emerald-500 shrink-0" />
              <span
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {b.title}
              </span>
            </div>
            <p className="text-xs pl-5" style={{ color: 'var(--text-tertiary)' }}>
              {b.desc}
            </p>
          </div>
        ))}
      </div>

      {/* ── Why OLLUQ? Comparison table ── */}
      <div className="space-y-3">
        <h2
          className="text-lg font-semibold text-center"
          style={{ color: 'var(--text-primary)' }}
        >
          Kenapa OLLUQ?
        </h2>
        <p className="text-xs text-center -mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Beda dengan platform lain yang penuh iklan
        </p>
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--border-light)', background: 'var(--bg-secondary)' }}
        >
          {/* Table header */}
          <div className="grid grid-cols-3 text-xs font-bold">
            <div className="p-3" style={{ color: 'var(--text-tertiary)' }}>Fitur</div>
            <div className="p-3 text-center" style={{ color: '#10b981' }}>OLLUQ</div>
            <div className="p-3 text-center" style={{ color: 'var(--text-tertiary)' }}>Lainnya</div>
          </div>
          {[
            { label: 'Iklan banner / popup', olluq: '🚫 0', others: 'Banyak' },
            { label: 'Redirect mencurigakan', olluq: 'Tidak ada', others: 'Sering' },
            { label: 'Loading halaman', olluq: 'Cepat', others: 'Lambat' },
            { label: 'Kualitas gambar', olluq: 'HD', others: 'Var' },
            { label: 'Baca nyaman', olluq: '✓', others: '✗' },
          ].map((row, i) => (
            <div
              key={row.label}
              className="grid grid-cols-3 text-xs"
              style={{
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                borderTop: '1px solid var(--border-light)',
              }}
            >
              <div className="p-3" style={{ color: 'var(--text-secondary)' }}>{row.label}</div>
              <div className="p-3 text-center font-semibold" style={{ color: '#10b981' }}>{row.olluq}</div>
              <div className="p-3 text-center" style={{ color: 'var(--text-tertiary)' }}>{row.others}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-center pt-1" style={{ color: 'var(--text-tertiary)' }}>
          🎯 OLLUQ gratis & tanpa iklan — didukung oleh VIP Members seperti kamu ❤️
        </p>
      </div>

      {/* Pricing cards */}
      <div className="space-y-3">
        <h2
          className="text-lg font-semibold text-center"
          style={{ color: 'var(--text-primary)' }}
        >
          Pilih Paket VIP
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PACKAGES.map((p) => {
            const isBest = p.code === '3-month';
            return (
              <div
                key={p.code}
                className="relative rounded-xl border p-4 text-center space-y-2"
                style={{
                  background: isBest ? 'rgba(245,158,11,0.06)' : 'var(--bg-secondary)',
                  borderColor: isBest ? 'rgba(245,158,11,0.4)' : 'var(--border-light)',
                  boxShadow: isBest ? '0 0 24px rgba(245,158,11,0.1)' : 'none',
                }}
              >
                {p.badge && (
                  <span
                    className="absolute -top-2 right-3 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: '#f59e0b' }}
                  >
                    {p.badge}
                  </span>
                )}
                <p
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {p.plan}
                </p>
                <p
                  className="text-lg font-bold"
                  style={{ color: isBest ? '#f59e0b' : 'var(--color-primary)' }}
                >
                  {p.price}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Marketplace + How to Buy */}
      <MarketplaceLinks links={marketLinks} />

      {/* Voucher Redeem */}
      <VoucherRedeemForm />

      {/* Referral program info (for guests/not-yet-eligible) */}
      {!isAuthenticated && (
        <div
          className="rounded-2xl border p-4 text-center space-y-1"
          style={{
            background: 'rgba(139,92,246,0.05)',
            borderColor: 'rgba(139,92,246,0.2)',
          }}
        >
          <p className="text-sm font-bold" style={{ color: '#8b5cf6' }}>
            🎁 Ajak Teman, Dapat VIP Gratis!
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Login & klaim free trial dulu, lalu bagikan kode referral-mu. Kamu & teman
            dapat +7 hari VIP bonus!
          </p>
        </div>
      )}

      {/* FAQ / Help */}
      <div
        className="rounded-2xl border p-4 text-sm space-y-2"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-light)',
          color: 'var(--text-secondary)',
        }}
      >
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Pertanyaan yang sering ditanya
        </p>
        <p>
          <span
            className="font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Kode voucher gak masuk-masuk?
          </span>{' '}
          Tunggu 5-10 menit setelah pembayaran confirmed. Kalo masih gak ada, chat admin.
        </p>
        <p>
          <span
            className="font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Voucher expired?
          </span>{' '}
          Semua voucher berlaku 30 hari dari tanggal pembelian. Buruan redeem ya!
        </p>
        <p>
          <span
            className="font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Bisa refund?
          </span>{' '}
          Karena ini produk digital, gak bisa refund setelah kode udah dikirim.
        </p>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, var(--color-primary) 100%)',
          }}
        >
          <Zap size={14} />
          Kembali Baca Manga
        </Link>
      </div>
    </div>
  );
}