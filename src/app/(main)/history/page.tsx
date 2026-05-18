'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { History, Trash2, BookOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HistoryEntry {
  mangaSlug: string;
  mangaTitle: string;
  mangaCover: string | null;
  chapterId: string;
  chapterNumber: number;
  readAt: number; // timestamp ms
}

const HISTORY_KEY = 'manga_history';

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const entries = JSON.parse(raw) as HistoryEntry[];
        // Sort newest first
        setHistory(entries.sort((a, b) => b.readAt - a.readAt));
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  const clearAll = () => {
    if (!confirm('Hapus semua riwayat baca?')) return;
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const removeEntry = (slug: string) => {
    const next = history.filter(h => h.mangaSlug !== slug);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <History size={18} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Riwayat Baca
          </h1>
          {history.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
              {history.length}
            </span>
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}
          >
            <Trash2 size={12} /> Hapus Semua
          </button>
        )}
      </div>

      {/* Empty state */}
      {loaded && history.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20" style={{ color: 'var(--text-tertiary)' }}>
          <BookOpen size={40} style={{ opacity: 0.2 }} />
          <p className="text-sm">Belum ada riwayat baca</p>
          <Link href="/" className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
            Mulai baca sekarang →
          </Link>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {history.map(entry => (
          <div
            key={entry.mangaSlug}
            className="flex items-center gap-3 rounded-2xl p-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
          >
            {/* Cover */}
            <Link href={`/manga/${entry.mangaSlug}`} className="shrink-0">
              <div className="relative overflow-hidden rounded-lg" style={{ width: 52, height: 72 }}>
                {entry.mangaCover ? (
                  <Image
                    src={entry.mangaCover}
                    alt={entry.mangaTitle}
                    fill
                    className="object-cover"
                    sizes="52px"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-lg" style={{ background: 'var(--bg-tertiary)' }}>
                    📖
                  </div>
                )}
              </div>
            </Link>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <Link href={`/manga/${entry.mangaSlug}`}>
                <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {entry.mangaTitle}
                </p>
              </Link>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Chapter {entry.chapterNumber % 1 === 0 ? entry.chapterNumber : entry.chapterNumber.toFixed(1)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {formatDistanceToNow(new Date(entry.readAt), { addSuffix: true })}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 shrink-0">
              <Link
                href={`/manga/${entry.mangaSlug}/chapter/${entry.chapterId}`}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                <BookOpen size={11} /> Lanjut
              </Link>
              <button
                onClick={() => removeEntry(entry.mangaSlug)}
                className="flex items-center justify-center rounded-lg px-2.5 py-1.5 text-xs transition-opacity hover:opacity-70"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
