import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getChapterWithImages, getAdjacentChapters, getMangaChapterList } from '@/lib/api/manga';
import { ReaderClient } from '@/components/reader/ReaderClient';
import { AdZone } from '@/components/ads/AdZone';

interface Props {
  params: Promise<{ slug: string; chapterId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chapterId } = await params;
  const chapter = await getChapterWithImages(chapterId);
  if (!chapter) return { title: 'Chapter Not Found' };
  return {
    title: `Chapter ${chapter.number}${chapter.title ? ` — ${chapter.title}` : ''} | ${chapter.manga?.title ?? ''}`,
    robots: { index: false },
  };
}

export default async function ChapterReaderPage({ params }: Props) {
  const { chapterId } = await params;
  const chapter = await getChapterWithImages(chapterId);
  if (!chapter) notFound();

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
        mangaSlug={chapter.manga?.slug ?? ''}
        mangaTitle={chapter.manga?.title ?? ''}
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
