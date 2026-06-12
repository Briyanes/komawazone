'use client';

import { useEffect, useState } from 'react';
import { X, Copy, Check, Share } from 'lucide-react';

/** Detect in-app browsers (Instagram, Facebook, TikTok, etc.) */
function detectInAppBrowser(): { isDetected: boolean; name: string; isIOS: boolean } {
  if (typeof window === 'undefined') return { isDetected: false, name: '', isIOS: false };

  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua);

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
    if (regex.test(ua)) return { isDetected: true, name, isIOS };
  }

  return { isDetected: false, name: '', isIOS };
}

const SESSION_KEY = 'olluq_inapp_banner_dismissed';

export function InAppBrowserBanner() {
  const [visible, setVisible] = useState(false);
  const [browserName, setBrowserName] = useState('');
  const [isIOS, setIsIOS] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(SESSION_KEY);
    if (dismissed) return;

    const { isDetected, name, isIOS: ios } = detectInAppBrowser();
    if (isDetected) {
      setVisible(true);
      setBrowserName(name);
      setIsIOS(ios);
      setCanShare(typeof navigator.share === 'function');
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    sessionStorage.setItem(SESSION_KEY, '1');
  };

  const handleCopyLink = async () => {
    // Use the reader domain or current URL
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Try native share (works in some WebView contexts)
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: 'OLLUQ — Baca Manga Online' });
        return;
      } catch {
        // User cancelled or not supported, fall through to copy
      }
    }
    handleCopyLink();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100]"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.97), rgba(0,0,0,0.9))',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="mx-auto max-w-lg px-5 pt-4 pb-6">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-3 p-1.5 rounded-full transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: 'rgba(255,107,53,0.15)' }}
          >
            <Share size={16} style={{ color: '#FF6B35' }} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              Buka di Browser
            </p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              dari {browserName}
            </p>
          </div>
        </div>

        {/* Step-by-step instructions */}
        <div
          className="rounded-xl p-3.5 mb-3"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs font-semibold text-white mb-2">Cara membuka di browser:</p>
          <div className="space-y-2">
            {isIOS ? (
              <>
                <Step number={1} text='Tap ikon Share (⬆️) di bawah' />
                <Step number={2} text='Pilih "Open in Safari"' />
              </>
            ) : (
              <>
                <Step number={1} text='Tap ⋮ (tiga titik) di kanan atas' />
                <Step number={2} text='Pilih "Open in Chrome" atau "Open in Browser"' />
              </>
            )}
            <Step number={3} text='Login akan otomatis — tidak perlu ketik ulang!' />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {canShare && (
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-white transition-transform active:scale-95"
              style={{ background: '#FF6B35' }}
            >
              <Share size={14} />
              Buka Menu Share
            </button>
          )}
          <button
            onClick={handleCopyLink}
            className={`${canShare ? '' : 'flex-1'} flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-transform active:scale-95`}
            style={{
              background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)',
              color: copied ? '#10B981' : 'rgba(255,255,255,0.8)',
              border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.12)'}`,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Link tersalin!' : 'Salin Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
        style={{ background: 'rgba(255,107,53,0.2)', color: '#FF6B35' }}
      >
        {number}
      </span>
      <span className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
        {text}
      </span>
    </div>
  );
}