import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers/Providers';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Komawa Zone — Baca Manga & Manhwa Online Gratis',
    template: '%s | Komawa Zone',
  },
  description:
    'Baca manga dan manhwa terbaru secara gratis. Ribuan judul diperbarui setiap hari.',
  keywords: ['manga', 'manhwa', 'baca manga online', 'manga zone', 'komik online'],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://komawazone.id'
  ),
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'Komawa Zone',
    images: [{ url: '/api/og?title=Manga+Zone', width: 1200, height: 630, alt: 'Komawa Zone' }],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)',  color: '#121212' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} h-full`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col bg-surface-primary text-body-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

