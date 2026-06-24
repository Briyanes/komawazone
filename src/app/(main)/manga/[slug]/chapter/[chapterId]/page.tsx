import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cache } from 'react';
import { getChapterWithImages, getAdjacentChapters, getMangaChapterList, MATURE_PREVIEW_CHAPTERS } from '@/lib/api/manga';
import { ReaderClient } from '@/components/reader/ReaderClient';
import { AdZone } from '@/components/ads/AdZone';
import { createClient } from '@/lib/supabase/server';

// Lazy-load scraping was removed — the heavy DB/API egress killer is gone.
// Page remains dynamic because mature-content gating checks user VIP status
// per-request (redirect). But without the scrape, egress is now minimal.
export const dynamic = 'force-dynamic';

// Deduplicate: generateMetadata and the page both call this — use React cache
const getChapter = cache((id: string) => getChapterWithImages(id));

interface Props {
  params: Promise<{ slug: string; chapterId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chapterId } = await params;
  const chapter = await getChapter(chapterId);
  if (!chapter) return { title: 'Chapter Not Found' };
  return {
    title: `Chapter ${chapter.number}${chapter.title ? ` — ${chapter.title}` : ''} | ${chapter.manga?.title ?? ''}`,
    robots: { index: false },
  };
}

export default async function ChapterReaderPage({ params }: Props) {
  const { chapterId } = await params;
  const chapter = await getChapter(chapterId);
  if (!chapter) notFound();

  // Gate mature chapters: first 3 are free preview, chapter 4+ requires VIP
  if (chapter.manga?.content_rating === 'mature' && chapter.number > MATURE_PREVIEW_CHAPTERS) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let canAccess = false;
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('vip_expires_at, role')
        .eq('id', user.id)
        .single();
      const row = data as { vip_expires_at?: string | null; role?: string | null } | null;
      if (row?.role === 'ADMIN') {
        canAccess = true;
      } else {
        const exp = row?.vip_expires_at;
        canAccess = !!exp && new Date(exp) > new Date();
      }
    }
    if (!canAccess) {
      redirect(`/vip?reason=mature&manga=${encodeURIComponent(chapter.manga?.slug ?? '')}`);
    }
  }

  const [{ prev, next }, chapterList] = await Promise.all([
    getAdjacentChapters(chapter.manga_id, chapter.number),
    getMangaChapterList(chapter.manga_id),
  ]);

  return (
    <>
      <Suspense fallback={null}>
        <AdZone placement="READER_TOP" className="w-full" />
      </Suspense>

      <ReaderClient
        chapterId={chapterId}
        chapterNumber={chapter.number}
        chapterTitle={chapter.title ?? undefined}
        images={chapter.chapter_images}
        mangaId={chapter.manga_id}
        mangaSlug={chapter.manga?.slug ?? ''}
        mangaTitle={chapter.manga?.title ?? ''}
        mangaCover={chapter.manga?.cover_url ?? null}
        prevChapterId={prev?.id}
        nextChapterId={next?.id}
        chapterList={chapterList}
      />

      <Suspense fallback={null}>
        <AdZone placement="READER_BOTTOM" className="w-full" />
      </Suspense>
    </>
  );
}
