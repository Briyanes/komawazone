import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { HUB_DOMAIN, READER_DOMAIN } from '@/config/domains';

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Host-aware: robots.txt tiap domain menunjuk sitemap domainnya sendiri
  const host = (await headers()).get('host')?.split(':')[0] ?? '';
  const isHub = host === HUB_DOMAIN;
  const sitemapUrl = isHub
    ? `https://${HUB_DOMAIN}/sitemap.xml`
    : `https://${READER_DOMAIN}/sitemap.xml`;

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
    sitemap: sitemapUrl,
  };
}
