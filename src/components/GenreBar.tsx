'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';

const GENRES = [
  { label: 'Semua',     href: '/search' },
  { label: 'Action',    href: '/search?genre=Action' },
  { label: 'Romance',   href: '/search?genre=Romance' },
  { label: 'Fantasy',   href: '/search?genre=Fantasy' },
  { label: 'Comedy',    href: '/search?genre=Comedy' },
  { label: 'Drama',     href: '/search?genre=Drama' },
  { label: 'Horror',    href: '/search?genre=Horror' },
  { label: 'Slice of Life', href: '/search?genre=Slice+of+Life' },
  { label: 'Isekai',    href: '/search?genre=Isekai' },
  { label: 'Sports',    href: '/search?genre=Sports' },
  { label: 'Sci-Fi',    href: '/search?genre=Sci-Fi' },
  { label: 'Mystery',   href: '/search?genre=Mystery' },
  { label: 'Martial Arts', href: '/search?genre=Martial+Arts' },
  { label: 'Manhwa',    href: '/search?type=MANHWA' },
  { label: 'Manhua',    href: '/search?type=MANHUA' },
  { label: 'Completed', href: '/search?status=COMPLETED' },
];

export function GenreBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentGenre = searchParams.get('genre');
  const currentType  = searchParams.get('type');
  const currentStatus = searchParams.get('status');

  const isActive = (href: string) => {
    if (href === '/search' && pathname === '/search' && !currentGenre && !currentType && !currentStatus) return false;
    if (href.includes('genre=')) return href.includes(`genre=${currentGenre}`);
    if (href.includes('type='))  return href.includes(`type=${currentType}`);
    if (href.includes('status=')) return href.includes(`status=${currentStatus}`);
    return false;
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
      {GENRES.map(g => (
        <Link
          key={g.label}
          href={g.href}
          className={cn(
            'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
            isActive(g.href)
              ? 'text-white'
              : 'hover:opacity-80'
          )}
          style={
            isActive(g.href)
              ? { background: 'var(--color-primary)', color: '#fff' }
              : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color, rgba(0,0,0,0.08))' }
          }
        >
          {g.label}
        </Link>
      ))}
    </div>
  );
}
