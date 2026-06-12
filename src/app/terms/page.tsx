import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — OLLUQ',
  description: 'Syarat dan ketentuan penggunaan layanan OLLUQ.',
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '32px' }}>
          Terakhir diperbarui: Desember 2025
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <Section title="1. Penerimaan Ketentuan">
            Dengan mengakses dan menggunakan layanan OLLUQ ("Platform"), Anda menyetujui untuk terikat
            dengan syarat dan ketentuan ini. Jika Anda tidak menyetujui ketentuan ini, mohon untuk tidak
            menggunakan Platform.
          </Section>

          <Section title="2. Deskripsi Layanan">
            OLLUQ adalah platform pembaca manga digital yang menyediakan akses ke berbagai judul manga.
            Platform ini menyediakan konten gratis dan konten premium (VIP) dengan fitur tambahan.
          </Section>

          <Section title="3. Akun Pengguna">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Anda harus berusia minimal 13 tahun untuk membuat akun.</li>
              <li>Anda bertanggung jawab atas keamanan akun Anda.</li>
              <li>Informasi yang diberikan harus akurat dan terkini.</li>
              <li>Anda tidak boleh membagikan akun kepada pihak lain.</li>
            </ul>
          </Section>

          <Section title="4. Konten & Konten Dewasa (18+)">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Platform menyediakan konten dengan berbagai rating, termasuk konten dewasa (MATURE/18+).</li>
              <li>Konten dewasa hanya dapat diakses oleh pengguna VIP yang telah memverifikasi usia mereka.</li>
              <li>Anda menyatakan bahwa Anda berusia 18 tahun atau lebih saat mengakses konten dewasa.</li>
              <li>OLLUQ tidak bertanggung jawab atas penyalahgunaan akses konten dewasa.</li>
            </ul>
          </Section>

          <Section title="5. Langganan VIP & Pembayaran">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Langganan VIP memberikan akses ke fitur premium dan konten eksklusif.</li>
              <li>Pembayaran diproses melalui Tripay (gateway pihak ketiga).</li>
              <li>Langganan diperpanjang secara otomatis kecuali dibatalkan.</li>
              <li>Pengembalian dana dilakukan sesuai kebijakan yang berlaku.</li>
            </ul>
          </Section>

          <Section title="6. Kode Voucher">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Kode voucher bersifat unik dan tidak dapat dipindahtangankan.</li>
              <li>OLLUQ berhak membatalkan kode voucher yang dicurigai penyalahgunaan.</li>
            </ul>
          </Section>

          <Section title="7. Hak Kekayaan Intelektual">
            Semua konten di Platform, termasuk manga, gambar, dan teks, adalah milik pencipta dan
            penerbit masing-masing. OLLUQ bertindak sebagai platform distribusi dan menghormati
            hak kekayaan intelektual pemilik konten.
          </Section>

          <Section title="8. Pembatasan Tanggung Jawab">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Platform disediakan "sebagaimana adanya" tanpa jaminan apapun.</li>
              <li>OLLUQ tidak bertanggung jawab atas kerugian yang timbul dari penggunaan Platform.</li>
              <li>OLLUQ berhak mengubah, menangguhkan, atau menghentikan layanan kapan saja.</li>
            </ul>
          </Section>

          <Section title="9. Perubahan Ketentuan">
            OLLUQ berhak mengubah ketentuan ini kapan saja. Perubahan akan diberitahukan melalui Platform.
            Penggunaan berkelanjutan setelah perubahan berarti Anda menyetujui ketentuan yang diperbarui.
          </Section>

          <Section title="10. Kontak">
            Jika Anda memiliki pertanyaan tentang ketentuan ini, silakan hubungi kami melalui Discord OLLUQ.
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