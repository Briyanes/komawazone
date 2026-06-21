'use client';

import { useState, useTransition } from 'react';
import { BookMarked, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';

interface QuickAddButtonProps {
  mangaId: string;
  className?: string;
}

/**
 * Small floating button to quickly add a manga to reading list with "plan_to_read".
 * Placed inside a <Link>: uses stopPropagation so the click doesn't navigate.
 */
export function QuickAddButton({ mangaId, className }: QuickAddButtonProps) {
  const { isAuthenticated } = useAuth();
  const [added, setAdded]               = useState(false);
  const [isPending, startTransition]    = useTransition();

  if (!isAuthenticated) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (added || isPending) return;
    startTransition(async () => {
      const res = await fetch('/api/v1/user/reading-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manga_id: mangaId, status: 'plan_to_read' }),
      });
      if (res.ok) setAdded(true);
    });
  };

  return (
    <button
      onClick={handleClick}
      title={added ? 'Sudah ditambahkan' : 'Tambah ke Daftar Baca'}
      className={cn(
        'absolute bottom-1.5 right-1.5 z-20',
        'flex size-7 items-center justify-center rounded-full',
        'md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150',
        'shadow-md backdrop-blur-sm',
        added
          ? 'bg-[var(--color-primary)] text-white'
          : 'bg-black/60 text-white hover:bg-[var(--color-primary)]',
        className,
      )}
    >
      {isPending ? (
        <Loader2 size={12} className="animate-spin" />
      ) : added ? (
        <Check size={12} />
      ) : (
        <BookMarked size={12} />
      )}
    </button>
  );
}
