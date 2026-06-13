export const revalidate = 3600; // 1 hour ISR

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GenreGrid } from '@/components/manga/GenreGrid';
import Link from 'next/link';
import { ChevronRight, Tag, Lock, Crown } from 'lucide-react';

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
    .select('id, name, slug, description, is_mature')
    .eq('slug', slug)
    .single();

  if (!genre) notFound();

  // VIP/Admin check for mature content
  const { data: { user } } = await supabase.auth.getUser();
  let canSeeMature = false;
  let isLoggedIn = false;
  if (user) {
    isLoggedIn = true;
    const { data: userData } = await supabase
      .from('users')
      .select('vip_expires_at, role')
      .eq('id', user.id)
      .single();
    const row = userData as { vip_expires_at?: string | null; role?: string | null } | null;
    if (row?.role === 'ADMIN') {
      canSeeMature = true;
    } else {
      const exp = row?.vip_expires_at;
      canSeeMature = !!exp && new Date(exp) > new Date();
    }
  }

  // If the genre itself is mature and user isn't VIP, show gate
  if ((genre as { is_mature?: boolean }).is_mature && !canSeeMature) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <nav className="flex items-center gap-1.5 text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
          <Link href="/" className="hover:underline">Home</Link>
          <ChevronRight size={12} />
          <Link href="/genre" className="hover:underline">Genre</Link>
          <ChevronRight size={12} />
          <span style={{ color: 'var(--text-primary)' }}>{genre.name}</span>
        </nav>
        <div
          className="rounded-2xl p-8 text-center space-y-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(245,158,11,0.35)' }}
        >
          <div className="flex justify-center">
            <span className="flex size-14 items-center justify-center rounded-full" style={{ background: '#f59e0b' }}>
              <Lock size={24} className="text-white" />
            </span>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Genre 18+ — Khusus VIP
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isLoggedIn
                ? `Genre "${genre.name}" mengandung konten dewasa. Upgrade ke VIP untuk mengakses.`
                : `Genre "${genre.name}" mengandung konten dewasa. Login atau upgrade ke VIP untuk mengakses.`}
            </p>
          </div>
          {isLoggedIn ? (
            <Link
              href="/vip"
              className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white"
              style={{ background: '#f59e0b' }}
            >
              <Crown size={15} /> Upgrade ke VIP
            </Link>
          ) : (
            <div className="flex justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                Masuk
              </Link>
              <Link
                href="/vip"
                className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white"
                style={{ background: '#f59e0b' }}
              >
                <Crown size={15} /> VIP
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  let mangaQuery = supabase
    .from('manga')
    .select('id, slug, title, cover_url, status, rating, views, updated_at, content_rating')
    .is('deleted_at', null)
    .contains('genres', [genre.name]);

  // Filter out mature manga for non-VIP/non-admin users
  if (!canSeeMature) {
    mangaQuery = mangaQuery.neq('content_rating', 'mature');
  }

  const { data: manga } = await mangaQuery
    .order('updated_at', { ascending: false })
    .limit(200);

  const items = (manga ?? []) as Array<{
    id: string; slug: string; title: string;
    cover_url: string | null; status: string; rating: number; views: number; updated_at: string;
    content_rating?: 'general' | 'mature';
  }>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <Link href="/" className="hover:underline">Home</Link>
        <ChevronRight size={12} />
        <Link href="/genre" className="hover:underline">Genre</Link>
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
            {items.length} judul
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-2xl border py-16 text-center"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
        >
          Belum ada manga dalam genre ini.
        </div>
      ) : (
        <GenreGrid items={items} />
      )}
    </div>
  );
}
