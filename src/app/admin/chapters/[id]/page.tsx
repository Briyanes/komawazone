import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ChapterEditClient } from '@/components/admin/ChapterEditClient';

interface Props { params: Promise<{ id: string }> }

export default async function EditChapterPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: chapter } = await supabase
    .from('chapters')
    .select('id, manga_id, number, title, release_date, thumbnail_url, manga:manga(id, title, slug)')
    .eq('id', id)
    .single();

  if (!chapter) notFound();

  const { data: images } = await supabase
    .from('chapter_images')
    .select('id, number, image_url, width, height')
    .eq('chapter_id', id)
    .order('number', { ascending: true });

  const manga = chapter.manga as unknown as { id: string; title: string; slug: string } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {manga?.title ?? 'Unknown manga'}
        </p>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          Edit Chapter {chapter.number}
        </h2>
      </div>

      <ChapterEditClient
        chapterId={id}
        mangaSlug={manga?.slug ?? ''}
        initialNumber={chapter.number}
        initialTitle={chapter.title ?? ''}
        initialReleaseDate={(chapter as Record<string, unknown>).release_date as string | null}
        initialThumbnailUrl={(chapter as Record<string, unknown>).thumbnail_url as string | null}
        initialImages={(images ?? []) as { id: string; number: number; image_url: string; width: number; height: number }[]}
      />
    </div>
  );
}
