'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import Image from 'next/image';
import { ReviewForm } from './ReviewForm';
import { sanitizeText } from '@/lib/sanitize';

interface Review {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  users?: { id: string; username: string | null; avatar_url: string | null };
}

export function ReviewsCarousel({ slug }: { slug: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchReviews = async () => {
    try {
      const res = await fetch(`/api/v1/manga/${slug}/reviews?limit=5`);
      if (res.ok) {
        const json = await res.json() as { data?: Review[] };
        setReviews(json.data ?? []);
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading || reviews.length === 0) {
    return (
      <section className="rounded-2xl p-4 md:p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
            <Star size={14} /> Ulasan Pengguna
          </h2>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            Tulis Ulasan
          </button>
        </div>
        <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
          Belum ada ulasan. Jadilah yang pertama!
        </p>
        {showForm && <ReviewForm slug={slug} onClose={() => setShowForm(false)} onSuccess={fetchReviews} />}
      </section>
    );
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const displayReviews = isMobile ? [reviews[currentIdx]].filter(Boolean) : reviews;

  const goNext = () => {
    setCurrentIdx((prev) => (prev + 1) % reviews.length);
  };

  const goPrev = () => {
    setCurrentIdx((prev) => (prev - 1 + reviews.length) % reviews.length);
  };

  return (
    <>
      <section className="rounded-2xl p-4 md:p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
            <Star size={14} /> Ulasan Pengguna
          </h2>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            Tulis Ulasan
          </button>
        </div>

        {/* Desktop: Multi-card scroll */}
        <div className="hidden md:flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {displayReviews.map((review) => (
            <div
              key={review.id}
              className="shrink-0 rounded-xl p-3 w-64 flex flex-col gap-2"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-1">
                  {review.users?.avatar_url && (
                    <Image
                      src={review.users.avatar_url}
                      alt={review.users.username ?? 'User'}
                      width={28}
                      height={28}
                      className="rounded-full shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {review.users?.username ?? 'Anonymous'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(review.created_at).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                    />
                  ))}
                </div>
              </div>

              {review.text && (
                <p
                  className="text-xs line-clamp-3"
                  style={{ color: 'var(--text-secondary)' }}
                  dangerouslySetInnerHTML={{ __html: sanitizeText(review.text) }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Mobile: Single card with nav */}
        <div className="flex md:hidden flex-col gap-3">
          {displayReviews.length > 0 && (
            <div
              className="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-1">
                  {displayReviews[0]?.users?.avatar_url && (
                    <Image
                      src={displayReviews[0].users.avatar_url}
                      alt={displayReviews[0].users.username ?? 'User'}
                      width={32}
                      height={32}
                      className="rounded-full shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {displayReviews[0]?.users?.username ?? 'Anonymous'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(displayReviews[0]?.created_at ?? '').toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i < (displayReviews[0]?.rating ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                    />
                  ))}
                </div>
              </div>

              {displayReviews[0]?.text && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {displayReviews[0].text}
                </p>
              )}
            </div>
          )}

          {reviews.length > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={goPrev}
                className="p-2 rounded-lg transition-colors hover:opacity-70"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                aria-label="Previous review"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                {currentIdx + 1} / {reviews.length}
              </span>
              <button
                onClick={goNext}
                className="p-2 rounded-lg transition-colors hover:opacity-70"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                aria-label="Next review"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </section>

      {showForm && (
        <ReviewForm
          slug={slug}
          onClose={() => setShowForm(false)}
          onSuccess={fetchReviews}
        />
      )}
    </>
  );
}
