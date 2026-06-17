import { MessageCircle } from 'lucide-react';

interface MarketLinks {
  tokopedia_url?: string;
  shopee_url?: string;
  whatsapp_url?: string;
  whatsapp_label?: string;
}

export function MarketplaceLinks({ links }: { links: MarketLinks }) {
  const { tokopedia_url, shopee_url, whatsapp_url, whatsapp_label } = links;
  const hasMarket = tokopedia_url || shopee_url;
  const hasWa = whatsapp_url;

  // Kalau gak ada link marketplace sama WA, skip section ini
  if (!hasMarket && !hasWa) return null;

  const steps = [
    { n: '1', text: hasMarket ? 'Beli voucher VIP lewat link Tokopedia/Shopee di bawah. Bayar pakai apa aja (transfer, e-wallet, COD kalo ada).' : 'Hubungi admin lewat WhatsApp di bawah untuk beli voucher.' },
    { n: '2', text: 'Setelah pembayaran confirmed, kode voucher dikirim ke chat/inbox marketplace atau WA.' },
    { n: '3', text: 'Balik ke halaman ini, paste kodenya di kotak Redeem di atas, klik tombol merahnya.' },
    { n: '4', text: 'VIP lu langsung aktif. Bisa baca semua chapter 18+ tanpa iklan! 🎉' },
  ];

  return (
    <div
      className="rounded-2xl border p-4 sm:p-6 space-y-5"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
    >
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          Gimana Cara Beli?
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          Gampang kok, tinggal klik beli → dapet kode → redeem. Selesai.
        </p>
      </div>

      {/* Marketplace buttons */}
      {hasMarket && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {tokopedia_url && (
            <a
              href={tokopedia_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-xl px-4 py-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/tokopedia.png" alt="Beli di Tokopedia" style={{ height: '32px', width: 'auto' }} className="shrink-0" />
            </a>
          )}
          {shopee_url && (
            <a
              href={shopee_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-xl px-4 py-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/shopee.png" alt="Beli di Shopee" style={{ height: '32px', width: 'auto' }} className="shrink-0" />
            </a>
          )}
        </div>
      )}

      {/* WhatsApp button */}
      {hasWa && (
        <a
          href={whatsapp_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: '#25D366' }}
        >
          <MessageCircle size={16} />
          {whatsapp_label || 'Chat Admin via WhatsApp'}
        </a>
      )}

      {/* Steps */}
      <div className="space-y-2.5">
        {steps.map(s => (
          <div key={s.n} className="flex gap-3">
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {s.n}
            </span>
            <p className="text-sm leading-relaxed pt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {s.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}