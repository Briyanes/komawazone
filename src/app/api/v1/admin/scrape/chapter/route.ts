import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

function extractNextData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) try { return JSON.parse(m[1]) as Record<string, unknown>; } catch { /* noop */ }
  return null;
}

function extractNuxtData(html: string): Record<string, unknown> | null {
  const m1 = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?});\s*<\/script>/);
  if (m1) try { return JSON.parse(m1[1]) as Record<string, unknown>; } catch { /* noop */ }
  const m2 = html.match(/window\.__(?:DATA|STATE|STORE)__\s*=\s*(\{[\s\S]*?});\s*<\/script>/);
  if (m2) try { return JSON.parse(m2[1]) as Record<string, unknown>; } catch { /* noop */ }
  return null;
}

/** Recursively search nested objects for the first array of image-like strings */
function findImageArray(obj: unknown, depth = 0): string[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];

  const o = obj as Record<string, unknown>;
  const imageKeys = ['images', 'pages', 'chapter_images', 'imgs', 'imageUrls', 'image_list', 'data'];

  for (const key of imageKeys) {
    const val = o[key];
    if (!Array.isArray(val) || val.length === 0) continue;

    // Collect URLs from the array
    const urls = val.map((item: unknown) => {
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) return item;
      if (item && typeof item === 'object') {
        const img = item as Record<string, unknown>;
        const url = img.url ?? img.image_url ?? img.src ?? img.path ?? img.link ?? img.storage_key ?? '';
        const str = typeof url === 'string' ? url : '';
        // Accept absolute URLs and also relative-looking CDN paths
        return /^https?:\/\//i.test(str) ? str : str.startsWith('/') ? str : '';
      }
      return '';
    }).filter(Boolean) as string[];

    if (urls.length > 0) return urls;
  }

  // Recurse into children
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const found = findImageArray(v, depth + 1);
      if (found.length > 0) return found;
    }
  }

  return [];
}

/** Extract chapter number and title from page data if available */
function parseChapterMeta(data: Record<string, unknown>): { number?: number; title?: string } {
  const chapter = (
    data?.chapter ?? (data?.props as Record<string, unknown> | undefined)?.pageProps
  ) as Record<string, unknown> | undefined;
  if (!chapter) return {};
  const number = typeof chapter.number === 'number' ? chapter.number
    : typeof chapter.chapter === 'number' ? chapter.chapter
    : undefined;
  const title = typeof chapter.title === 'string' ? chapter.title : undefined;
  return { number, title };
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

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!parsedUrl.hostname.endsWith('shinigami.asia')) {
      return NextResponse.json({ error: 'Hanya URL dari shinigami.asia yang didukung' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'URL tidak valid' }, { status: 400 });
  }

  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://shinigami.asia/',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gagal mengambil halaman: HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const pageData = extractNextData(html) ?? extractNuxtData(html);

    if (!pageData) {
      return NextResponse.json(
        { error: 'Tidak dapat mengekstrak data dari halaman. Mungkin halaman ini memerlukan JavaScript.' },
        { status: 422 },
      );
    }

    const images = findImageArray(pageData);
    const meta   = parseChapterMeta(pageData);

    if (!images.length) {
      return NextResponse.json(
        { error: 'Tidak ada gambar ditemukan. Coba pastikan URL adalah halaman baca chapter.' },
        { status: 422 },
      );
    }

    return NextResponse.json({
      data: {
        images: images.map((url, i) => ({ number: i + 1, image_url: url })),
        count: images.length,
        meta,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scrape gagal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
