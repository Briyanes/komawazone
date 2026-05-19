export const revalidate = 3600;

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Tag } from 'lucide-react';

export const metadata = {
  title: 'Semua Genre — Komawa Zone',
  description: 'Jelajahi manga, manhwa & manhua berdasarkan genre favorit kamu.',
};

export default async function GenreListPage() {
  const supabase = await createClient();
  const { data: genres } = await supabase
    .from('genres')
    .select('id, name, slug')
    .order('name');

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-8 flex items-center gap-3">
        <Tag className="size-6" style={{ color: '#FF6B35' }} />
        <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
          Semua Genre
        </h1>
      </div>

      {genres && genres.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {genres.map(g => (
            <Link
              key={g.id}
              href={`/genre/${g.slug}`}
              className="rounded-xl px-4 py-3 text-sm font-semibold text-center transition-all hover:scale-105 hover:text-[#FF6B35]"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-light)',
              }}
            >
              {g.name}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Belum ada genre tersedia.
        </p>
      )}
    </div>
  );
}
