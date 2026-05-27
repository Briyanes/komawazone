import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <BookOpen size={80} style={{ color: 'var(--color-primary)' }} />
      <div className="space-y-2">
        <h1
          className="text-4xl font-bold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-playfair)' }}
        >
          404
        </h1>
        <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
          Halaman tidak ditemukan
        </p>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Halaman yang kamu cari tidak ada atau sudah dipindahkan.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--color-primary)' }}
      >
        Ke Beranda
      </Link>
    </div>
  );
}
