'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, ArrowUp, ArrowDown, ArrowUpDown, BookOpen, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { ChapterItem } from './ChapterItem';

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  release_date: string;
  views?: number;
  thumbnail_url?: string | null;
}

interface ChapterProgress {
  chapterId: string;
  chapterNumber: number;
  page?: number;
  totalPages?: number;
}

const PAGE_SIZE = 50;

export function ChapterListSection({
  chapters: all,
  mangaSlug,
}: {
  chapters: Chapter[];
  mangaSlug: string;
}) {
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  const [chapterProgress, setChapterProgress] = useState<ChapterProgress | null>(null);
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const listBottomRef = useRef<HTMLDivElement | null>(null);

  // Load read chapters + current progress from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`read_chapters_${mangaSlug}`);
      if (raw) setReadChapters(new Set(JSON.parse(raw) as string[]));
      const prog = localStorage.getItem(`progress_${mangaSlug}`);
      if (prog) setChapterProgress(JSON.parse(prog) as ChapterProgress);
    } catch { /* ignore */ }
  }, [mangaSlug]);

  const ordered = useMemo(() => {
    return [...all].sort((a, b) => {
      if (sortOrder === 'newest') return b.number - a.number;
      return a.number - b.number;
    });
  }, [all, sortOrder]);

  const filtered = useMemo(() => {
    let result = ordered;
    // Apply read/unread filter
    if (readFilter === 'unread') result = result.filter(ch => !readChapters.has(ch.id));
    else if (readFilter === 'read') result = result.filter(ch => readChapters.has(ch.id));
    // Apply search
    const q = query.trim().toLowerCase();
    if (!q) return result;
    return result.filter(ch => {
      const numStr = String(ch.number);
      const titleStr = (ch.title ?? '').toLowerCase();
      return numStr.includes(q) || titleStr.includes(q);
    });
  }, [ordered, query, readFilter, readChapters]);

  const newestChapterNumber = useMemo(() => {
    return all.reduce((max, ch) => Math.max(max, ch.number), Number.NEGATIVE_INFINITY);
  }, [all]);

  // Feature #5: count new chapters since last read
  const newChapterCount = useMemo(() => {
    if (!chapterProgress) return 0;
    return all.filter(ch => ch.number > chapterProgress.chapterNumber && !readChapters.has(ch.id)).length;
  }, [all, chapterProgress, readChapters]);

  const visible = filtered.slice(0, shown);
  const hasMore = shown < filtered.length;

  const scrollToTop = () => {
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToBottom = () => {
    listBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  return (
    <section>
      {/* Header + search */}
      <div ref={listTopRef} className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            Chapters
          </h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
            {all.length}
          </span>
          {readChapters.size > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
              {readChapters.size} dibaca
            </span>
          )}
          {query.trim() && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              {filtered.length} hasil
            </span>
          )}
        </div>

        {all.length > 0 && (
          <div className="flex flex-col gap-2">
            {/* Feature #5: New chapters banner */}
            {newChapterCount > 0 && (
              <button
                onClick={() => {
                  setReadFilter('unread');
                  setSortOrder('newest');
                  setShown(PAGE_SIZE);
                }}
                className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-left transition-opacity hover:opacity-80"
                style={{ background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)', color: 'var(--color-primary)' }}
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold" style={{ background: 'var(--color-primary)' }}>
                  {newChapterCount > 99 ? '99+' : newChapterCount}
                </span>
                Chapter baru sejak terakhir kamu baca — tap untuk filter
              </button>
            )}
            <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setShown(PAGE_SIZE); }}
                placeholder="Cari chapter, contoh: 69 atau 76"
                className="w-full rounded-lg pl-7 pr-7 py-2 text-xs outline-none"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
              />
              {query && (
                <button onClick={() => { setQuery(''); setShown(PAGE_SIZE); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X size={11} style={{ color: 'var(--text-tertiary)' }} />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setSortOrder(prev => (prev === 'newest' ? 'oldest' : 'newest'));
                setShown(PAGE_SIZE);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
              aria-label="Toggle urutan chapter"
            >
              <ArrowUpDown size={12} style={{ color: 'var(--text-tertiary)' }} />
              {sortOrder === 'newest' ? 'Terbaru' : 'Terlama'}
            </button>

            {/* Read filter toggle */}
            <button
              onClick={() => {
                setReadFilter(prev => prev === 'all' ? 'unread' : prev === 'unread' ? 'read' : 'all');
                setShown(PAGE_SIZE);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80"
              style={{
                background: readFilter === 'unread' ? 'rgba(255,107,53,0.12)' : readFilter === 'read' ? 'rgba(34,197,94,0.12)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border-light)',
                color: readFilter === 'unread' ? 'var(--color-primary)' : readFilter === 'read' ? '#22c55e' : 'var(--text-primary)',
              }}
              aria-label="Filter status baca"
              title="Klik untuk ganti filter: Semua → Belum Dibaca → Sudah Dibaca"
            >
              {readFilter === 'read' ? <Eye size={12} /> : readFilter === 'unread' ? <EyeOff size={12} /> : <BookOpen size={12} style={{ color: 'var(--text-tertiary)' }} />}
              {readFilter === 'all' ? 'Semua' : readFilter === 'unread' ? 'Belum' : 'Sudah'}
            </button>
          </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-light)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10" style={{ color: 'var(--text-tertiary)' }}>
            <span className="text-3xl opacity-20">🔍</span>
            <p className="text-sm">Chapter tidak ditemukan</p>
          </div>
        ) : (
          <>
            {visible.map((ch, i) => (
              <div key={ch.id} style={{ borderBottom: i < visible.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <ChapterItem
                  id={ch.id}
                  mangaSlug={mangaSlug}
                  number={ch.number}
                  title={ch.title}
                  releaseDate={ch.release_date}
                  views={ch.views}
                  isNew={sortOrder === 'newest' && !query.trim() && ch.number === newestChapterNumber}
                  isRead={readChapters.has(ch.id)}
                  thumbnailUrl={ch.thumbnail_url}
                  isCurrent={chapterProgress?.chapterId === ch.id}
                />
              </div>
            ))}

            {hasMore && (
              <button
                onClick={() => setShown(s => s + PAGE_SIZE)}
                className="flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-light)' }}
              >
                <ChevronDown size={15} />
                Show more ({filtered.length - shown} remaining)
              </button>
            )}

            <div ref={listBottomRef} />
          </>
        )}
      </div>

      {filtered.length > 8 && (
        <div className="sticky bottom-4 mt-3 flex justify-end pr-1 pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-2 rounded-xl p-1.5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
            <button
              onClick={scrollToTop}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-opacity hover:opacity-80"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              aria-label="Ke chapter paling atas"
              title="Ke chapter paling atas"
            >
              <ArrowUp size={15} />
            </button>
            <button
              onClick={scrollToBottom}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-opacity hover:opacity-80"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              aria-label="Ke chapter paling bawah"
              title="Ke chapter paling bawah"
            >
              <ArrowDown size={15} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
