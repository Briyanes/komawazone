'use client';

import { useState } from 'react';
import { Star, Send, X } from 'lucide-react';

interface ReviewFormProps {
  slug: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReviewForm({ slug, onClose, onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/v1/manga/${slug}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, text: text.trim() || null }),
      });

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else if (res.status === 401) {
        setError('Please login to submit a review');
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? `Failed to submit review (${res.status})`);
      }
    } catch {
      setError('Network error - check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div
        className="rounded-2xl p-6 w-full max-w-md my-auto"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>
            Write a Review
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors hover:opacity-70"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Rating selector */}
        <div className="mb-4">
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Rating
          </label>
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <button
                key={i}
                onClick={() => setRating(i + 1)}
                onMouseEnter={() => setHoveredRating(i + 1)}
                onMouseLeave={() => setHoveredRating(0)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={28}
                  className={
                    i < (hoveredRating || rating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }
                />
              </button>
            ))}
          </div>
        </div>

        {/* Text area */}
        <div className="mb-4">
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Your Review (optional)
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share your thoughts..."
            className="w-full rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-light)',
            }}
            rows={4}
            maxLength={500}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {text.length}/500
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            {loading ? 'Submitting...' : <>
              <Send size={14} /> Submit
            </>}
          </button>
        </div>
      </div>
    </div>
  );
}
