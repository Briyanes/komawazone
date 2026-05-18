'use client';

import { useEffect, useState } from 'react';
import { X, Info, AlertTriangle, CheckCircle, Megaphone } from 'lucide-react';

interface BannerData {
  active: boolean;
  message: string;
  type: 'info' | 'warning' | 'success' | 'promo';
}

const styles: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  info: {
    bg: 'rgba(59,130,246,0.1)',
    text: '#3B82F6',
    border: 'rgba(59,130,246,0.25)',
    icon: <Info size={14} />,
  },
  warning: {
    bg: 'rgba(245,158,11,0.1)',
    text: '#F59E0B',
    border: 'rgba(245,158,11,0.25)',
    icon: <AlertTriangle size={14} />,
  },
  success: {
    bg: 'rgba(16,185,129,0.1)',
    text: '#10B981',
    border: 'rgba(16,185,129,0.25)',
    icon: <CheckCircle size={14} />,
  },
  promo: {
    bg: 'rgba(255,107,53,0.1)',
    text: 'var(--color-primary)',
    border: 'rgba(255,107,53,0.25)',
    icon: <Megaphone size={14} />,
  },
};

export function AnnouncementBanner() {
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/v1/settings/banner')
      .then(r => r.json())
      .then((d: { data?: BannerData }) => {
        if (d.data?.active && d.data?.message) {
          setBanner(d.data);
        }
      })
      .catch(() => {});
  }, []);

  if (!banner || dismissed) return null;

  const style = styles[banner.type] ?? styles.info;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={{
        background: style.bg,
        borderBottom: `1px solid ${style.border}`,
        color: style.text,
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="shrink-0">{style.icon}</span>
        <span className="truncate">{banner.message}</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
