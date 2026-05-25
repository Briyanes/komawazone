import { createClient } from '@/lib/supabase/server';
import type { MangaFilters } from '@/types';

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
  chapter_images: ChapterImage[];
  manga: { id: string; slug: string; title: string; content_rating: 'general' | 'mature'; source_url: string | null } | null;
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

const ITEMS_PER_PAGE = 20;

export async function getFeaturedManga(limit = 5): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('manga')
    .select('id, slug, title, cover_url, banner_url, status, rating, views, description, genres, content_rating')
    .is('deleted_at', null)
    .eq('is_featured', true)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getLatestManga(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('manga')
    .select(`
      id, slug, title, cover_url, status, rating, views, content_rating,
      chapters(id, number, title, release_date)
    `)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getPopularManga(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('manga')
    .select('id, slug, title, cover_url, status, rating, views, content_rating')
    .is('deleted_at', null)
    .order('views', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getTopThisWeek(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, rating, views, content_rating, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .gte('updated_at', since)
    .order('views', { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) {
    // Fallback: just return popular if no recent updates
    return getPopularManga(limit);
  }
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getNewTitles(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, rating, views, content_rating, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getCompletedManga(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, rating, views, content_rating, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .eq('status', 'COMPLETED')
    .order('rating', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getTopToday(limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, rating, views, content_rating, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .gte('updated_at', since)
    .order('views', { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) return getPopularManga(limit);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getRekomByType(type: 'MANGA' | 'MANHWA' | 'MANHUA' | null, limit = 12): Promise<MangaListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from('manga')
    .select(`id, slug, title, cover_url, status, type, rating, views, content_rating, chapters(id, number, title, release_date)`)
    .is('deleted_at', null)
    .order('rating', { ascending: false })
    .limit(limit);

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MangaListItem[];
}

export async function getMangaBySlug(slug: string): Promise<MangaWithChapters | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('manga')
    .select(`*, chapters(id, number, title, release_date, views, thumbnail_url, chapter_images(image_url, number)), uploader:users(username, email)`)
    .eq('slug', slug)
    .is('deleted_at', null)
    .lte('chapters.release_date', new Date().toISOString())
    .single();

  if (error || !data) return null;

  const mangaId = (data as { id: string }).id;
  const [bRes, lRes] = await Promise.all([
    supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('manga_id', mangaId),
    supabase.from('likes').select('id', { count: 'exact', head: true }).eq('manga_id', mangaId),
  ]);

  return {
    ...(data as unknown as MangaWithChapters),
    bookmark_count: bRes.count ?? 0,
    like_count: lRes.count ?? 0,
  };
}

export async function getChapterWithImages(chapterId: string): Promise<ChapterDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chapters')
    .select(`
      id, number, title, manga_id,
      chapter_images(id, number, image_url, width, height),
      manga(id, slug, title, content_rating, source_url)
    `)
    .eq('id', chapterId)
    .single();

  if (error) return null;

  const chapter = data as unknown as ChapterDetail;

  // Lazy-load images: if chapter was imported as metadata-only (no images yet),
  // scrape and save them now on first read.
  if (chapter.chapter_images.length === 0 && chapter.manga?.slug) {
    try {
      const { scrapeChapterImages } = await import('@/lib/scrapers/manga-scraper');
      const mangaSlug = chapter.manga.slug;
      const chapterNum = chapter.number;
      // Chapter URL format: {origin}/{manga-slug}-chapter-{N}/
      const origin = chapter.manga.source_url
        ? new URL(chapter.manga.source_url).origin
        : 'https://04x.manhwaland.land';
      const chapterUrl = `${origin}/${mangaSlug}-chapter-${chapterNum}/`;

      const imageUrls = await scrapeChapterImages(chapterUrl);
      if (imageUrls.length > 0) {
        const imageRows = imageUrls.map((url, i) => ({
          chapter_id: chapter.id,
          image_url: url,
          number: i + 1,
        }));
        const { data: inserted } = await supabase
          .from('chapter_images')
          .insert(imageRows)
          .select('id, number, image_url, width, height');

        // Also update thumbnail if not set
        await supabase
          .from('chapters')
          .update({ thumbnail_url: imageUrls[0] })
          .eq('id', chapter.id)
          .is('thumbnail_url', null);

        chapter.chapter_images = (inserted ?? []) as ChapterImage[];
      }
    } catch (err) {
      console.error('[LazyImages] Failed to scrape images for chapter', chapterId, err);
    }
  }

  return chapter;
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

export async function searchManga(filters: MangaFilters) {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? ITEMS_PER_PAGE;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from('manga')
    .select('id, slug, title, cover_url, status, rating, views', { count: 'exact' })
    .is('deleted_at', null)
    .range(from, to);

  if (filters.search) {
    query = query.ilike('title', `%${filters.search}%`);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.genre) {
    query = query.contains('genres', [filters.genre]);
  }

  const sortMap = {
    latest:  { column: 'updated_at', ascending: false },
    popular: { column: 'views',      ascending: false },
    rating:  { column: 'rating',     ascending: false },
    title:   { column: 'title',      ascending: true },
  };
  const sort = sortMap[filters.sortBy ?? 'latest'];
  query = query.order(sort.column, { ascending: sort.ascending });

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return {
    data: data ?? [],
    total: count ?? 0,
    page,
    perPage,
    totalPages: Math.ceil((count ?? 0) / perPage),
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
