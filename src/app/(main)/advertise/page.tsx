import { Megaphone } from 'lucide-react';

export const metadata = {
  title: 'Advertise With Us — Komawa Zone',
  description: 'Pasang iklan di Komawa Zone dan jangkau ribuan pembaca manga aktif.',
};

export default function AdvertisePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-8 flex items-center gap-3">
        <Megaphone className="size-6" style={{ color: '#FF6B35' }} />
        <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
          Advertise With Us
        </h1>
      </div>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        <p>
          Ingin menjangkau ribuan pembaca manga aktif setiap harinya? Komawa Zone membuka
          kesempatan kerja sama iklan untuk brand dan bisnis yang ingin tampil di platform kami.
        </p>

        <div className="space-y-4 rounded-2xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
          <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
            Mengapa beriklan di Komawa Zone?
          </h2>
          <ul className="space-y-2">
            {[
              'Audiens yang engaged — pembaca aktif setiap hari',
              'Penempatan iklan yang strategis dan non-intrusif',
              'Laporan performa iklan secara transparan',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5 size-1.5 rounded-full shrink-0" style={{ background: '#FF6B35', marginTop: '6px' }} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p>
          Kirimkan proposal atau pertanyaan ke{' '}
          <a href="mailto:ads@komawazone.com" className="font-semibold hover:underline" style={{ color: '#FF6B35' }}>
            ads@komawazone.com
          </a>
          {' '}dan tim kami akan segera merespons.
        </p>
      </div>
    </div>
  );
}
