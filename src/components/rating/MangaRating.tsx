'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';

interface MangaRatingProps {
  mangaId: string;
  initialRating?: number;
  initialCount?: number;
  showCount?: boolean;
  onRated?: (rating: number) => void;
}

export function MangaRating({
  mangaId,
  initialRating = 0,
  initialCount = 0,
  showCount = false,
  onRated,
}: MangaRatingProps) {
  const { isAuthenticated } = useAuth();
  const [userRating, setUserRating] = useState<number | null>(null);
  const [averageRating] = useState(initialRating);
  const [ratingCount] = useState(initialCount);
  const [hover, setHover] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchUserRating = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(`/api/v1/user/ratings?manga_id=${mangaId}`);
      const json = await res.json() as { status: string; data?: number | null };
      if (json.status === 'success') {
        setUserRating(json.data ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch rating:', err);
    }
  }, [isAuthenticated, mangaId]);

  useEffect(() => {
    fetchUserRating();
  }, [fetchUserRating]);

  const handleRate = async (rating: number) => {
    if (!isAuthenticated) return;

    // Allow clicking same star to remove rating
    const newRating = userRating === rating ? null : rating;

    setLoading(true);
    try {
      const res = await fetch('/api/v1/user/ratings', {
        method: newRating === null ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manga_id: mangaId, rating: newRating ?? 0 }),
      });

      if (res.ok) {
        setUserRating(newRating);
        if (onRated && newRating) onRated(newRating);
      }
    } catch (err) {
      console.error('Failed to rate:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Stars */}
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = userRating !== null ? star <= userRating : star <= hover;

          return (
            <button
              key={star}
              onClick={() => handleRate(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              disabled={!isAuthenticated || loading}
              className={cn(
                'transition-transform hover:scale-110 active:scale-95',
                !isAuthenticated && 'cursor-not-allowed opacity-50'
              )}
              title={isAuthenticated ? `Rate ${star} star${star > 1 ? 's' : ''}` : 'Login to rate'}
            >
              <Star
                size={showCount ? 18 : 16}
                className={cn(
                  'transition-colors',
                  filled
                    ? 'fill-[#FBBF24] text-[#FBBF24]'
                    : 'fill-transparent text-[var(--border-default)]'
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Count */}
      {showCount && (
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {averageRating > 0 ? averageRating.toFixed(1) : 'N/A'}
          {ratingCount > 0 && (
            <span className="ml-1">({ratingCount >= 1000 ? `${(ratingCount / 1000).toFixed(1)}k` : ratingCount})</span>
          )}
        </span>
      )}

      {/* User rating indicator */}
      {userRating && (
        <span className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
          {userRating}/5
        </span>
      )}
    </div>
  );
}
