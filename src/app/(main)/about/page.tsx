import { Info } from 'lucide-react';

export const metadata = {
  title: 'Tentang Kami — Komawa Zone',
  description: 'Kenali lebih dekat Komawa Zone, platform baca manga terlengkap.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-8 flex items-center gap-3">
        <Info className="size-6" style={{ color: '#FF6B35' }} />
        <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
          Tentang Kami
        </h1>
      </div>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>Komawa Zone</strong> adalah platform
          baca manga, manhwa, dan manhua berbasis komunitas. Kami hadir untuk memudahkan kamu
          menemukan dan menikmati karya-karya terbaik dari seluruh dunia.
        </p>
        <p>
          Dengan koleksi yang terus diperbarui setiap hari, Komawa Zone berkomitmen menyediakan
          pengalaman membaca yang nyaman, cepat, dan gratis untuk semua kalangan.
        </p>
        <p>
          Punya pertanyaan atau masukan? Hubungi kami melalui halaman{' '}
          <a href="/contact" className="font-semibold hover:underline" style={{ color: '#FF6B35' }}>
            Kontak
          </a>
          .
        </p>
      </div>
    </div>
  );
}
