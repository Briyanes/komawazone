'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <AlertTriangle size={80} style={{ color: 'var(--color-primary)' }} />
      <div className="space-y-2">
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          Something went wrong
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {error.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred.'}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-primary)' }}
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border px-5 py-2 text-sm font-semibold transition-colors hover:bg-[var(--bg-secondary)]"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
