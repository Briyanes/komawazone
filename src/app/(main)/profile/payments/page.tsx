import { Crown, ExternalLink, Download, CheckCircle, Clock, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Riwayat Pembayaran — OLLUQ' };

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  tripay_transaction_id: string | null;
  paid_at: string | null;
  expired_at: string;
  created_at: string;
  subscription: {
    id: string;
    plan_duration: number;
  } | null;
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: 'Menunggu Pembayaran',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  paid: {
    icon: CheckCircle,
    label: 'Pembayaran Berhasil',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  failed: {
    icon: XCircle,
    label: 'Pembayaran Gagal',
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
  expired: {
    icon: XCircle,
    label: 'Kadaluarsa',
    color: 'text-gray-500',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/20',
  },
};

const PLAN_LABELS = {
  1: '1 Bulan',
  3: '3 Bulan',
  6: '6 Bulan',
};

export default async function PaymentHistoryPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Silakan login untuk melihat riwayat pembayaran.
        </p>
      </div>
    );
  }

  // Fetch user payments with subscription details
  const { data: payments } = await supabase
    .from('payments')
    .select(`
      *,
      subscription!inner (
        id,
        plan_duration
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50) as unknown as { data: Payment[] };

  if (!payments || payments.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-6">
        <div className="flex items-center gap-3">
          <Crown size={24} className="text-amber-500" />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Riwayat Pembayaran
          </h1>
        </div>

        <div
          className="rounded-2xl border p-12 text-center"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Belum ada riwayat pembayaran.
          </p>
          <a
            href="/vip"
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-primary)' }}
          >
            Upgrade ke VIP
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Crown size={24} className="text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Riwayat Pembayaran
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Total {payments.length} transaksi
          </p>
        </div>
      </div>

      {/* Payments List */}
      <div className="space-y-4">
        {payments.map((payment: Payment) => {
          const status = STATUS_CONFIG[payment.payment_status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
          const StatusIcon = status.icon;
          const planDuration = payment.subscription?.plan_duration;
          const planLabel = planDuration ? PLAN_LABELS[planDuration as keyof typeof PLAN_LABELS] : 'Custom';

          return (
            <div
              key={payment.id}
              className="rounded-2xl border p-6 space-y-4 transition-all hover:scale-[1.01]"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
            >
              {/* Header Row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        background: status.bg,
                        color: status.color,
                        border: `1px solid ${status.border}`,
                      }}
                    >
                      <StatusIcon size={12} />
                      {status.label}
                    </span>
                    {payment.payment_method === 'qris' && (
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        QRIS
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    Rp {payment.amount.toLocaleString('id-ID')}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {format(new Date(payment.created_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {planLabel}
                  </p>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>ID Transaksi</p>
                  <p className="font-mono text-xs">
                    {payment.tripay_transaction_id || payment.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Metode</p>
                  <p className="font-medium capitalize">
                    {payment.payment_method === 'qris' ? 'QRIS Instant' : 'Transfer Manual'}
                  </p>
                </div>
                {payment.paid_at && (
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Dibayar Pada</p>
                    <p className="font-medium">
                      {format(new Date(payment.paid_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                    </p>
                  </div>
                )}
                {payment.expired_at && payment.payment_status === 'pending' && (
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Kadaluarsa</p>
                    <p className="font-medium text-amber-600">
                      {format(new Date(payment.expired_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              {payment.payment_status === 'paid' && (
                <div className="flex gap-2 pt-2">
                  <button
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:scale-105"
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <Download size={14} />
                    Download Invoice
                  </button>
                  {payment.subscription?.id && (
                    <a
                      href="/profile"
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:scale-105"
                      style={{
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-light)',
                      }}
                    >
                      <ExternalLink size={14} />
                      Lihat Subscription
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div className="text-center">
        <a
          href="/vip"
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #f59e0b 0%, var(--color-primary) 100%)' }}
        >
          <Crown size={16} />
          Upgrade VIP Lagi
        </a>
      </div>
    </div>
  );
}
