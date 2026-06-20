import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from Supabase Storage and common CDNs
  images: {
    // Local patterns for proxy API (supports query strings)
    // Next.js 16 requires explicit registration for dynamic API image routes
    localPatterns: [
      {
        pathname: '/api/proxy/image/**',
      },
      {
        pathname: '/api/r2/image/**',
      },
    ],
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
      // ManhwaLand CDN — semua subdomain .manhwaland.*
      { protocol: 'https', hostname: '**.manhwaland.land' },
      { protocol: 'https', hostname: 'manhwaland.land' },
      { protocol: 'https', hostname: '**.manhwaland.in' },
      { protocol: 'https', hostname: 'manhwaland.in' },
      // jablay.gmbr.pro — manhwaland image CDN
      { protocol: 'https', hostname: 'jablay.gmbr.pro' },
      { protocol: 'http', hostname: 'jablay.gmbr.pro' },
      // api-l.gmbr.pro — manhwaland cover CDN
      { protocol: 'https', hostname: 'api-l.gmbr.pro' },
      { protocol: 'http', hostname: 'api-l.gmbr.pro' },
      // img-uwak.gmbr.pro — manhwaland image CDN
      { protocol: 'https', hostname: 'img-uwak.gmbr.pro' },
      { protocol: 'http', hostname: 'img-uwak.gmbr.pro' },
      // jablay.gmbar.xyz — manhwaland image CDN
      { protocol: 'https', hostname: 'jablay.gmbar.xyz' },
      { protocol: 'http', hostname: 'jablay.gmbar.xyz' },
      // All gmbar.xyz subdomains (wildcard)
      { protocol: 'https', hostname: '**.gmbar.xyz' },
      { protocol: 'http', hostname: '**.gmbar.xyz' },
      // All gmbr.pro subdomains (wildcard for future CDNs)
      { protocol: 'https', hostname: '**.gmbr.pro' },
      { protocol: 'http', hostname: '**.gmbr.pro' },
      // kambingjantan.cc — manhwaland image CDN
      { protocol: 'https', hostname: '**.kambingjantan.cc' },
      { protocol: 'https', hostname: 'kambingjantan.cc' },
      // Common manga image CDNs
      { protocol: 'https', hostname: 'i.imgur.com' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'https', hostname: 'i.ibb.co' },
      // Cloudflare R2
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      // OAuth provider avatars
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },  // Google
      { protocol: 'https', hostname: 'cdn.discordapp.com' },          // Discord (already above, but explicit)
      { protocol: 'https', hostname: 'pbs.twimg.com' },               // X/Twitter
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


  // Serve /api/sitemap as /sitemap.xml (Google standard URL)
  async rewrites() {
    return [
      { source: '/sitemap.xml', destination: '/api/sitemap' },
    ];
  },

  // Security headers for all responses (defense in depth — middleware also sets some)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
      {
        // Prevent search engines from indexing API JSON responses
        source: '/api/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
