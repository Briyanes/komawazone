'use client';

import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

// ── Icons ───────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function DiscordIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/discord.svg" alt="Discord" width={18} height={18} aria-hidden />
  );
}

function XTwitterIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/x.svg" alt="X" width={18} height={18} aria-hidden className="x-icon-adaptive" />
  );
}

// ── Config ──────────────────────────────────────────────────────────────────

const oauthConfig: Record<string, { icon: React.ReactNode; bg: string; color: string; border?: string }> = {
  google:  { icon: <GoogleIcon />,  bg: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'var(--border-medium)' },
  discord: { icon: <DiscordIcon />, bg: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'var(--border-medium)' },
  twitter: { icon: <XTwitterIcon />, bg: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'var(--border-medium)' },
};

function OAuthButton({
  provider,
  label,
  onClick,
}: {
  provider: string;
  label: string;
  onClick: () => void;
}) {
  const config = oauthConfig[provider] ?? oauthConfig.google;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
      style={{
        borderColor: config.border ?? 'var(--border-medium)',
        background: config.bg,
        color: config.color,
      }}
    >
      {config.icon}
      {label}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

/**
 * Shared OAuth button group for login & register pages.
 * - Google uses GIS (direct) if NEXT_PUBLIC_GOOGLE_CLIENT_ID is set
 * - Falls back to Supabase OAuth for all providers
 */
export function OAuthButtons({ onError }: { onError?: (msg: string) => void }) {
  const handleOAuth = useCallback(
    async (provider: 'google' | 'twitter' | 'discord') => {
      try {
        const supabase = createClient();
        const readerDomain = process.env.NEXT_PUBLIC_READER_DOMAIN || 'olluq.xyz';
        const siteUrl = `https://${readerDomain}`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${siteUrl}/api/v1/auth/callback`,
          },
        });
        if (error) onError?.(error.message);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'OAuth error');
      }
    },
    [onError]
  );

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <div className="space-y-2">
      {/* Google: Use direct GIS flow (consent shows our domain, not supabase.co).
          Falls back to Supabase OAuth if NEXT_PUBLIC_GOOGLE_CLIENT_ID not set. */}
      {googleClientId ? (
        <GoogleSignInButton onError={onError} />
      ) : (
        <OAuthButton provider="google" label="Lanjutkan dengan Google" onClick={() => handleOAuth('google')} />
      )}
      <OAuthButton provider="discord" label="Lanjutkan dengan Discord" onClick={() => handleOAuth('discord')} />
      <OAuthButton provider="twitter" label="Lanjutkan dengan X (Twitter)" onClick={() => handleOAuth('twitter')} />
    </div>
  );
}

export function OAuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <hr className="flex-1" style={{ borderColor: 'var(--border-light)' }} />
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>atau</span>
      <hr className="flex-1" style={{ borderColor: 'var(--border-light)' }} />
    </div>
  );
}