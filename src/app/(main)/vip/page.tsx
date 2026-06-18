import Link from 'next/link';
import { Crown, Check, Zap, Lock, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { VoucherRedeemForm } from '@/components/payment/VoucherRedeemForm';
import { MarketplaceLinks } from '@/components/payment/MarketplaceLinks';

export const metadata: Metadata = {
  title: 'VIP — OLLUQ',
  description: 'Upgrade ke OLLUQ VIP untuk akses penuh konten 18+, baca tanpa iklan, badge eksklusif, dan semua chapter terbuka. Mulai dari Rp 15.000.',
  openGraph: {
    title: 'OLLUQ VIP — Beyond Every Story',
    description: 'Bebas baca 18+, tanpa iklan, akses semua chapter. Mulai dari Rp 15.000/bulan.',
  },
};

const BENEFITS = [
  { title: 'Bebas Baca 18+', desc: 'Akses penuh semua chapter konten Mature, Ecchi, Adult, Smut, dan genre dewasa lainnya' },
  { title: 'Baca Tanpa Iklan', desc: 'Pengalaman membaca tanpa gangguan iklan sama sekali' },
  { title: 'Akses Seluruh Chapter', desc: 'Buka semua chapter yang terkunci di manga 18+ (gratisan cuma bisa 3 chapter awal)' },
  { title: 'Badge VIP', desc: 'Tampilkan status VIP eksklusif di profil dan komentar kamu' },
];

const PACKAGES = [
  { plan: '1 Bulan', price: 'Rp 15.000', code: '1-month' },
  { plan: '3 Bulan', price: 'Rp 40.000', code: '3-month', badge: 'Hemat 11%' },
  { plan: '6 Bulan', price: 'Rp 75.000', code: '6-month', badge: 'Hemat 17%' },
];

interface Props {
  searchParams: Promise<{ reason?: string; manga?: string }>;
}

export default async function VIPPage({ searchParams }: Props) {
  const { reason, manga } = await searchParams;
  const isMatureGate = reason === 'mature';

  const supabase = await createClient();

  // ── Check if user is already VIP ──
  let isVip = false;
  let vipExpiresAt: string | null = null;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase
      .from('users')
      .select('vip_expires_at, role')
      .eq('id', user.id)
      .single();
    const row = data as { vip_expires_at?: string | null; role?: string | null } | null;
    if (row?.role === 'ADMIN') {
      isVip = true;
    } else {
      const exp = row?.vip_expires_at ?? null;
      isVip = !!exp && new Date(exp) > new Date();
      vipExpiresAt = isVip ? exp : null;
    }
  }

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
    settingsMap[row.key] = typeof row.value === 'string' ? row.value : String(row.value ?? '');
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
          style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.35)' }}
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
          style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)' }}
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

      {/* Hero */}
      <div className="text-center space-y-3">
        <div
          className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(245,158,11,0.15)' }}
        >
          <Crown size={32} className="text-amber-500" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
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
        {BENEFITS.map(b => (
          <div
            key={b.title}
            className="rounded-xl border p-4 space-y-1"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
          >
            <div className="flex items-center gap-2">
              <Check size={14} className="text-emerald-500 shrink-0" />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{b.title}</span>
            </div>
            <p className="text-xs pl-5" style={{ color: 'var(--text-tertiary)' }}>{b.desc}</p>
          </div>
        ))}
      </div>

      {/* Pricing cards */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
          Pilih Paket VIP
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PACKAGES.map(p => {
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
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.plan}</p>
                <p className="text-lg font-bold" style={{ color: isBest ? '#f59e0b' : 'var(--color-primary)' }}>{p.price}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Marketplace + How to Buy */}
      <MarketplaceLinks links={marketLinks} />

      {/* Voucher Redeem */}
      <VoucherRedeemForm />

      {/* FAQ / Help */}
      <div
        className="rounded-2xl border p-4 text-sm space-y-2"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
      >
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Pertanyaan yang sering ditanya
        </p>
        <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>Kode voucher gak masuk-masuk?</span> Tunggu 5-10 menit setelah pembayaran confirmed. Kalo masih gak ada, chat admin.</p>
        <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>Voucher expired?</span> Semua voucher berlaku 30 hari dari tanggal pembelian. Buruan redeem ya!</p>
        <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>Bisa refund?</span> Karena ini produk digital, gak bisa refund setelah kode udah dikirim.</p>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #f59e0b 0%, var(--color-primary) 100%)' }}
        >
          <Zap size={14} />
          Kembali Baca Manga
        </Link>
      </div>
    </div>
  );
}