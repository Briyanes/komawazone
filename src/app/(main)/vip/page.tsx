import Link from 'next/link';
import { Crown, Check, Zap, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { VoucherRedeemForm } from '@/components/payment/VoucherRedeemForm';

export const metadata: Metadata = { title: 'VIP — OLLUQ' };

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12 space-y-8 md:space-y-10">

      {/* Contextual banner — shown when redirected from mature content */}
      {isMatureGate && (
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

      {/* Voucher Redeem — PRIMARY METHOD */}
      <VoucherRedeemForm />

      {/* Manual Payment Info */}
      <div
        className="rounded-2xl border p-4 sm:p-6 space-y-3"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Beli Kode Voucher via Admin
        </h2>
        <ol className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li className="flex gap-2"><span className="font-bold text-amber-500">1.</span> Pilih paket VIP dan transfer sesuai harga ke rekening admin.</li>
          <li className="flex gap-2"><span className="font-bold text-amber-500">2.</span> Kirim bukti transfer beserta username/email ke admin via WhatsApp atau Discord.</li>
          <li className="flex gap-2"><span className="font-bold text-amber-500">3.</span> Admin akan memberikan kode voucher yang bisa di-redeem di atas.</li>
          <li className="flex gap-2"><span className="font-bold text-amber-500">4.</span> Masukkan kode voucher → VIP langsung aktif!</li>
        </ol>
        <div
          className="mt-4 rounded-xl p-4 text-sm"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Hubungi Admin:</p>
          <p>WhatsApp / Discord — lihat halaman <a href="/about" className="underline hover:no-underline" style={{ color: 'var(--color-primary)' }}>About</a></p>
        </div>
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