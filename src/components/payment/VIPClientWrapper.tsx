'use client';

import { useState } from 'react';
import { QrCode, Users } from 'lucide-react';
import { QRISPaymentModal } from '@/components/payment/QRISPaymentModal';

interface Plan {
  label: string;
  price: string;
  value: string;
  badge?: string;
  code: string;
}

interface VIPClientWrapperProps {
  plans: Plan[];
}

export function VIPClientWrapper({ plans }: VIPClientWrapperProps) {
  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'manual'>('qris');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const handleQRISPayment = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
  };

  return (
    <>
      {/* Payment Method Toggle */}
      <div className="flex gap-2 justify-center mb-6">
        <button
          onClick={() => setPaymentMethod('qris')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            paymentMethod === 'qris'
              ? 'shadow-lg scale-105'
              : 'opacity-60 hover:opacity-100'
          }`}
          style={{
            background: paymentMethod === 'qris' ? 'var(--color-primary)' : 'var(--bg-secondary)',
            color: paymentMethod === 'qris' ? 'white' : 'var(--text-primary)',
          }}
        >
          <QrCode size={16} />
          QRIS Instant
          {paymentMethod === 'qris' && (
            <span className="ml-1 text-xs opacity-80">⚡ Aktif Sekarang</span>
          )}
        </button>
        <button
          onClick={() => setPaymentMethod('manual')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            paymentMethod === 'manual'
              ? 'shadow-lg scale-105'
              : 'opacity-60 hover:opacity-100'
          }`}
          style={{
            background: paymentMethod === 'manual' ? 'var(--color-primary)' : 'var(--bg-secondary)',
            color: paymentMethod === 'manual' ? 'white' : 'var(--text-primary)',
          }}
        >
          <Users size={16} />
          Transfer Manual
        </button>
      </div>

      {/* QRIS Payment Section */}
      {paymentMethod === 'qris' && (
        <div className="space-y-4">
          <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
            Pilih paket di bawah untuk langsung bayar dengan QRIS:
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {plans.map(plan => (
              <button
                key={plan.label}
                onClick={() => handleQRISPayment(plan)}
                className="group relative rounded-xl border-2 p-4 text-center transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--color-primary)',
                }}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: '#10B981' }}>
                    {plan.badge}
                  </span>
                )}
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{plan.label}</p>
                <p className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{plan.price}</p>
                <div className="flex items-center justify-center gap-1 mt-2 text-xs text-emerald-600 font-semibold">
                  <QrCode size={12} />
                  <span>Scan QRIS</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* QRIS Payment Modal */}
      {selectedPlan && (
        <QRISPaymentModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedPlan(null);
          }}
          plan={selectedPlan.code}
          planLabel={selectedPlan.label}
          price={selectedPlan.price}
        />
      )}
    </>
  );
}
