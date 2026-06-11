'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/lib/validations/auth';
import { signIn } from '@/lib/auth/actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/** Map Supabase English error messages → Bahasa Indonesia */
function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('rate limit')) return 'Terlalu banyak percobaan login. Tunggu beberapa saat atau masuk dengan Google / Discord.';
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) return 'Email atau password salah. Periksa kembali dan coba lagi.';
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek inbox kamu dan klik link verifikasi.';
  if (m.includes('user not found')) return 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.';
  if (m.includes('too many requests')) return 'Terlalu banyak percobaan. Coba lagi nanti.';
  if (m.includes('network')) return 'Masalah koneksi jaringan. Periksa internet kamu.';
  return msg;
}

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialError = searchParams?.get('error');
  const [serverError, setServerError] = useState<string | null>(initialError || null);
  const [isPending, startTransition] = useTransition();
  const isRateLimit = serverError?.includes('Terlalu banyak percobaan');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  // Fix: browser autofill does not always fire React's onChange.
  // After mount, read DOM values and push them into RHF state.
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const { ref: passwordRegRef, ...passwordRegProps } = register('password');
  const mergedPasswordRef = useCallback(
    (node: HTMLInputElement | null) => {
      passwordRegRef(node);
      passwordInputRef.current = node;
    },
    [passwordRegRef]
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      if (passwordInputRef.current?.value) {
        setValue('password', passwordInputRef.current.value, { shouldValidate: false });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [setValue]);

  const onSubmit = (data: LoginInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signIn(data);
      if (result?.error) setServerError(translateAuthError(result.error));
    });
  };

  const handleOAuth = (provider: 'google' | 'twitter' | 'discord') => {
    // Use Route Handler instead of Server Action so PKCE cookies are properly set
    window.location.href = `/api/v1/auth/signin/${provider}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Selamat datang
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Masuk untuk lanjut membaca
        </p>
      </div>

      {/* OAuth buttons */}
      <div className="space-y-2">
        <OAuthButton provider="google"  label="Lanjutkan dengan Google"   onClick={() => handleOAuth('google')} />
        <OAuthButton provider="discord" label="Lanjutkan dengan Discord"  onClick={() => handleOAuth('discord')} />
        <OAuthButton provider="twitter" label="Lanjutkan dengan X (Twitter)" onClick={() => handleOAuth('twitter')} />
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <hr className="flex-1" style={{ borderColor: 'var(--border-light)' }} />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>atau</span>
        <hr className="flex-1" style={{ borderColor: 'var(--border-light)' }} />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div
            className="rounded-lg border px-3 py-2 text-sm"
            style={{
              background: 'var(--color-error)',
              borderColor: 'var(--color-error)',
              color: '#fff',
              opacity: 0.9,
            }}
          >
            {serverError}
            {isRateLimit && (
              <p className="mt-1 text-xs opacity-80">
                Gunakan tombol Google / Discord di atas untuk masuk tanpa batas percobaan.
              </p>
            )}
          </div>
        )}

        <div className="relative">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Mail
            size={16}
            className="absolute right-3 top-[34px]"
            style={{ color: 'var(--text-tertiary)' }}
          />
        </div>

        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            ref={mergedPasswordRef}
            {...passwordRegProps}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-[34px]"
            style={{ color: 'var(--text-tertiary)' }}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-xs"
            style={{ color: 'var(--color-primary)' }}
          >
            Lupa kata sandi?
          </Link>
        </div>

        <Button type="submit" className="w-full" isLoading={isPending} disabled={isPending || !!isRateLimit}>
          <Lock size={16} />
          Masuk
        </Button>
      </form>

      <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Belum punya akun?{' '}
        <Link href="/register" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Daftar
        </Link>
      </p>
    </div>
  );
}

// ── OAuth button ────────────────────────────────────────────────────────────

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
