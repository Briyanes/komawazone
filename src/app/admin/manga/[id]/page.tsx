import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MangaForm } from '@/components/admin/MangaForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditMangaPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: manga } = await supabase
    .from('manga')
    .select('id, slug, title, alt_title, description, cover_url, banner_url, status, type, author, artist, release_year, genres, content_rating')
    .eq('id', id)
    .single();

  if (!manga) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          Edit: {manga.title}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Update manga details below.
        </p>
      </div>
      <MangaForm
        mode="edit"
        initial={{
          id: manga.id,
          title: manga.title,
          alt_title: manga.alt_title ?? '',
          slug: manga.slug,
          description: manga.description ?? '',
          cover_url: manga.cover_url ?? '',
          banner_url: manga.banner_url ?? '',
          status: manga.status,
          type: manga.type,
          author: manga.author ?? '',
          artist: manga.artist ?? '',
          release_year: String(manga.release_year ?? new Date().getFullYear()),
          genres: manga.genres ?? [],
          content_rating: (manga as { content_rating?: 'general' | 'mature' }).content_rating ?? 'general',
        }}
      />
    </div>
  );
}
