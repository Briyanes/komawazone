'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialError = searchParams?.get('error');
  const [serverError, setServerError] = useState<string | null>(initialError || null);
  const isRateLimit = serverError?.includes('Terlalu banyak percobaan');

  // Email/password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => {
    if (initialError) setServerError(initialError);
  }, [initialError]);

  // Redirect already-authenticated users away from /login
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, router]);

  // Show nothing while checking auth or redirecting
  if (!isLoading && isAuthenticated) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
      </div>
    );
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setEmailLoading(true);
    setServerError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setServerError(error.message);
        return;
      }
      // Success — check if admin and redirect
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users').select('role').eq('id', user.id).single();
        if (profile?.role === 'ADMIN') {
          router.replace('/admin');
        } else {
          router.replace('/');
        }
        router.refresh();
      } else {
        router.replace('/');
        router.refresh();
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setEmailLoading(false);
    }
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

      {/* Email/password login */}
      <form onSubmit={handleEmailLogin} className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@olluq.xyz"
            required
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={emailLoading}
          className="w-full rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {emailLoading ? 'Memproses...' : 'Masuk dengan Email'}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: 'var(--border-light)' }} />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>ATAU</span>
        <div className="h-px flex-1" style={{ background: 'var(--border-light)' }} />
      </div>

      {/* OAuth buttons */}
      <OAuthButtons onError={setServerError} />

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
              Coba gunakan metode login lain di atas.
            </p>
          )}
        </div>
      )}

      <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Belum punya akun?{' '}
        <Link href="/register" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Daftar
        </Link>
      </p>
    </div>
  );
}