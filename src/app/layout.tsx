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
    default: 'OLLUQ — All Look Beyond Fantasy | Baca Manga & Manhwa Online',
    template: '%s | OLLUQ — Beyond Every Story',
  },
  description:
    'OLLUQ: All Look Beyond Fantasy. Platform baca manga, manhwa & manhua terlengkap. Beyond Every Story dengan ribuan judul, update harian, gratis selamanya.',
  keywords: ['olluq', 'manga', 'manhwa', 'manhua', 'baca manga online', 'baca manhwa bahasa indonesia', 'all look beyond fantasy', 'beyond every story'],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://olluq.com'
  ),
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'OLLUQ',
    images: [{ url: '/api/og?title=OLLUQ', width: 1200, height: 630, alt: 'OLLUQ' }],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  applicationName: 'OLLUQ',
  appleWebApp: {
    capable: true,
    title: 'OLLUQ',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
      <body className="min-h-full flex flex-col bg-surface-primary text-body-primary antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

