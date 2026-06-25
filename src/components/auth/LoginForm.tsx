'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { useAuth } from '@/hooks/useAuth';
import OlluqLoader from '@/components/ui/OlluqLoader';

export function LoginForm() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialError = searchParams?.get('error');
  const [serverError, setServerError] = useState<string | null>(initialError || null);

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
        <OlluqLoader size="md" text="Mengalihkan..." />
      </div>
    );
  }

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

      {/* OAuth buttons (only login method) */}
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