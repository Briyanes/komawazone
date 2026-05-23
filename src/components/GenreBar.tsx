'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Lock, Crown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Genre {
  id: string;
  name: string;
  is_mature: boolean;
}

function useVipAndGenres() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [isVip, setIsVip] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const [genreRes, { data: { user } }] = await Promise.all([
        supabase.from('genres').select('id, name, is_mature').order('name'),
        supabase.auth.getUser(),
      ]);
      setGenres((genreRes.data as Genre[] | null) ?? []);
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('vip_expires_at')
          .eq('id', user.id)
          .single();
        const exp = (data as { vip_expires_at?: string | null } | null)?.vip_expires_at;
        setIsVip(!!exp && new Date(exp) > new Date());
      }
    })();
  }, []);

  return { genres, isVip };
}

export function GenreBar() {
  const { genres, isVip } = useVipAndGenres();

  // Fall back to static list while loading
  const items = genres.length > 0 ? genres : [];
  const doubled = [...items, ...items];

  if (items.length === 0) return null;

  return (
    <div className="relative overflow-hidden py-0.5 group">
      {/* Left fade */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-10 z-10"
        style={{ background: 'linear-gradient(to right, var(--bg-primary), transparent)' }}
      />
      {/* Right fade */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 z-10"
        style={{ background: 'linear-gradient(to left, var(--bg-primary), transparent)' }}
      />

      {/* Marquee track */}
      <div
        className="flex gap-2 w-max"
        style={{ animation: 'marquee-scroll 35s linear infinite' }}
      >
        {doubled.map((genre, i) =>
          genre.is_mature && !isVip ? (
            <a
              key={i}
              href="/vip"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold whitespace-nowrap overflow-hidden transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'rgba(245,158,11,0.12)',
                color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.35)',
              }}
            >
              <Lock size={11} />
              {genre.name}
              <Crown size={10} />
            </a>
          ) : (
            <Link
              key={i}
              href={`/search?genre=${encodeURIComponent(genre.name)}`}
              className="shrink-0 rounded-full px-5 py-2 text-sm font-semibold whitespace-nowrap overflow-hidden transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-light)',
              }}
            >
              {genre.name}
            </Link>
          )
        )}
      </div>
    </div>
  );
}


