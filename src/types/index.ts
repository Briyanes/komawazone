// Shared application types — built on top of database types
import type { Tables } from './database';

// ── Domain types ────────────────────────────────────────────────────────────

export type User = Tables<'users'>;
export type Manga = Tables<'manga'>;
export type Chapter = Tables<'chapters'>;
export type ChapterImage = Tables<'chapter_images'>;
export type ReadingProgress = Tables<'reading_progress'>;
export type Bookmark = Tables<'bookmarks'>;
export type Like = Tables<'likes'>;
export type Genre = Tables<'genres'>;
export type AdProvider = Tables<'ad_providers'>;
export type AdZone = Tables<'ad_zones'>;
export type AdCampaign = Tables<'ad_campaigns'>;

// ── Extended / Joined types ──────────────────────────────────────────────────

export interface MangaWithDetails extends Omit<Manga, 'genres'> {
  genres: Genre[];
  chapters: Chapter[];
  _count?: {
    likes: number;
    bookmarks: number;
    chapters: number;
  };
}

export interface ChapterWithImages extends Chapter {
  images: ChapterImage[];
  manga: Pick<Manga, 'id' | 'slug' | 'title'>;
  prevChapter: Pick<Chapter, 'id' | 'number'> | null;
  nextChapter: Pick<Chapter, 'id' | 'number'> | null;
}

export interface UserProfile extends User {
  readingProgress?: ReadingProgress[];
  bookmarks?: Bookmark[];
  likes?: Like[];
}

// ── UI State types ───────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark';

export type ReaderMode = 'webtoon' | 'manga' | 'single';
export type ReaderWidth = 'narrow' | 'medium' | 'wide' | 'full';

export interface ReaderSettings {
  mode: ReaderMode;
  width: ReaderWidth;
  showProgressBar: boolean;
}

// ── API types ────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  code: number;
  data?: T;
  error?: {
    type: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export type MangaStatus = 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';

export interface MangaFilters {
  status?: MangaStatus;
  genre?: string;
  search?: string;
  sortBy?: 'latest' | 'popular' | 'rating' | 'title';
  page?: number;
  perPage?: number;
}

// ── Ad types ─────────────────────────────────────────────────────────────────

export type AdPlacement =
  | 'home_top'
  | 'home_bottom'
  | 'reader_top'
  | 'reader_bottom'
  | 'sidebar'
  | 'search_results'
  | 'chapter_between_pages';

export interface ActiveAdCampaign extends AdCampaign {
  zone: AdZone;
  provider: AdProvider;
}
