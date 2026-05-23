import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OLLUQ — All Look Beyond Fantasy',
    short_name: 'OLLUQ',
    description: 'OLLUQ: All Look Beyond Fantasy. Baca manga & manhwa gratis — thousands of titles updated daily. Beyond Every Story.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0D0D0D',
    theme_color: '#FF6B35',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
