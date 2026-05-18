export const revalidate = 3600; // 1 hour ISR

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GenreGrid } from '@/components/manga/GenreGrid';
import Link from 'next/link';
import { ChevronRight, Tag } from 'lucide-react';

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('genres').select('name').eq('slug', slug).single();
  return {
    title: data?.name ? `Manga ${data.name}` : 'Genre',
    description: data?.name ? `Baca manga dan manhwa genre ${data.name} terlengkap. Update setiap hari.` : undefined,
  };
}

export default async function GenrePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: genre } = await supabase
    .from('genres')
    .select('id, name, slug, description')
    .eq('slug', slug)
    .single();

  if (!genre) notFound();

  const { data: manga } = await supabase
    .from('manga')
    .select('id, slug, title, cover_url, status, rating, views, updated_at')
    .is('deleted_at', null)
    .contains('genres', [genre.name])
    .order('updated_at', { ascending: false })
    .limit(200);

  const items = (manga ?? []) as Array<{
    id: string; slug: string; title: string;
    cover_url: string | null; status: string; rating: number; views: number; updated_at: string;
  }>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <Link href="/" className="hover:underline">Home</Link>
        <ChevronRight size={12} />
        <Link href="/search" className="hover:underline">Browse</Link>
        <ChevronRight size={12} />
        <span style={{ color: 'var(--text-primary)' }}>{genre.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,107,53,0.12)' }}
        >
          <Tag size={18} style={{ color: 'var(--color-primary)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {genre.name}
          </h1>
          {genre.description && (
            <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {genre.description}
            </p>
          )}
          <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {items.length} title{items.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-2xl border py-16 text-center"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
        >
          No manga in this genre yet.
        </div>
      ) : (
        <GenreGrid items={items} />
      )}
    </div>
  );
}
