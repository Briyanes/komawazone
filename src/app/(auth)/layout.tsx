import type { Metadata } from 'next';
import Link from 'next/link';
import { InAppBrowserBanner } from '@/components/InAppBrowserBanner';

export const metadata: Metadata = {
  title: { default: 'Authentication', template: '%s | OLLUQ' },
  robots: { index: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg-secondary)' }}>
      {/* Brand header */}
      <div className="mb-8 text-center">
        <Link href="/" className="inline-block">
          <span
            className="text-3xl font-bold"
            style={{ fontFamily: 'var(--font-playfair)', color: 'var(--color-primary)' }}
          >
            OLLUQ
          </span>
        </Link>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl p-6 sm:p-8 shadow-[var(--shadow-lg)]"
        style={{ background: 'var(--bg-primary)' }}
      >
        {children}
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        By continuing, you agree to our{' '}
        <a href="/terms" style={{ color: 'var(--color-primary)' }}>Terms</a> &{' '}
        <a href="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a>.
      </p>
      <InAppBrowserBanner />
    </div>
  );
}
