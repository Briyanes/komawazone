import { redirect } from 'next/navigation';
import { Crown, ExternalLink, CheckCircle, Clock, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import type { Metadata } from 'next';
import type { Database } from '@/lib/database.types';

export const metadata: Metadata = { title: 'Riwayat Pembayaran — OLLUQ' };

type Payment = Database['public']['Tables']['payments']['Row'] & {
  subscription: {
    id: string;
    plan_duration: number;
  } | null;
};

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: 'Menunggu Pembayaran',
    className: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
  },
  paid: {
    icon: CheckCircle,
    label: 'Pembayaran Berhasil',
    className: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
  },
  failed: {
    icon: XCircle,
    label: 'Pembayaran Gagal',
    className: 'bg-red-500/10 text-red-500 border border-red-500/20',
  },
  expired: {
    icon: XCircle,
    label: 'Kadaluarsa',
    className: 'bg-gray-500/10 text-gray-500 border border-gray-500/20',
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
    redirect('/login');
  }

  // Fetch user payments with subscription details
  const { data: payments } = await supabase
    .from('payments')
    .select(`
      *,
      subscription (
        id,
        plan_duration
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50) as unknown as { data: Payment[] | null };

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
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
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
              {payment.payment_status === 'paid' && payment.subscription?.id && (
                <div className="flex gap-2 pt-2">
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
