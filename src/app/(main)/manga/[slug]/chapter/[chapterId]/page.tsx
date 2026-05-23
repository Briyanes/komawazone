import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getChapterWithImages, getAdjacentChapters, getMangaChapterList } from '@/lib/api/manga';
import { ReaderClient } from '@/components/reader/ReaderClient';
import { AdZone } from '@/components/ads/AdZone';
import { createClient } from '@/lib/supabase/server';

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

  // Gate mature chapters for non-VIP users
  if (chapter.manga?.content_rating === 'mature') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let isVip = false;
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('vip_expires_at')
        .eq('id', user.id)
        .single();
      const exp = (data as { vip_expires_at?: string | null } | null)?.vip_expires_at;
      isVip = !!exp && new Date(exp) > new Date();
    }
    if (!isVip) {
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
