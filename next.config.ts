import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from Supabase Storage and common CDNs
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
        pathname: '/storage/v1/object/public/**',
      },
      // Shinigami Asia CDN
      { protocol: 'https', hostname: '**.shinigami.asia' },
      { protocol: 'https', hostname: 'shinigami.asia' },
      // ManhwaLand CDN
      { protocol: 'https', hostname: '**.manhwaland.land' },
      { protocol: 'https', hostname: 'manhwaland.land' },
      // jablay.gmbr.pro — manhwaland image CDN
      { protocol: 'https', hostname: 'jablay.gmbr.pro' },
      { protocol: 'http', hostname: 'jablay.gmbr.pro' },
      // api-l.gmbr.pro — manhwaland cover CDN
      { protocol: 'https', hostname: 'api-l.gmbr.pro' },
      { protocol: 'http', hostname: 'api-l.gmbr.pro' },
      // Common manga image CDNs
      { protocol: 'https', hostname: 'i.imgur.com' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'https', hostname: 'i.ibb.co' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [390, 640, 750, 828, 1080, 1200],
    imageSizes: [128, 160, 256, 384],
  },

  // Strip unused locales, reduce bundle size
  compress: true,

  // Strict mode for React best practices
  reactStrictMode: true,

  // Compiler optimisations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // Experimental: partial pre-rendering for better TTFB
  experimental: {
    ppr: false, // enable when stable
  },

  // On-demand entries: reduce server invalidation frequency
  onDemandEntries: {
    maxInactiveAge: 60 * 1000, // keep idle pages for 1 min
    pagesBufferLength: 5, // buffer 5 pages
  },

  // Redirect www → non-www (adjust for your domain)
  async redirects() {
    return [
      {
        source: '/',
        has: [{ type: 'host', value: 'www.mangazone.app' }],
        destination: 'https://mangazone.app/',
        permanent: true,
      },
    ];
  },

  // Serve /api/sitemap as /sitemap.xml (Google standard URL)
  async rewrites() {
    return [
      { source: '/sitemap.xml', destination: '/api/sitemap' },
    ];
  },
};

export default nextConfig;
