export const revalidate = 3600;

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Tag, Lock, Crown } from 'lucide-react';

export const metadata = {
  title: 'Semua Genre — OLLUQ',
  description: 'Jelajahi manga, manhwa & manhua berdasarkan genre favorit kamu.',
};

export default async function GenreListPage() {
  const supabase = await createClient();
  const { data: genres } = await supabase
    .from('genres')
    .select('id, name, slug, is_mature')
    .order('name');

  // VIP check for mature genres
  const { data: { user } } = await supabase.auth.getUser();
  let isVip = false;
  if (user) {
    const { data: userData } = await supabase
      .from('users')
      .select('vip_expires_at, role')
      .eq('id', user.id)
      .single();
    const row = userData as { vip_expires_at?: string | null; role?: string | null } | null;
    if (row?.role === 'ADMIN') {
      isVip = true;
    } else {
      const exp = row?.vip_expires_at;
      isVip = !!exp && new Date(exp) > new Date();
    }
  }

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
          {genres.map(g => {
            const isMature = (g as { is_mature?: boolean }).is_mature;
            const locked = isMature && !isVip;
            if (locked) {
              return (
                <Link
                  key={g.id}
                  href="/vip"
                  className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold text-center transition-all hover:scale-105"
                  style={{
                    background: 'rgba(245,158,11,0.08)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245,158,11,0.3)',
                  }}
                  title="Butuh VIP untuk akses genre ini"
                >
                  <Lock size={12} />
                  {g.name}
                  <Crown size={12} />
                </Link>
              );
            }
            return (
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
            );
          })}
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Belum ada genre tersedia.
        </p>
      )}
    </div>
  );
}
