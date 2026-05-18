'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  BookOpen, Heart, PlayCircle, RotateCcw, ChevronDown,
  BookMarked, Clock, CheckCircle2, PauseCircle, XCircle, Plus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

type ReadingStatus = 'reading' | 'plan_to_read' | 'completed' | 'on_hold' | 'dropped';

interface MangaActionsProps {
  mangaId: string;
  mangaSlug: string;
  firstChapterId?: string;
}

interface Progress {
  chapterId: string;
  chapterNumber: number;
}

const STATUS_CONFIG: Record<ReadingStatus, { label: string; icon: React.ReactNode; color: string }> = {
  reading:      { label: 'Sedang Dibaca',  icon: <BookOpen     size={14} />, color: 'text-green-400'  },
  plan_to_read: { label: 'Plan to Read',   icon: <Clock        size={14} />, color: 'text-sky-400'    },
  completed:    { label: 'Tamat Dibaca',   icon: <CheckCircle2 size={14} />, color: 'text-blue-400'   },
  on_hold:      { label: 'On Hold',        icon: <PauseCircle  size={14} />, color: 'text-yellow-400' },
  dropped:      { label: 'Dropped',        icon: <XCircle      size={14} />, color: 'text-red-400'    },
};

const btnBase = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed';

export function MangaActions({ mangaId, mangaSlug, firstChapterId }: MangaActionsProps) {
  const { isAuthenticated } = useAuth();
  const [readingStatus, setReadingStatus] = useState<ReadingStatus | null>(null);
  const [isLiked, setIsLiked]             = useState(false);
  const [isPending, startTransition]      = useTransition();
  const [progress, setProgress]           = useState<Progress | null>(null);
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`progress_${mangaSlug}`);
      if (raw) setProgress(JSON.parse(raw) as Progress);
    } catch { /* ignore */ }
  }, [mangaSlug]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [listRes, lk] = await Promise.all([
        fetch('/api/v1/user/reading-list').then(r => r.json()) as Promise<{ data?: { manga: { id: string } | null; status: ReadingStatus }[] }>,
        supabase.from('likes').select('id').eq('user_id', user.id).eq('manga_id', mangaId).maybeSingle(),
      ]);
      const entry = listRes.data?.find(d => d.manga && (d.manga as { id: string }).id === mangaId);
      if (entry) setReadingStatus(entry.status);
      setIsLiked(!!lk.data);
    })();
  }, [isAuthenticated, mangaId, supabase]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setStatus = (status: ReadingStatus | null) => {
    if (!isAuthenticated) return;
    startTransition(async () => {
      if (status === null) {
        await fetch('/api/v1/user/reading-list', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manga_id: mangaId }),
        });
        setReadingStatus(null);
      } else {
        await fetch('/api/v1/user/reading-list', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manga_id: mangaId, status }),
        });
        setReadingStatus(status);
      }
      setDropdownOpen(false);
    });
  };

  const toggleLike = () => {
    if (!isAuthenticated) return;
    startTransition(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (isLiked) {
        await supabase.from('likes').delete().match({ user_id: user.id, manga_id: mangaId });
        setIsLiked(false);
      } else {
        await supabase.from('likes').insert({ user_id: user.id, manga_id: mangaId });
        setIsLiked(true);
      }
    });
  };

  const chNum = progress
    ? (progress.chapterNumber % 1 === 0 ? progress.chapterNumber : progress.chapterNumber.toFixed(1))
    : null;
  const activeStatus = readingStatus ? STATUS_CONFIG[readingStatus] : null;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">

      {/* Primary CTA */}
      {progress ? (
        <>
          <Link href={`/manga/${mangaSlug}/chapter/${progress.chapterId}`}
            className={cn(btnBase, 'flex-1 h-11 px-4 text-sm bg-[var(--color-primary)] text-white hover:opacity-90 shadow-sm min-w-0')}>
            <PlayCircle size={17} className="shrink-0" />
            <span className="truncate">Lanjut Ch.{chNum}</span>
          </Link>
          {firstChapterId && firstChapterId !== progress.chapterId && (
            <Link href={`/manga/${mangaSlug}/chapter/${firstChapterId}`} title="Mulai dari awal"
              className={cn(btnBase, 'shrink-0 h-11 w-11 bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)] hover:bg-[var(--bg-tertiary)]')}>
              <RotateCcw size={16} />
            </Link>
          )}
        </>
      ) : firstChapterId ? (
        <Link href={`/manga/${mangaSlug}/chapter/${firstChapterId}`}
          className={cn(btnBase, 'flex-1 h-11 px-4 text-sm bg-[var(--color-primary)] text-white hover:opacity-90 shadow-sm min-w-0')}>
          <BookOpen size={17} className="shrink-0" />
          <span className="truncate">Mulai Baca</span>
        </Link>
      ) : (
        <button disabled className={cn(btnBase, 'flex-1 h-11 px-4 text-sm bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed opacity-60 min-w-0')}>
          <BookOpen size={17} className="shrink-0" />
          <span className="truncate hidden sm:inline">Belum Ada Chapter</span>
        </button>
      )}

      {/* Reading List Dropdown */}
      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          onClick={() => isAuthenticated && setDropdownOpen(o => !o)}
          disabled={isPending}
          title={isAuthenticated ? 'Daftar Baca' : 'Login untuk menambah daftar baca'}
          className={cn(
            btnBase, 'h-11 px-3 sm:px-4 text-sm gap-1.5',
            readingStatus
              ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/25'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)] hover:bg-[var(--bg-tertiary)]',
            !isAuthenticated && 'opacity-50'
          )}
        >
          {activeStatus ? (
            <><span className={cn(activeStatus.color, 'shrink-0')}>{activeStatus.icon}</span>
              <span className="hidden sm:inline text-xs font-semibold max-w-[90px] truncate">{activeStatus.label}</span></>
          ) : (
            <><BookMarked size={16} className="shrink-0" />
              <span className="hidden sm:inline text-xs font-semibold">Daftar Baca</span></>
          )}
          <ChevronDown size={13} className={cn('shrink-0 transition-transform', dropdownOpen && 'rotate-180')} />
        </button>

        {dropdownOpen && isAuthenticated && (
          <div className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl shadow-2xl z-50 overflow-hidden py-1"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
            {(Object.entries(STATUS_CONFIG) as [ReadingStatus, typeof STATUS_CONFIG[ReadingStatus]][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setStatus(key)}
                className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]',
                  readingStatus === key ? 'font-semibold bg-[var(--color-primary)]/10' : 'font-medium')}
                style={{ color: 'var(--text-primary)' }}>
                <span className={cfg.color}>{cfg.icon}</span>
                {cfg.label}
                {readingStatus === key && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)]">✓</span>
                )}
              </button>
            ))}
            {readingStatus && (
              <>
                <div className="my-1 border-t" style={{ borderColor: 'var(--border-light)' }} />
                <button onClick={() => setStatus(null)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors">
                  <XCircle size={14} /> Hapus dari Daftar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Like */}
      <button onClick={toggleLike} disabled={!isAuthenticated || isPending}
        title={isAuthenticated ? (isLiked ? 'Batal suka' : 'Suka') : 'Login untuk suka'}
        className={cn(btnBase, 'shrink-0 h-11 w-11 sm:w-auto sm:px-4 text-sm',
          isLiked ? 'bg-pink-500/15 text-pink-500 border border-pink-500/40 hover:bg-pink-500/25'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)] hover:bg-[var(--bg-tertiary)]',
          !isAuthenticated && 'opacity-50')}>
        <Heart size={17} fill={isLiked ? 'currentColor' : 'none'} />
        <span className="hidden sm:inline">{isLiked ? 'Disukai' : 'Suka'}</span>
      </button>

      {!isAuthenticated && (
        <Link href="/login"
          className={cn(btnBase, 'shrink-0 h-11 px-3 text-sm bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]')}>
          <Plus size={16} />
          <span className="hidden sm:inline">Login</span>
        </Link>
      )}
    </div>
  );
}

