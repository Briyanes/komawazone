import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://olluq.app';

function xmlEscape(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const supabase = await createClient();

  const [{ data: mangaList }, { data: genreRows }, { data: chapterRows }] = await Promise.all([
    supabase
      .from('manga')
      .select('slug, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1000),
    supabase
      .from('genres')
      .select('slug')
      .order('name'),
    supabase
      .from('chapters')
      .select('id, manga_id, manga:manga!inner(slug), created_at')
      .is('manga.deleted_at', null as never)
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);

  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/search', priority: '0.8', changefreq: 'daily' },
    { url: '/login', priority: '0.3', changefreq: 'monthly' },
    { url: '/register', priority: '0.3', changefreq: 'monthly' },
  ];

  const mangaEntries = (mangaList ?? []).map(m => ({
    url: `/manga/${m.slug}`,
    priority: '0.7',
    changefreq: 'weekly',
    lastmod: new Date(m.updated_at).toISOString().split('T')[0],
  }));

  const genreEntries = (genreRows ?? []).map(g => ({
    url: `/genre/${g.slug}`,
    priority: '0.6',
    changefreq: 'weekly',
  }));

  const chapterEntries = (chapterRows ?? []).map(c => ({
    url: `/manga/${(c.manga as unknown as { slug: string })?.slug}/chapter/${c.id}`,
    priority: '0.5',
    changefreq: 'monthly',
    lastmod: new Date(c.created_at).toISOString().split('T')[0],
  }));

  const allEntries = [...staticPages, ...mangaEntries, ...genreEntries, ...chapterEntries];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries
  .map(
    entry => `  <url>
    <loc>${xmlEscape(`${SITE_URL}${entry.url}`)}</loc>
    ${'lastmod' in entry ? `<lastmod>${entry.lastmod}</lastmod>` : ''}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
