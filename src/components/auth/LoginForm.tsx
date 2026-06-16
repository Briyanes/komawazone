'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { OAuthButtons } from '@/components/auth/OAuthButtons';

export function LoginForm() {
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialError = searchParams?.get('error');
  const [serverError, setServerError] = useState<string | null>(initialError || null);
  const isRateLimit = serverError?.includes('Terlalu banyak percobaan');

  useEffect(() => {
    if (initialError) setServerError(initialError);
  }, [initialError]);

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

      {/* OAuth buttons only */}
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