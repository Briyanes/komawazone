'use client';

import { useEffect, useState } from 'react';

interface MarketLinks {
  tokopedia_url?: string;
  shopee_url?: string;
  whatsapp_url?: string;
  whatsapp_label?: string;
}

/** Tokopedia logo (simplified) */
function TokopediaLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M3.5 7.5a2 2 0 012-2h13a2 2 0 012 2V10a1 1 0 01-1 1h-1a3 3 0 01-6 0H8a3 3 0 01-6 0v3.5a2 2 0 002 2h12a2 2 0 002-2V12h2v3.5a4 4 0 01-4 4H4a4 4 0 01-4-4V7.5zM6 9a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm12 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
    </svg>
  );
}

/** Shopee logo (simplified) */
function ShopeeLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M12 2c-1.5 0-2.8 1-3 2.5H5.5a1 1 0 00-1 .9l-.4 4.6H3a1 1 0 100 2h.2l.5 7a2 2 0 002 1.9h12.6a2 2 0 002-1.9l.5-7h.2a1 1 0 100-2h-1.1l-.4-4.6a1 1 0 00-1-.9H15C14.8 3 13.5 2 12 2zm0 2c.7 0 1 .4 1 1h-2c0-.6.3-1 1-1zM6.5 6.5h11v.5l.3 3.1H6.2L6.5 7zm1.5 4.5a1.5 1.5 0 011.3.8c.4.7.4 1.6 0 2.5l1.4-1c.4-.3.8-.3 1.2 0l1.4 1c-.4-.9-.4-1.8 0-2.5a1.5 1.5 0 012.6 1.5c.3.6.3 1.3 0 2-.5 1.1-1.7 1.7-2.9 1.3l-.6-.2-.6.2c-1.2.4-2.4-.2-2.9-1.3-.3-.7-.3-1.4 0-2A1.5 1.5 0 018 11z" />
    </svg>
  );
}

/** WhatsApp logo */
function WhatsAppLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.2-.5s0-.4-.1-.5c-.1-.1-.6-1.5-.9-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4zM12 2a10 10 0 00-8.6 15.1L2 22l4.9-1.3A10 10 0 1012 2z" />
    </svg>
  );
}

export function MarketplaceLinks() {
  const [links, setLinks] = useState<MarketLinks>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/v1/admin/settings')
      .then(r => r.json())
      .then((d: { data?: Record<string, unknown> }) => {
        const data = d.data ?? {};
        setLinks({
          tokopedia_url: typeof data.marketplace_tokopedia_url === 'string' ? data.marketplace_tokopedia_url : '',
          shopee_url: typeof data.marketplace_shopee_url === 'string' ? data.marketplace_shopee_url : '',
          whatsapp_url: typeof data.marketplace_whatsapp_url === 'string' ? data.marketplace_whatsapp_url : '',
          whatsapp_label: typeof data.marketplace_wa_label === 'string' ? data.marketplace_wa_label : '',
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

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
              className="flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: '#03AC0E' }}
            >
              <TokopediaLogo />
              Beli di Tokopedia
            </a>
          )}
          {shopee_url && (
            <a
              href={shopee_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: '#EE4D2D' }}
            >
              <ShopeeLogo />
              Beli di Shopee
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
          <WhatsAppLogo />
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