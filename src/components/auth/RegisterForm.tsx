'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { useAuth } from '@/hooks/useAuth';

export function RegisterForm() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  // Redirect already-authenticated users away from /register
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Buat akun
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Bergabung dengan OLLUQ — Beyond Every Story
        </p>
      </div>

      {/* OAuth buttons (only register method) */}
      <OAuthButtons onError={setServerError} />

      {serverError && (
        <div
          className="rounded-lg px-3 py-2 text-sm text-white"
          style={{ background: 'var(--color-error)' }}
        >
          {serverError}
        </div>
      )}

      <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Sudah punya akun?{' '}
        <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Masuk
        </Link>
      </p>
    </div>
  );
}