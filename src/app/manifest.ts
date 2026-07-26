import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OLLUQ — All Look Beyond Fantasy',
    short_name: 'OLLUQ',
    description: 'OLLUQ: Baca manga, manhwa & manhua gratis — ribuan judul update setiap hari. Beyond Every Story.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait-primary',
    background_color: '#0D0D0D',
    theme_color: '#FF6B35',
    categories: ['entertainment', 'books', 'comics'],
    lang: 'id-ID',
    dir: 'ltr',
    // Quick-action shortcuts (Android long-press, desktop jump-list)
    shortcuts: [
      {
        name: 'Jelajah Manga',
        short_name: 'Jelajah',
        description: 'Cari manga, manhwa, manhua',
        url: '/search?source=pwa_shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Daftar Baca',
        short_name: 'Bookmark',
        description: 'Manga yang disimpan',
        url: '/bookmarks?source=pwa_shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Klaim VIP Gratis',
        short_name: 'VIP Gratis',
        description: 'Aktifkan 1 bulan VIP gratis',
        url: '/vip?source=pwa_shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}