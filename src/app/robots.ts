import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://olluq.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/bookmarks', '/profile'],
      },
      {
        // Block AI scrapers from consuming bandwidth
        userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'CCBot'],
        disallow: '/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
