import { ScrollText } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service & Privacy Policy — Komawa Zone',
  description: 'Syarat penggunaan dan kebijakan privasi Komawa Zone.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-8 flex items-center gap-3">
        <ScrollText className="size-6" style={{ color: '#FF6B35' }} />
        <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
          Terms of Service &amp; Privacy Policy
        </h1>
      </div>

      <div className="space-y-10 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>

        {/* Terms */}
        <section>
          <h2 className="mb-4 text-base font-black" style={{ color: 'var(--text-primary)' }}>
            Syarat Penggunaan
          </h2>
          <div className="space-y-3">
            <p>
              Dengan mengakses dan menggunakan Komawa Zone, kamu menyetujui syarat-syarat berikut.
              Jika tidak setuju, mohon hentikan penggunaan layanan ini.
            </p>
            <p>
              Komawa Zone menyediakan platform untuk membaca konten manga, manhwa, dan manhua.
              Pengguna dilarang mendistribusikan ulang, menjual, atau mengeksploitasi konten
              untuk kepentingan komersial tanpa izin tertulis.
            </p>
            <p>
              Kami berhak memperbarui syarat ini sewaktu-waktu. Perubahan akan diumumkan
              melalui platform.
            </p>
          </div>
        </section>

        <div className="h-px" style={{ background: 'var(--border-light)' }} />

        {/* Privacy */}
        <section>
          <h2 className="mb-4 text-base font-black" style={{ color: 'var(--text-primary)' }}>
            Kebijakan Privasi
          </h2>
          <div className="space-y-3">
            <p>
              Kami mengumpulkan data minimal yang diperlukan untuk menjalankan layanan, seperti
              alamat email saat registrasi dan riwayat baca untuk fitur personalisasi.
            </p>
            <p>
              Data kamu tidak akan dijual atau dibagikan kepada pihak ketiga tanpa persetujuanmu,
              kecuali diwajibkan oleh hukum yang berlaku.
            </p>
            <p>
              Kamu dapat meminta penghapusan data akun kapan saja melalui pengaturan profil
              atau dengan menghubungi kami di{' '}
              <a href="mailto:hello@komawazone.com" className="font-semibold hover:underline" style={{ color: '#FF6B35' }}>
                hello@komawazone.com
              </a>
              .
            </p>
          </div>
        </section>

        <div className="h-px" style={{ background: 'var(--border-light)' }} />

        {/* DMCA */}
        <section>
          <h2 className="mb-4 text-base font-black" style={{ color: 'var(--text-primary)' }}>
            DMCA
          </h2>
          <p>
            Jika kamu adalah pemegang hak cipta dan menemukan konten yang melanggar hak kamu,
            silakan kirimkan laporan ke{' '}
            <a href="mailto:dmca@komawazone.com" className="font-semibold hover:underline" style={{ color: '#FF6B35' }}>
              dmca@komawazone.com
            </a>
            {' '}dengan menyertakan bukti kepemilikan. Kami akan menindaklanjuti dalam 3 hari kerja.
          </p>
        </section>

      </div>
    </div>
  );
}
