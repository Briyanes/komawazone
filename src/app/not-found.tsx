import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <span className="text-8xl">📖</span>
      <div className="space-y-2">
        <h1
          className="text-4xl font-bold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-playfair)' }}
        >
          404
        </h1>
        <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
          Page not found
        </p>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          The page you&apos;re looking for doesn&apos;t exist or was moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--color-primary)' }}
      >
        Back to Home
      </Link>
    </div>
  );
}
