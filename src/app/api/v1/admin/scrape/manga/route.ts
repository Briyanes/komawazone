import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectMangaSource, getSupportedDomains } from '@/lib/scrapers/detector';
import { scrapeMangaFromUrl } from '@/lib/scrapers/manga-scraper';

import { createServiceClient } from '@/lib/supabase/service';
async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await serviceClient
    .from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as { url?: string };
  const { url } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL diperlukan' }, { status: 400 });
  }

  try {
    // Detect source first for validation
    const source = detectMangaSource(url);
    if (!source) {
      return NextResponse.json({
        error: 'Domain tidak didukung',
        message: 'Gunakan URL dari sumber yang didukung',
        supported_domains: getSupportedDomains(),
        hint: 'Contoh: manhwaland.land (Manhwa), flmtscan.com (Manga), manhuachill.com (Manhua)'
      }, { status: 400 });
    }

    console.log('Detected source:', source.name, 'Type:', source.type, 'Country:', source.country);

    // Use shared scraping function
    const scraped = await scrapeMangaFromUrl(url);

    return NextResponse.json({
      data: scraped,
      source: {
        type: source.type,
        country: source.country,
        name: source.name
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scrape gagal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
