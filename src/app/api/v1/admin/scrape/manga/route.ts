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
  // Nuxt v2
  const m1 = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?});\s*<\/script>/);
  if (m1) try { return JSON.parse(m1[1]) as Record<string, unknown>; } catch { /* noop */ }
  // Nuxt v3 __NUXT_DATA__ (dehydrated array — less useful, skip)
  // Generic inline JSON embedded in a script tag by the platform
  const m2 = html.match(/window\.__(?:DATA|STATE|STORE|APP_STATE)__\s*=\s*(\{[\s\S]*?});\s*<\/script>/);
  if (m2) try { return JSON.parse(m2[1]) as Record<string, unknown>; } catch { /* noop */ }
  return null;
}

type MangaType   = 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
type MangaStatus = 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';

interface ScrapedManga {
  title: string;
  description: string;
  cover_url: string;
  genres: string[];
  author: string;
  artist: string;
  type: MangaType | null;
  status: MangaStatus;
}

function coerceStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

function field(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (k in obj) return obj[k];
  return undefined;
}

/** Recursively search for a key in a nested object and return first match */
function deepFind(obj: unknown, ...keys: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (k in o) return o[k];
  for (const v of Object.values(o)) {
    const found = deepFind(v, ...keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function strList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      return coerceStr(o.name ?? o.title ?? o.label ?? '');
    }
    return '';
  }).filter(Boolean);
}

function parseMangaFromData(data: Record<string, unknown>): ScrapedManga | null {
  // Try to find the series object at various nested paths
  const candidates = [
    deepFind(data, 'series'),
    deepFind(data, 'manga'),
    deepFind(data, 'comic'),
    deepFind(data, 'manhwa'),
    deepFind(data, 'detail'),
    // pageProps itself might be the target
    deepFind(data, 'pageProps'),
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const s = candidate as Record<string, unknown>;

    const title = coerceStr(field(s, 'title', 'name', 'series_name'));
    if (!title) continue; // not the right object

    const description = coerceStr(field(s, 'description', 'synopsis', 'summary', 'overview'));
    const cover_url   = coerceStr(field(s, 'cover', 'cover_url', 'coverImage', 'cover_image', 'thumbnail', 'poster', 'image'));

    const genres = strList(field(s, 'genres', 'tags', 'categories', 'genre'));

    const authorsRaw = field(s, 'authors', 'author', 'writers', 'writer');
    const author = Array.isArray(authorsRaw)
      ? strList(authorsRaw).join(', ')
      : coerceStr(authorsRaw);

    const artistsRaw = field(s, 'artists', 'artist', 'illustrators', 'illustrator', 'drawer');
    const artist = Array.isArray(artistsRaw)
      ? strList(artistsRaw).join(', ')
      : coerceStr(artistsRaw);

    const typeRaw = coerceStr(field(s, 'type', 'format', 'comic_type', 'media_type')).toUpperCase();
    const typeMap: Record<string, MangaType> = {
      MANGA: 'MANGA', MANHWA: 'MANHWA', MANHUA: 'MANHUA', WEBTOON: 'WEBTOON', ONA: 'WEBTOON',
    };
    const type = typeMap[typeRaw] ?? null;

    const statusRaw = coerceStr(field(s, 'status', 'publication_status', 'release_status')).toUpperCase();
    const statusMap: Record<string, MangaStatus> = {
      ONGOING: 'ONGOING', ACTIVE: 'ONGOING', PUBLISHING: 'ONGOING',
      COMPLETED: 'COMPLETED', FINISHED: 'COMPLETED', DONE: 'COMPLETED', END: 'COMPLETED',
      HIATUS: 'HIATUS', ON_HIATUS: 'HIATUS',
      DROPPED: 'DROPPED', CANCELLED: 'DROPPED', CANCELED: 'DROPPED',
    };
    const status = statusMap[statusRaw] ?? 'ONGOING';

    return { title, description, cover_url, genres, author, artist, type, status };
  }
  return null;
}

function extractMetaTags(html: string): Partial<ScrapedManga> {
  const get = (attr: string, val: string): string => {
    const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']*)["']`, 'i'))
           ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${val}["']`, 'i'));
    return m ? m[1] : '';
  };
  return {
    title:       get('property', 'og:title')       || get('name', 'twitter:title'),
    description: get('property', 'og:description') || get('name', 'description'),
    cover_url:   get('property', 'og:image')        || get('name', 'twitter:image'),
  };
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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gagal mengambil halaman: HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();

    const pageData = extractNextData(html) ?? extractNuxtData(html);
    let scraped: ScrapedManga | null = pageData ? parseMangaFromData(pageData) : null;

    const meta = extractMetaTags(html);

    if (!scraped) {
      // Fallback: build from meta tags only
      scraped = {
        title:       meta.title       ?? '',
        description: meta.description ?? '',
        cover_url:   meta.cover_url   ?? '',
        genres: [], author: '', artist: '',
        type: null, status: 'ONGOING',
      };
    } else {
      scraped.title       ||= meta.title       ?? '';
      scraped.description ||= meta.description ?? '';
      scraped.cover_url   ||= meta.cover_url   ?? '';
    }

    return NextResponse.json({ data: scraped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scrape gagal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
