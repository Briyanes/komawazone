import { Suspense } from 'react';
import SearchContent from './SearchContent';
import { MangaCardSkeleton } from '@/components/ui/Skeleton';

export const metadata = { title: 'Cari Manga', description: 'Cari manga dan manhwa berdasarkan genre, status, dan rating.' };

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchContent />
    </Suspense>
  );
}

function SearchFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 h-12 rounded-xl skeleton" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 sm:gap-4">
        {Array.from({ length: 20 }).map((_, i) => <MangaCardSkeleton key={i} />)}
      </div>
    </div>
  );
}
