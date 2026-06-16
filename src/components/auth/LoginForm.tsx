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
import { OAuthButtons, OAuthDivider } from '@/components/auth/OAuthButtons';

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
      <OAuthButtons onError={setServerError} />
      <OAuthDivider />

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