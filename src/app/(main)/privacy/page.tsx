import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — OLLUQ',
  description: 'Kebijakan privasi penggunaan layanan OLLUQ.',
};

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{
        maxWidth: '720px',
        width: '100%',
        padding: '60px 24px 80px',
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: '8px',
          fontFamily: 'var(--font-playfair)',
        }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '32px' }}>
          Terakhir diperbarui: Desember 2025
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <Section title="1. Informasi yang Kami Kumpulkan">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Akun:</strong> Email, username, dan avatar saat mendaftar.</li>
              <li><strong>Penggunaan:</strong> Riwayat baca, bookmark, dan interaksi dengan konten.</li>
              <li><strong>Perangkat:</strong> Browser, OS, dan IP address (untuk keamanan).</li>
              <li><strong>Pembayaran:</strong> Data transaksi VIP melalui Tripay (kami tidak menyimpan data kartu).</li>
            </ul>
          </Section>

          <Section title="2. Cara Kami Menggunakan Informasi">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Menyediakan dan meningkatkan layanan Platform.</li>
              <li>Menyimpan preferensi baca dan bookmark.</li>
              <li>Memproses transaksi langganan VIP.</li>
              <li>Mengirim notifikasi penting tentang akun atau konten.</li>
              <li>Menganalisis penggunaan untuk meningkatkan pengalaman pengguna.</li>
            </ul>
          </Section>

          <Section title="3. Autentikasi Pihak Ketiga">
            <p>Kami menggunakan Supabase Auth untuk mengelola akun pengguna. Anda dapat mendaftar
            menggunakan provider berikut:</p>
            <ul style={{ margin: '8px 0 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Google:</strong> Kami menerima email dan nama dari akun Google Anda.</li>
              <li><strong>Discord:</strong> Kami menerima email, username, dan avatar Discord.</li>
              <li><strong>Email/Password:</strong> Data disimpan secara terenkripsi di Supabase.</li>
            </ul>
          </Section>

          <Section title="4. Penyimpanan Data">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Data disimpan di Supabase (hosted di AWS).</li>
              <li>Gambar dan aset disimpan di Cloudflare R2.</li>
              <li>Semua data dienkripsi saat transit (HTTPS) dan saat disimpan.</li>
            </ul>
          </Section>

          <Section title="5. Cookie & Teknologi Pelacakan">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Essential:</strong> Cookie autentikasi (Supabase auth token).</li>
              <li><strong>Analytics:</strong> Google Analytics (jika diaktifkan) untuk analisis penggunaan.</li>
              <li><strong>Tidak ada:</strong> Kami tidak menggunakan cookie pelacakan iklan pihak ketiga.</li>
            </ul>
          </Section>

          <Section title="6. Konten Dewasa & Verifikasi Usia">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Konten dewasa (MATURE/18+) hanya ditampilkan kepada pengguna VIP.</li>
              <li>Kami mencatat status VIP dan preferensi konten pengguna.</li>
              <li>Orang tua dapat meminta pembatasan akses untuk akun anak di bawah umur.</li>
            </ul>
          </Section>

          <Section title="7. Berbagi Data">
            <p>Kami <strong>tidak menjual</strong> data pribadi Anda. Data hanya dibagikan kepada:</p>
            <ul style={{ margin: '8px 0 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Supabase:</strong> Untuk autentikasi dan database.</li>
              <li><strong>Cloudflare:</strong> Untuk penyimpanan aset (R2) dan CDN.</li>
              <li><strong>Tripay:</strong> Untuk memproses pembayaran VIP.</li>
              <li><strong>Google Analytics:</strong> Data agregat anonim (jika diaktifkan).</li>
            </ul>
          </Section>

          <Section title="8. Hak Anda">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Mengakses dan mengunduh data pribadi Anda.</li>
              <li>Meminta perbaikan data yang tidak akurat.</li>
              <li>Meminta penghapusan akun dan data terkait.</li>
              <li>Menolak pemrosesan data untuk tujuan pemasaran.</li>
            </ul>
          </Section>

          <Section title="9. Keamanan">
            <p>Kami menerapkan langkah-langkah keamanan yang wajar untuk melindungi data Anda,
            termasuk enkripsi, rate limiting, dan pemantauan akses. Namun, tidak ada sistem
            yang 100% aman.</p>
          </Section>

          <Section title="10. Perubahan Kebijakan">
            <p>Kami dapat memperbarui kebijakan privasi ini dari waktu ke waktu. Perubahan signifikan
            akan diberitahukan melalui Platform atau email. Penggunaan berkelanjutan merupakan
            penerimaan kebijakan yang diperbarui.</p>
          </Section>

          <Section title="11. Kontak">
            <p>Untuk pertanyaan tentang privasi atau permintaan data, silakan hubungi kami melalui
            Discord OLLUQ.</p>
          </Section>
        </div>

        {/* Back link */}
        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--border-light)' }}>
          <a
            href="/"
            style={{
              fontSize: '13px',
              color: 'var(--color-primary)',
              textDecoration: 'none',
            }}
          >
            ← Kembali ke OLLUQ
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{
        fontSize: '16px',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '8px',
      }}>
        {title}
      </h2>
      <div style={{
        fontSize: '14px',
        lineHeight: 1.7,
        color: 'var(--text-secondary)',
      }}>
        {children}
      </div>
    </div>
  );
}