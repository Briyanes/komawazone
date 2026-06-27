import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type ChapterImage = {
  id: string;
  number: number;
  image_url: string;
  width: number;
  height: number;
};

export type ChapterDetail = {
  id: string;
  number: number;
  title: string | null;
  manga_id: string;
  source_url: string | null;
  chapter_images: ChapterImage[];
  manga: { id: string; slug: string; title: string; content_rating: 'general' | 'mature'; source_url: string | null; cover_url: string | null } | null;
};

export type MangaListItem = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
  type?: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
  rating: number;
  views: number;
  content_rating?: 'general' | 'mature';
  updated_at?: string | null;
  chapters?: Array<{ id: string; number: number; title: string | null; release_date: string }>;
};

export type MangaWithChapters = {
  id: string;
  slug: string;
  title: string;
  alt_title: string | null;
  description: string | null;
  cover_url: string | null;
  banner_url: string | null;
  status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
  type: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
  author: string | null;
  artist: string | null;
  genres: string[];
  release_year: number | null;
  rating: number;
  rating_count: number;
  views: number;
  bookmark_count: number;
  like_count: number;
  uploaded_by: string | null;
  uploader: { username: string | null; email: string } | null;
  content_rating: 'general' | 'mature';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  chapters: Array<{ id: string; number: number; title: string | null; release_date: string; views: number; thumbnail_url?: string | null; chapter_images: Array<{ image_url: string; number: number }> }>;
};

/** Number of free preview chapters for mature manga */
export const MATURE_PREVIEW_CHAPTERS = 3;

/** Dead CDN domains that no longer serve images (404). */
const DEAD_CDN_PATTERNS = [
  'gmbr.pro',
  'manhwaland.land',
  'uwakjawa.xyz',
];

/**
 * Check if an image URL points to a known-dead CDN.
 * Returns true if the URL will likely 404.
 */
export function isDeadCdnUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return DEAD_CDN_PATTERNS.some(pattern =>
      hostname === pattern || hostname.endsWith(`.${pattern}`)
    );
  } catch {
    return false;
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Returns true if the current request's user may see mature (18+) content.
 * Admins always can; VIP users can; guests and non-VIP users cannot.
 */
async function isMatureAllowed(supabase: SupabaseServerClient): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('users')
    .select('vip_expires_at, role')
    .eq('id', user.id)
    .single();
  const row = data as { vip_expires_at?: string | null; role?: string | null } | null;
  if (row?.role === 'ADMIN') return true;
  const exp = row?.vip_expires_at;
  return !!exp && new Date(exp) > new Date();
}

export async function getFeaturedManga(limit = 5): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const q = supabase
    .from('manga')
    .select('id, slug, title, cover_url, banner_url, status, rating, views, description, genres, content_rating, updated_at')
    .is('deleted_at', null)
    .eq('is_featured', true)
    .order('updated_at', { ascending: false })
    .limit(limit);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getLatestManga(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();

  // Step 1: Find the most recently published chapters to get manga IDs in release order
  const { data: recentChapters } = await supabase
    .from('chapters')
    .select('manga_id, release_date')
    .is('deleted_at', null)
    .lte('release_date', new Date().toISOString())
    .order('release_date', { ascending: false })
    .limit(limit * 5);

  if (!recentChapters || recentChapters.length === 0) {
    // Fallback: no chapters at all, use updated_at
    const { data, error } = await supabase
      .from('manga')
      .select(`
        id, slug, title, cover_url, status, rating, views, content_rating, updated_at,
        chapters(id, number, title, release_date)
      `)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MangaListItem[];
  }

  // Step 2: Deduplicate manga IDs preserving most-recent-first order
  const seenManga = new Set<string>();
  const orderedIds: string[] = [];
  for (const ch of recentChapters) {
    if (!seenManga.has(ch.manga_id)) {
      seenManga.add(ch.manga_id);
      orderedIds.push(ch.manga_id);
      if (orderedIds.length >= limit) break;
    }
  }

  if (orderedIds.length === 0) return [];

  // Step 3: Fetch full manga data with nested chapters
  const { data: mangaData, error } = await supabase
    .from('manga')
    .select(`
      id, slug, title, cover_url, status, rating, views, content_rating, updated_at,
      chapters(id, number, title, release_date)
    `)
    .in('id', orderedIds)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);

  // Step 4: Sort results to match the release-date order from step 2
  const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
  const sorted = (mangaData ?? []).sort(
    (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)
  );

  return sorted as unknown as MangaListItem[];
}

export async function getPopularManga(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const q = supabase
    .from('manga')
    .select('id, slug, title, cover_url, status, rating, views, content_rating, updated_at')
    .is('deleted_at', null)
    .order('views', { ascending: false })
    .limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getTopThisWeek(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const q = supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, rating, views, content_rating, updated_at, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .gte('updated_at', since)
    .order('views', { ascending: false })
    .limit(limit);
  const { data, error } = await q;
  if (error || !data || data.length === 0) {
    // Return empty instead of fallback to getPopularManga()
    // PopularTabs already fetches popular separately — avoids duplicate query
    return [];
  }
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getNewTitles(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const q = supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, rating, views, content_rating, updated_at, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getCompletedManga(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const q = supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, rating, views, content_rating, updated_at, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .eq('status', 'COMPLETED')
    .order('rating', { ascending: false })
    .limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getTopToday(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const q = supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, rating, views, content_rating, updated_at, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .gte('updated_at', since)
    .order('views', { ascending: false })
    .limit(limit);
  const { data, error } = await q;
  if (error || !data || data.length === 0) return [];
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getRekomByType(type: 'MANGA' | 'MANHWA' | 'MANHUA' | null, limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, type, rating, views, content_rating, updated_at, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .order('rating', { ascending: false })
    .limit(limit);
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getMangaBySlug(slug: string): Promise<MangaWithChapters | null> {
  // Use admin client so RLS doesn't hide chapter data from guest users.
  // NOTE: We NO LONGER fetch nested chapter_images here — that was fetching
  // thousands of image URLs per page view (huge Supabase egress waste).
  // Thumbnails are stored in chapters.thumbnail_url (set by backfill scripts).
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from('manga')
    .select(`*, chapters(id, number, title, release_date, views, thumbnail_url), uploader:users(username, email)`)
    .eq('slug', slug)
    .is('deleted_at', null)
    .lte('chapters.release_date', new Date().toISOString())
    .single();

  if (error || !data) return null;

  const mangaId = (data as { id: string }).id;
  const [bRes, lRes] = await Promise.all([
    adminSupabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('manga_id', mangaId),
    adminSupabase.from('likes').select('id', { count: 'exact', head: true }).eq('manga_id', mangaId),
  ]);

  return {
    ...(data as unknown as MangaWithChapters),
    bookmark_count: bRes.count ?? 0,
    like_count: lRes.count ?? 0,
  };
}

export async function getChapterWithImages(chapterId: string): Promise<ChapterDetail | null> {
  // Use admin client so RLS doesn't hide chapter_images rows from guest users.
  //
  // NOTE: Lazy-load scraping was REMOVED to prevent Supabase egress explosion.
  // Previously, every chapter view with dead CDN URLs (gmbr.pro etc.) would:
  //   1. Scrape source site (HTTP fetch)
  //   2. Download all images (buffer transfer)
  //   3. Upload to R2 (another transfer)
  //   4. Insert to DB (more queries)
  // This caused ~3GB+ egress per billing cycle. Images are now backfilled
  // offline via scripts/backfill-dead-parallel.mjs instead.
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('chapters')
    .select(`
      id, number, title, manga_id, source_url,
      chapter_images(id, number, image_url, width, height),
      manga(id, slug, title, content_rating, source_url, cover_url)
    `)
    .eq('id', chapterId)
    .single();

  if (error) return null;

  return data as unknown as ChapterDetail;
}

export async function getAdjacentChapters(mangaId: string, currentNumber: number): Promise<{
  prev: { id: string; number: number } | null;
  next: { id: string; number: number } | null;
}> {
  const supabase = await createClient();
  const [prev, next] = await Promise.all([
    supabase
      .from('chapters')
      .select('id, number')
      .eq('manga_id', mangaId)
      .lt('number', currentNumber)
      .order('number', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('chapters')
      .select('id, number')
      .eq('manga_id', mangaId)
      .gt('number', currentNumber)
      .order('number', { ascending: true })
      .limit(1)
      .single(),
  ]);
  return {
    prev: prev.data as { id: string; number: number } | null,
    next: next.data as { id: string; number: number } | null,
  };
}

export async function getMangaChapterList(mangaId: string): Promise<Array<{ id: string; number: number; title: string | null }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('chapters')
    .select('id, number, title')
    .eq('manga_id', mangaId)
    .order('number', { ascending: true });
  return (data ?? []) as Array<{ id: string; number: number; title: string | null }>;
}

export { isMatureAllowed };