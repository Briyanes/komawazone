'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Loader, CheckCircle, XCircle, Copy, QrCode, Clock } from 'lucide-react';

interface QRISModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: string;
  planLabel: string;
  price: string;
}

interface PaymentResponse {
  paymentId: string;
  orderId: string;
  paymentUrl: string;
  qrString: string;
  expiresAt: string;
}

export function QRISPaymentModal({ isOpen, onClose, plan, planLabel, price }: QRISModalProps) {
  const [step, setStep] = useState<'idle' | 'creating' | 'qris' | 'processing' | 'success' | 'error' | 'expired'>('idle');
  const [paymentData, setPaymentData] = useState<PaymentResponse | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep('idle');
      setPaymentData(null);
      setTimeLeft('');
    } else if (isOpen && step === 'idle') {
      handlePayment();
    }
  }, [isOpen]);

  // Update countdown timer
  useEffect(() => {
    if (!paymentData?.expiresAt || step !== 'qris') return;

    const updateTimer = () => {
      const now = new Date();
      const expiry = new Date(paymentData.expiresAt);
      const diff = expiry.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('Expired');
        setStep('expired');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${hours}j ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [paymentData?.expiresAt, step]);

  // Poll payment status
  useEffect(() => {
    if (!paymentData?.paymentId || step !== 'processing') return;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/v1/payment/status?id=${paymentData.paymentId}`);
        const data = await res.json();

        if (data.status === 'success' && data.data.payment_status === 'paid') {
          setStep('success');
          setTimeout(() => {
            window.location.reload(); // Refresh to activate VIP
          }, 3000);
        }
      } catch (error) {
        console.error('Status check error:', error);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 3000); // Check every 3 seconds

    // Stop polling after 5 minutes
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (step === 'processing') {
        setStep('error');
      }
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [paymentData?.paymentId, step]);

  const handlePayment = async () => {
    setStep('creating');

    try {
      const res = await fetch('/api/v1/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (data.status === 'success' && data.data) {
        setPaymentData(data.data);
        setStep('processing');
      } else {
        setStep('error');
      }
    } catch (error) {
      console.error('Payment creation error:', error);
      setStep('error');
    }
  };

  const handleCopyQRString = () => {
    if (paymentData?.qrString) {
      navigator.clipboard.writeText(paymentData.qrString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatPrice = (priceStr: string) => {
    // Extract number from price string
    const match = priceStr.match(/\d+/);
    return match ? parseInt(match[0]).toLocaleString('id-ID') : priceStr;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Pembayaran QRIS
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {planLabel} - {price}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {step === 'creating' && (
            <div className="text-center py-8">
              <Loader className="animate-spin mx-auto mb-4" size={32} style={{ color: 'var(--color-primary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Memproses pembayaran...
              </p>
            </div>
          )}

          {(step === 'processing' || step === 'qris') && paymentData && (
            <div className="space-y-6">
              {/* QR Code */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="p-4 bg-white rounded-xl shadow-inner">
                    {paymentData.qrString ? (
                      <QRCodeSVG
                        value={paymentData.qrString}
                        size={200}
                        level="M"
                        includeMargin={false}
                      />
                    ) : (
                      <QrCode size={200} className="animate-pulse" style={{ color: 'var(--color-primary)' }} />
                    )}
                  </div>
                  {/* QRIS Logo */}
                  <div className="absolute -bottom-2 -right-2 bg-white rounded-lg p-1 shadow-md">
                    <img
                      src="/images/qris-logo.png"
                      alt="QRIS"
                      className="w-12 h-6 object-contain"
                      onError={(e) => {
                        // Fallback if QRIS logo not found
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                </div>

                {/* Timer */}
                {timeLeft && (
                  <div className="flex items-center gap-1.5 mt-4 text-sm font-medium" style={{ color: '#F59E0B' }}>
                    <Clock size={16} />
                    <span>Expired dalam: {timeLeft}</span>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
                  Cara Bayar:
                </p>
                <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div className="flex gap-2">
                    <span className="font-bold text-amber-600">1.</span>
                    <span>Buka e-wallet/banking app (GoPay, OVO, Dana, ShopeePay, dll)</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-amber-600">2.</span>
                    <span>Pilih menu "Scan QR" atau "QRIS"</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-amber-600">3.</span>
                    <span>Scan QR code di atas</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-amber-600">4.</span>
                    <span>Konfirmasi pembayaran sesuai {price}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-amber-600">5.</span>
                    <span>VIP akan aktif otomatis dalam hitungan detik! ⚡</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleCopyQRString}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors border"
                  style={{
                    borderColor: 'var(--color-primary)',
                    color: copied ? '#10B981' : 'var(--color-primary)',
                    background: copied ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                  }}
                >
                  <Copy size={16} />
                  {copied ? 'Disalin!' : 'Salin QR'}
                </button>
                <button
                  onClick={() => window.open(paymentData.paymentUrl, '_blank')}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--color-primary)' }}
                >
                  <QrCode size={16} />
                  Bayar via Tripay
                </button>
              </div>

              {/* Processing Status */}
              {step === 'processing' && (
                <div className="flex items-center justify-center gap-2 text-sm py-2" style={{ color: 'var(--color-primary)' }}>
                  <Loader className="animate-spin" size={16} />
                  <span>Menunggu pembayaran...</span>
                </div>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="mx-auto mb-4 text-emerald-500" size={64} />
              <h3 className="text-xl font-bold text-emerald-600 mb-2">
                Pembayaran Berhasil!
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                VIP Anda telah aktif. Mengalihkan ke halaman utama...
              </p>
              <div className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-primary)' }}>
                <Loader className="animate-spin" size={16} />
                <span>Memproses...</span>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-8 space-y-4">
              <XCircle className="mx-auto mb-4 text-red-500" size={64} />
              <div>
                <h3 className="text-xl font-bold text-red-600 mb-2">
                  Pembayaran Gagal
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Terjadi kesalahan saat memproses pembayaran. Silakan coba lagi.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePayment}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-white rounded-xl"
                  style={{ background: 'var(--color-primary)' }}
                >
                  Coba Lagi
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 text-sm font-semibold rounded-xl border"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          {step === 'expired' && (
            <div className="text-center py-8 space-y-4">
              <Clock className="mx-auto mb-4 text-amber-500" size={64} />
              <div>
                <h3 className="text-xl font-bold text-amber-600 mb-2">
                  Pembayaran Kedaluwarsa
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Waktu pembayaran telah habis. Silakan buat pembayaran baru.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-3 text-sm font-semibold text-white rounded-xl"
                style={{ background: 'var(--color-primary)' }}
              >
                Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
