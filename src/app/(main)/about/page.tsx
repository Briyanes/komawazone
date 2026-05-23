import { Info } from 'lucide-react';

export const metadata = {
  title: 'Tentang OLLUQ — All Look Beyond Fantasy',
  description: 'Kenali lebih dekat OLLUQ: Beyond Every Story. Platform baca manga dengan konsep All Look Beyond Fantasy.',
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
          <strong style={{ color: 'var(--text-primary)' }}>OLLUQ</strong> adalah platform baca manga,
          manhwa, dan manhua dengan konsep <em style={{ color: '#FF6B35' }}>All Look Beyond Fantasy</em>.
          Kami hadir untuk membawa kamu <strong>Beyond Every Story</strong> — menemukan karya-karya
          terbaik dari seluruh dunia tanpa batas.
        </p>
        <p>
          Dengan koleksi yang terus diperbarui setiap hari, OLLUQ berkomitmen menyediakan
          pengalaman membaca yang nyaman, cepat, dan gratis. <strong>All Look Beyond Fantasy</strong> berarti
          kami tidak hanya menyediakan konten, tapi juga memperluas imajinasi kamu.
        </p>
        <p>
          Punya pertanyaan atau masukan? Hubungi kami melalui halaman{' '}
          <a href="/contact" className="font-semibold hover:underline" style={{ color: '#FF6B35' }}>
            Kontak
          </a>
          {' '}atau follow kami di <strong>@olluqhub</strong> di semua platform social media.
        </p>
      </div>
    </div>
  );
}
