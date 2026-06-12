'use client';

import { useEffect, useState } from 'react';
import { X, ExternalLink, Copy, Check } from 'lucide-react';

/** Detect in-app browsers (Instagram, Facebook, TikTok, etc.) */
function detectInAppBrowser(): { isDetected: boolean; name: string } {
  if (typeof window === 'undefined') return { isDetected: false, name: '' };

  const ua = navigator.userAgent || '';

  // Order matters — check specific ones first
  const detectors: [RegExp, string][] = [
    [/Instagram/i, 'Instagram'],
    [/FBAN|FBAV|FB_IAB|FB4A/i, 'Facebook'],
    [/BytedanceWebview|ByteLocale|tiktok/i, 'TikTok'],
    [/Twitter|FxiOS/i, 'X (Twitter)'],
    [/Line\//i, 'LINE'],
    [/Snapchat/i, 'Snapchat'],
    [/Pinterest/i, 'Pinterest'],
    [/WhatsApp/i, 'WhatsApp'],
    [/Telegram/i, 'Telegram'],
    [/MicroMessenger/i, 'WeChat'],
    [/KAKAOTALK/i, 'KakaoTalk'],
  ];

  for (const [regex, name] of detectors) {
    if (regex.test(ua)) return { isDetected: true, name };
  }

  return { isDetected: false, name: '' };
}

const SESSION_KEY = 'olluq_inapp_banner_dismissed';

export function InAppBrowserBanner() {
  const [visible, setVisible] = useState(false);
  const [browserName, setBrowserName] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(SESSION_KEY);
    if (dismissed) return;

    const { isDetected, name } = detectInAppBrowser();
    if (isDetected) {
      setVisible(true);
      setBrowserName(name);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    sessionStorage.setItem(SESSION_KEY, '1');
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: create a temporary input
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenBrowser = () => {
    const url = window.location.href;

    // Try to open in external browser
    // Android intent: opens Chrome
    if (/android/i.test(navigator.userAgent)) {
      // Try Chrome intent
      const intentUrl = `intent://${url.replace('https://', '')}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intentUrl;
      return;
    }

    // iOS: try to open in Safari
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      // Safari can't be directly opened, but we can try
      window.open(url, '_blank');
      return;
    }

    // Fallback: just copy
    handleCopyLink();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] safe-area-bottom"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.85))',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="mx-auto max-w-lg px-4 pt-4 pb-5">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-3 p-1 rounded-full transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl mt-0.5"
            style={{ background: 'rgba(255,107,53,0.15)' }}
          >
            <ExternalLink size={18} style={{ color: '#FF6B35' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              Buka di Browser
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Kamu membuka dari <strong className="text-white">{browserName}</strong>. 
              Login akan lebih mudah di Chrome atau Safari.
            </p>

            {/* Action buttons */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleOpenBrowser}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-transform active:scale-95"
                style={{ background: '#FF6B35' }}
              >
                <ExternalLink size={14} />
                Buka Browser
              </button>
              <button
                onClick={handleCopyLink}
                className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-transform active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: copied ? '#10B981' : 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Tersalin!' : 'Salin Link'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}