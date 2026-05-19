import { Mail } from 'lucide-react';

export const metadata = {
  title: 'Kontak — Komawa Zone',
  description: 'Hubungi tim Komawa Zone untuk pertanyaan, laporan, atau kerja sama.',
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-8 flex items-center gap-3">
        <Mail className="size-6" style={{ color: '#FF6B35' }} />
        <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
          Kontak Kami
        </h1>
      </div>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        <p>
          Ada pertanyaan, laporan konten, atau ingin bekerja sama dengan kami? Silakan hubungi
          tim Komawa Zone melalui salah satu saluran berikut.
        </p>

        <div className="space-y-3 rounded-2xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#FF6B35' }}>Email</p>
            <a href="mailto:hello@komawazone.com" className="font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
              hello@komawazone.com
            </a>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#FF6B35' }}>Instagram</p>
            <a href="https://instagram.com/komawazone" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
              @komawazone
            </a>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#FF6B35' }}>Discord</p>
            <a href="https://discord.gg/komawazone" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
              discord.gg/komawazone
            </a>
          </div>
        </div>

        <p>
          Untuk laporan DMCA, gunakan halaman{' '}
          <a href="/terms" className="font-semibold hover:underline" style={{ color: '#FF6B35' }}>
            Terms & Privacy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
