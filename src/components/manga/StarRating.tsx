'use client';

import { useState, useEffect, useTransition } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';

interface StarRatingProps {
  mangaId: string;
  currentRating: number;
  ratingCount: number;
}

export function StarRating({ mangaId, currentRating, ratingCount }: StarRatingProps) {
  const { isAuthenticated } = useAuth();
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [localRating, setLocalRating] = useState(currentRating);
  const [localCount, setLocalCount] = useState(ratingCount);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`/api/v1/user/ratings?manga_id=${mangaId}`)
      .then(r => r.json())
      .then((d: { status: string; data: number | null }) => {
        if (d.status === 'success') setUserRating(d.data);
      })
      .catch(() => {});
  }, [isAuthenticated, mangaId]);

  const handleRate = (star: number) => {
    if (!isAuthenticated) return;
    const isRemove = userRating === star;
    startTransition(async () => {
      if (isRemove) {
        await fetch(`/api/v1/user/ratings?manga_id=${mangaId}`, { method: 'DELETE' });
        setUserRating(null);
        setLocalCount(c => Math.max(0, c - 1));
      } else {
        await fetch('/api/v1/user/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manga_id: mangaId, rating: star }),
        });
        const wasRated = userRating !== null;
        setUserRating(star);
        if (!wasRated) setLocalCount(c => c + 1);
        // Optimistic local average
        setLocalRating(star);
      }
    });
  };

  const displayStar = hoveredStar ?? userRating;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {/* Star display (always shows avg rating) */}
        <div className="flex items-center gap-0.5" title={`${localRating.toFixed(1)} / 5`}>
          {[1, 2, 3, 4, 5].map(n => (
            isAuthenticated ? (
              <button
                key={n}
                type="button"
                disabled={isPending}
                onClick={() => handleRate(n)}
                onMouseEnter={() => setHoveredStar(n)}
                onMouseLeave={() => setHoveredStar(null)}
                className="p-0 leading-none disabled:cursor-not-allowed disabled:opacity-70"
                aria-label={`Beri rating ${n} bintang`}
              >
                <Star
                  size={20}
                  fill={n <= Math.round(displayStar ?? localRating) ? 'currentColor' : 'none'}
                  className={cn(
                    'transition-colors hover:scale-110 active:scale-95',
                    n <= Math.round(displayStar ?? localRating)
                      ? 'text-amber-400'
                      : 'text-[var(--border-medium)]'
                  )}
                />
              </button>
            ) : (
              <Star
                key={n}
                size={16}
                fill={n <= Math.round(localRating) ? 'currentColor' : 'none'}
                className={cn(
                  'transition-colors',
                  n <= Math.round(localRating) ? 'text-amber-400' : 'text-[var(--border-medium)]'
                )}
              />
            )
          ))}
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {localRating > 0 ? localRating.toFixed(1) : '—'}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          ({localCount.toLocaleString()})
        </span>
      </div>

      {isAuthenticated && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {userRating
            ? `Your rating: ${userRating} star${userRating !== 1 ? 's' : ''} — click to change or same star to remove`
            : 'Click a star to rate'}
        </p>
      )}
    </div>
  );
}
