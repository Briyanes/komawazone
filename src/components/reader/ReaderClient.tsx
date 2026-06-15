'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import MangaImage from '@/components/ui/MangaImage';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronLeft, ChevronRight, List, Home, ChevronDown,
  Settings, LayoutList, BookOpen, AlignJustify, Maximize2, AlignCenter,
  ArrowLeftRight, X, Sun, Contrast, Expand, Shrink, Search, ImageOff,
  Check, Moon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ChapterEngagement } from './ChapterEngagement';
import { useReadingProgress } from '@/hooks/useReadingProgress';

interface ChapterImage {
  id: string;
  number: number;
  image_url: string;
  width: number;
  height: number;
}

interface ChapterListItem {
  id: string;
  number: number;
  title: string | null;
}

interface ReaderClientProps {
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string;
  images: ChapterImage[];
  mangaId: string;
  mangaSlug: string;
  mangaTitle: string;
  mangaCover?: string | null;
  prevChapterId?: string;
  nextChapterId?: string;
  chapterList?: ChapterListItem[];
}

type ReadMode  = 'webtoon' | 'paged';
type FitMode   = 'full' | 'centered';
type Direction = 'ltr' | 'rtl';

const STORAGE_KEY = 'reader_prefs';
const AUTO_HIDE_MS = 7000;

function loadPrefs() {
  if (typeof window === 'undefined')
    return { readMode: 'webtoon' as ReadMode, fitMode: 'centered' as FitMode, direction: 'ltr' as Direction, brightness: 100, contrast: 100, darkOverlay: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { readMode: 'webtoon' as ReadMode, fitMode: 'centered' as FitMode, direction: 'ltr' as Direction, brightness: 100, contrast: 100, darkOverlay: 0, ...JSON.parse(raw) as object };
  } catch { /* ignore */ }
  return { readMode: 'webtoon' as ReadMode, fitMode: 'centered' as FitMode, direction: 'ltr' as Direction, brightness: 100, contrast: 100, darkOverlay: 0 };
}

export function ReaderClient({
  chapterId,
  chapterNumber,
  chapterTitle,
  images,
  mangaId,
  mangaSlug,
  mangaTitle,
  mangaCover,
  prevChapterId,
  nextChapterId,
  chapterList = [],
}: ReaderClientProps) {
  const router = useRouter();
  const [showControls, setShowControls]     = useState(true);
  const [currentPage, setCurrentPage]       = useState(1);
  const [showChapterList, setShowChapterList] = useState(false);
  const [showSettings, setShowSettings]     = useState(false);
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [chapterQuery, setChapterQuery] = useState('');
  const [chapterSort, setChapterSort] = useState<'newest' | 'oldest'>('newest');
  const [readChapters, setReadChapters]     = useState<Set<string>>(new Set());
  const [pageInputMode, setPageInputMode]   = useState(false);
  const [pageInputVal, setPageInputVal]     = useState('');
  const [autoAdvance, setAutoAdvance]       = useState<number | null>(null);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);


  // Touch swipe tracking
  const touchStartX = useRef<number | null>(null);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Reading preferences
  const [readMode,   setReadMode]   = useState<ReadMode>('webtoon');
  const [fitMode,    setFitMode]    = useState<FitMode>('centered');
  const [direction,  setDirection]  = useState<Direction>('ltr');
  const [brightness, setBrightness] = useState(100);
  const [contrast,   setContrast]   = useState(100);
  const [darkOverlay, setDarkOverlay] = useState(0);

  useEffect(() => {
    const p = loadPrefs();
    setReadMode(p.readMode);
    setFitMode(p.fitMode);
    setDirection(p.direction);
    setBrightness(p.brightness);
    setContrast(p.contrast);
    setDarkOverlay((p as { darkOverlay?: number }).darkOverlay ?? 0);
  }, []);

  const { debouncedSave } = useReadingProgress();

  // Save progress to localStorage + track view
  useEffect(() => {
    try {
      localStorage.setItem(`progress_${mangaSlug}`, JSON.stringify({ chapterId, chapterNumber }));
      // Track read chapters
      const key = `read_chapters_${mangaSlug}`;
      const existing: string[] = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
      if (!existing.includes(chapterId)) {
        localStorage.setItem(key, JSON.stringify([...existing, chapterId]));
      }
      // Save reading history (per manga, updated on each chapter)
      const HISTORY_KEY = 'manga_history';
      type HistoryEntry = { mangaSlug: string; mangaTitle: string; mangaCover: string | null; chapterId: string; chapterNumber: number; readAt: number };
      const hist: HistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[];
      const filtered = hist.filter(h => h.mangaSlug !== mangaSlug);
      filtered.unshift({ mangaSlug, mangaTitle, mangaCover: mangaCover ?? null, chapterId, chapterNumber, readAt: Date.now() });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 100))); // cap at 100 entries
    } catch { /* ignore */ }

    // Increment views (fire-and-forget, once per chapter load)
    fetch(`/api/v1/chapters/${chapterId}/view`, { method: 'POST' }).catch(() => {});
  }, [chapterId, chapterNumber, mangaSlug, mangaTitle]);

  const savePrefs = useCallback((next: Partial<{ readMode: ReadMode; fitMode: FitMode; direction: Direction; brightness: number; contrast: number; darkOverlay: number }>) => {
    const current = loadPrefs();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...next }));
  }, []);

  const setMode = (m: ReadMode)   => { setReadMode(m);   savePrefs({ readMode: m }); };
  const setFit  = (f: FitMode)    => { setFitMode(f);    savePrefs({ fitMode: f }); };
  const setDir  = (d: Direction)  => { setDirection(d);  savePrefs({ direction: d }); };

  const resetTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    resetTimer();
    return () => clearTimeout(controlsTimer.current);
  }, [resetTimer]);

  // Load read chapters from localStorage for markers
  useEffect(() => {
    try {
      const key = `read_chapters_${mangaSlug}`;
      const list: string[] = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
      setReadChapters(new Set(list));
    } catch { /* ignore */ }
  }, [mangaSlug]);

  // Track scroll progress (must be declared before auto-advance effect below)
  const [scrollProgress, setScrollProgress] = useState(0);

  // Persist reading progress to DB (debounced 2s) — placed after scrollProgress declaration
  useEffect(() => {
    debouncedSave({
      mangaId,
      chapterId,
      pageNumber: currentPage,
      readPercentage: Math.round(scrollProgress),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, scrollProgress]);

  // Auto-advance to next chapter in webtoon mode when near 100%
  useEffect(() => {
    if (readMode !== 'webtoon' || !nextChapterId) return;
    if (scrollProgress >= 98) {
      if (autoAdvance === null) setAutoAdvance(5);
    } else {
      // Reset if user scrolls back up
      if (autoAdvance !== null) {
        clearTimeout(autoAdvanceTimer.current);
        setAutoAdvance(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollProgress, readMode, nextChapterId]);

  useEffect(() => {
    if (autoAdvance === null) return;
    if (autoAdvance === 0) {
      router.push(`/manga/${mangaSlug}/chapter/${nextChapterId!}`);
      return;
    }
    autoAdvanceTimer.current = setTimeout(() => setAutoAdvance(n => (n ?? 1) - 1), 1000);
    return () => clearTimeout(autoAdvanceTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance]);


  useEffect(() => {
    if (readMode !== 'webtoon') return;
    const onScroll = () => {
      const scrollTop  = window.scrollY;
      const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
      setScrollProgress(pct);

      // Also update currentPage via IntersectionObserver-like logic using element positions
      const els = document.querySelectorAll<HTMLElement>('[data-page]');
      let found = 0;
      const midY = window.scrollY + window.innerHeight / 2;
      els.forEach(el => {
        const top = el.offsetTop;
        if (top <= midY) found = Number(el.dataset.page) || found;
      });
      if (found) setCurrentPage(found);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Run once in case already scrolled
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [images, readMode]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showChapterList && !showSettings) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-dropdown]')) {
        setShowChapterList(false);
        setShowSettings(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showChapterList, showSettings]);

  // Keyboard navigation (paged mode) + J/K/N/P shortcuts (#8)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (readMode === 'paged') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          setCurrentPage(p => Math.min(p + 1, images.length));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          setCurrentPage(p => Math.max(p - 1, 1));
        }
      }
      // J = scroll down (webtoon), K = scroll up (webtoon)
      if (e.key === 'j' || e.key === 'J') {
        window.scrollBy({ top: 300, behavior: 'smooth' });
      } else if (e.key === 'k' || e.key === 'K') {
        window.scrollBy({ top: -300, behavior: 'smooth' });
      }
      // N = next chapter, P = previous chapter
      if (e.key === 'n' || e.key === 'N') {
        if (nextChapterId) router.push(`/manga/${mangaSlug}/chapter/${nextChapterId}`);
      } else if (e.key === 'p' || e.key === 'P') {
        if (prevChapterId) router.push(`/manga/${mangaSlug}/chapter/${prevChapterId}`);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [readMode, images.length, nextChapterId, prevChapterId, mangaSlug, router]);

  const sorted      = images.slice().sort((a, b) => a.number - b.number);
  const pagedImages = direction === 'rtl' ? [...sorted].reverse() : sorted;
  const currentImage = pagedImages[currentPage - 1];
  const progress    = readMode === 'webtoon'
    ? scrollProgress
    : (images.length > 0 ? Math.min((currentPage / images.length) * 100, 100) : 0);
  const imageFilter = `brightness(${brightness}%) contrast(${contrast}%)`;

  const handleChapterChange = (id: string) => {
    setShowChapterList(false);
    window.scrollTo({ top: 0 });
    router.push(`/manga/${mangaSlug}/chapter/${id}`);
  };

  const visibleChapterList = useMemo(() => {
    const ordered = [...chapterList].sort((a, b) => {
      if (chapterSort === 'newest') return b.number - a.number;
      return a.number - b.number;
    });

    const q = chapterQuery.trim().toLowerCase();
    if (!q) return ordered;

    return ordered.filter((ch) => {
      const numberText = String(ch.number);
      const titleText = (ch.title ?? '').toLowerCase();
      return numberText.includes(q) || titleText.includes(q);
    });
  }, [chapterList, chapterQuery, chapterSort]);

  const goNext = useCallback(() => {
    if (currentPage <= images.length) setCurrentPage(p => p + 1);
    else if (nextChapterId) router.push(`/manga/${mangaSlug}/chapter/${nextChapterId}`);
  }, [currentPage, images.length, nextChapterId, mangaSlug, router]);

  // Feature #6: Preload next chapter when user is near end (last 20% of pages)
  useEffect(() => {
    if (!nextChapterId) return;
    const threshold = Math.max(1, Math.floor(images.length * 0.8));
    if (currentPage < threshold) return;
    // Prefetch the next chapter page via router prefetch
    router.prefetch(`/manga/${mangaSlug}/chapter/${nextChapterId}`);
  }, [currentPage, images.length, nextChapterId, mangaSlug, router]);

  const goPrev = useCallback(() => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
    else if (prevChapterId) router.push(`/manga/${mangaSlug}/chapter/${prevChapterId}`);
  }, [currentPage, prevChapterId, mangaSlug, router]);

  // Touch swipe handlers (paged mode)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    resetTimer();
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || readMode !== 'paged') return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta < 0) goNext(); // swipe left = forward
      else goPrev();           // swipe right = back
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="relative min-h-dvh"
      style={{ background: '#0a0a0a' }}
      onClick={readMode === 'paged' ? undefined : resetTimer}
      onTouchStart={readMode === 'paged' ? handleTouchStart : () => resetTimer()}
      onTouchEnd={readMode === 'paged' ? handleTouchEnd : undefined}
    >
      {/* Progress bar */}
      <div className="fixed top-0 inset-x-0 z-[60] h-1" style={{ background: 'rgba(255,255,255,.08)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'var(--color-primary)' }}
        />
      </div>

      {/* Dark overlay (#7) — pointer-events-none so it doesn't block clicks */}
      {darkOverlay > 0 && (
        <div
          className="fixed inset-0 z-[55] pointer-events-none"
          style={{ background: `rgba(0,0,0,${darkOverlay / 100})` }}
        />
      )}

      {/* TOP BAR */}
      <div
        className={cn(
          'fixed top-0 inset-x-0 z-50 transition-all duration-300',
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        )}
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.9) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-2 px-3 py-3">
          <Link
            href={`/manga/${mangaSlug}`}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ArrowLeft size={17} />
          </Link>

          <span className="truncate text-sm font-semibold text-white/90 max-w-[80px] md:max-w-xs">
            {mangaTitle}
          </span>
          <ChevronRight size={13} className="shrink-0 text-white/40" />

          {/* Chapter dropdown */}
          <div className="relative flex-1 min-w-0" data-dropdown onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setShowChapterList(v => !v); setShowSettings(false); }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold hover:bg-white/10 max-w-full"
              style={{ background: 'rgba(255,107,53,0.2)', color: 'var(--color-primary)' }}
            >
              <span className="truncate">Ch {chapterNumber % 1 === 0 ? chapterNumber : chapterNumber.toFixed(1)}{chapterTitle ? ` — ${chapterTitle}` : ''}</span>
              <ChevronDown size={12} className="shrink-0" />
            </button>

            {showChapterList && chapterList.length > 0 && (
              <div
                className={[
                  'overflow-y-auto rounded-xl shadow-2xl',
                  // Mobile: fixed full-width under top bar
                  'fixed left-3 right-3 top-[56px]',
                  // Desktop: absolute dropdown anchored to button
                  'sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-1 sm:w-72',
                ].join(' ')}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid rgba(255,255,255,.1)',
                  maxHeight: 360,
                  zIndex: 100,
                }}
              >
                <div className="sticky top-0 z-10 space-y-2 border-b p-2" style={{ background: '#1a1a1a', borderColor: 'rgba(255,255,255,.1)' }}>
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/45" />
                    <input
                      value={chapterQuery}
                      onChange={(e) => setChapterQuery(e.target.value)}
                      placeholder="Cari chapter, contoh 10"
                      className="w-full rounded-lg py-1.5 pl-7 pr-7 text-xs outline-none"
                      style={{ background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)' }}
                    />
                    {chapterQuery && (
                      <button
                        onClick={() => setChapterQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                        aria-label="Hapus pencarian chapter"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={chapterSort}
                      onChange={(e) => setChapterSort(e.target.value as 'newest' | 'oldest')}
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{ background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)' }}
                    >
                      <option value="newest">Upload terbaru</option>
                      <option value="oldest">Upload pertama</option>
                    </select>


                  </div>
                </div>

                {visibleChapterList.map(ch => {
                  const isRead = readChapters.has(ch.id);
                  const isCurrent = ch.id === chapterId;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => handleChapterChange(ch.id)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
                      style={{
                        color: isCurrent ? 'var(--color-primary)' : isRead ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)',
                        fontWeight: isCurrent ? 700 : 400,
                        background: isCurrent ? 'rgba(255,107,53,0.1)' : 'transparent',
                      }}
                    >
                      <span className="w-14 shrink-0 text-xs" style={{ opacity: isCurrent ? 1 : 0.6 }}>Ch {ch.number % 1 === 0 ? ch.number : ch.number.toFixed(1)}</span>
                      <span className="flex-1 truncate text-xs">{ch.title ?? `Chapter ${ch.number}`}</span>
                      {isRead && !isCurrent && (
                        <Check size={10} className="shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                      )}
                    </button>
                  );
                })}

                {visibleChapterList.length === 0 && (
                  <div className="px-3 py-5 text-center text-xs text-white/55">Chapter tidak ditemukan</div>
                )}

              </div>
            )}
          </div>

          {/* Settings */}
          <div className="relative" data-dropdown onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setShowSettings(v => !v); setShowChapterList(false); resetTimer(); }}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              {showSettings ? <X size={15} /> : <Settings size={15} />}
            </button>

            {showSettings && (
              <>
                {/* Mobile: full-screen overlay */}
                <div className="fixed inset-0 z-[70] sm:hidden" onClick={() => setShowSettings(false)} />
                <div
                  className={cn(
                    'z-[80] rounded-2xl p-5 shadow-2xl space-y-5',
                    // Mobile: fixed bottom sheet; Desktop: absolute dropdown
                    'fixed bottom-0 inset-x-0 sm:absolute sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-72 sm:inset-x-auto',
                    'rounded-b-none sm:rounded-2xl'
                  )}
                  style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,.12)' }}
                >
                  {/* Drag handle (mobile only) */}
                  <div className="flex justify-center -mt-1 mb-1 sm:hidden">
                    <div className="h-1 w-10 rounded-full bg-white/20" />
                  </div>

                  {/* Read mode */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Mode Baca</p>
                    <div className="flex gap-2">
                      <ModeBtn active={readMode === 'webtoon'} onClick={() => setMode('webtoon')} icon={<LayoutList size={14} />} label="Webtoon" />
                      <ModeBtn active={readMode === 'paged'}   onClick={() => setMode('paged')}   icon={<BookOpen size={14} />}   label="Per Halaman" />
                    </div>
                  </div>

                  {/* Fit mode */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Lebar Halaman</p>
                    <div className="flex gap-2">
                      <ModeBtn active={fitMode === 'full'}     onClick={() => setFit('full')}     icon={<Maximize2 size={14} />}    label="Penuh" />
                      <ModeBtn active={fitMode === 'centered'} onClick={() => setFit('centered')} icon={<AlignJustify size={14} />} label="Tengah" />
                    </div>
                  </div>

                  {/* Direction (paged only) */}
                  {readMode === 'paged' && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Arah Baca</p>
                      <div className="flex gap-2">
                        <ModeBtn active={direction === 'ltr'} onClick={() => setDir('ltr')} icon={<AlignCenter size={14} />} label="Kiri ke Kanan" />
                        <ModeBtn active={direction === 'rtl'} onClick={() => setDir('rtl')} icon={<ArrowLeftRight size={14} />} label="Kanan ke Kiri" />
                      </div>
                    </div>
                  )}

                  {/* Brightness */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                        <Sun size={11} /> Kecerahan
                      </p>
                      <span className="text-[10px] text-white/40">{brightness}%</span>
                    </div>
                    <input
                      type="range" min={40} max={160} value={brightness}
                      onChange={e => { const v = Number(e.target.value); setBrightness(v); savePrefs({ brightness: v }); }}
                      className="w-full accent-[var(--color-primary)] h-1"
                    />
                  </div>

                  {/* Contrast */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                        <Contrast size={11} /> Kontras
                      </p>
                      <span className="text-[10px] text-white/40">{contrast}%</span>
                    </div>
                    <input
                      type="range" min={60} max={160} value={contrast}
                      onChange={e => { const v = Number(e.target.value); setContrast(v); savePrefs({ contrast: v }); }}
                      className="w-full accent-[var(--color-primary)] h-1"
                    />
                  </div>

                  {/* Dark Overlay (#7) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                        <Moon size={10} /> Overlay Gelap
                      </p>
                      <span className="text-[10px] text-white/40">{darkOverlay}%</span>
                    </div>
                    <input
                      type="range" min={0} max={80} value={darkOverlay}
                      onChange={e => { const v = Number(e.target.value); setDarkOverlay(v); savePrefs({ darkOverlay: v }); }}
                      className="w-full accent-[var(--color-primary)] h-1"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <Link href="/" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <Home size={15} />
          </Link>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Shrink size={15} /> : <Expand size={15} />}
          </button>
        </div>
      </div>

      {/* WEBTOON MODE */}
      {readMode === 'webtoon' && (
        <div className="flex flex-col items-center pt-[74px] md:pt-12">
          {/* Auto-advance banner */}
          {autoAdvance !== null && nextChapterId && (
            <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl px-4 py-2.5 shadow-2xl"
              style={{ background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,107,53,0.4)', whiteSpace: 'nowrap' }}>
              <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Chapter berikutnya dalam <span style={{ color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>{autoAdvance}s</span>
              </span>
              <button
                onClick={() => { clearTimeout(autoAdvanceTimer.current); setAutoAdvance(null); }}
                className="rounded-lg px-2.5 py-1 text-xs font-bold hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
              >Batal</button>
            </div>
          )}

          {/* Floating page counter */}
          <div className="fixed bottom-16 left-1/2 z-40 -translate-x-1/2">
            <span className="rounded-full px-3 py-1 text-xs font-semibold tabular-nums"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.65)' }}>
              {currentPage} / {images.length}
            </span>
          </div>

          {sorted.map((img) => (
            <div
              key={img.id}
              data-page={img.number}
              className="w-full"
              style={{ maxWidth: fitMode === 'full' ? '100%' : 800 }}
            >
              <ImageCard
                src={img.image_url}
                alt={`Page ${img.number}`}
                width={img.width || 800}
                height={img.height || 1200}
                filter={imageFilter}
                loading={img.number <= 3 ? 'eager' : 'lazy'}
                priority={img.number === 1}
              />
            </div>
          ))}

          {/* End of chapter */}
          <div className="flex w-full max-w-lg flex-col items-center gap-3 px-4 pb-32 pt-6 text-center">
            <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
 Akhir Chapter {chapterNumber}               
            </p>
            {/* Row 1: Sebelumnya & Berikutnya */}
            <div className="flex w-full gap-2">
              {prevChapterId ? (
                <Link href={`/manga/${mangaSlug}/chapter/${prevChapterId}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold text-white hover:opacity-80"
                  style={{ background: 'rgba(255,255,255,.1)' }}>
                  <ChevronLeft size={16} />Sebelumnya
                </Link>
              ) : <div className="flex-1" />}
              {nextChapterId ? (
                <Link href={`/manga/${mangaSlug}/chapter/${nextChapterId}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-bold text-white hover:opacity-80"
                  style={{ background: 'var(--color-primary)' }}>
                  Berikutnya<ChevronRight size={16} />
                </Link>
              ) : <div className="flex-1" />}
            </div>
            {/* Row 2: Daftar Chapter (full width) */}
            <Link href={`/manga/${mangaSlug}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold text-white hover:opacity-80"
              style={{ background: 'rgba(255,255,255,.07)' }}>
              <List size={16} />Daftar Chapter
            </Link>
          </div>

          <ChapterEngagement chapterId={chapterId} />
        </div>
      )}

      {/* PAGED MODE */}
      {readMode === 'paged' && (
        <div className="flex min-h-dvh flex-col">
          {currentPage > images.length ? (
            /* ── End card ── */
            <div
              className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center"
              style={{ minHeight: 'calc(100dvh - 60px)' }}
            >
              <div
                className="flex size-16 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,107,53,0.15)' }}
              >
                <BookOpen size={28} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <p className="text-lg font-bold text-white">Selesai!</p>
                <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Chapter {chapterNumber} sudah habis dibaca.
                </p>
              </div>
              <div className="flex w-full gap-2">
                {prevChapterId ? (
                  <Link
                    href={`/manga/${mangaSlug}/chapter/${prevChapterId}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold text-white hover:opacity-80"
                    style={{ background: 'rgba(255,255,255,.1)' }}
                  >
                    <ChevronLeft size={16} />Sebelumnya
                  </Link>
                ) : <div className="flex-1" />}
                {nextChapterId ? (
                  <Link
                    href={`/manga/${mangaSlug}/chapter/${nextChapterId}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-bold text-white hover:opacity-80"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    Berikutnya<ChevronRight size={16} />
                  </Link>
                ) : <div className="flex-1" />}
              </div>
              <Link
                href={`/manga/${mangaSlug}`}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold text-white hover:opacity-80"
                style={{ background: 'rgba(255,255,255,.07)' }}
              >
                <List size={16} />Daftar Chapter
              </Link>
              <ChapterEngagement chapterId={chapterId} />
            </div>
          ) : currentImage && (
            <>
              {/* Image area */}
              <div className="relative flex flex-1 items-center justify-center pt-[74px] md:pt-12" style={{ minHeight: 'calc(100dvh - 80px)' }}>
                <div
                  className="relative select-none"
                  style={{ maxWidth: fitMode === 'full' ? '100%' : 800, width: '100%' }}
                >
                  <ImageCard
                    src={currentImage.image_url}
                    alt={`Page ${currentImage.number}`}
                    width={currentImage.width || 800}
                    height={currentImage.height || 1200}
                    filter={imageFilter}
                    priority
                  />
                  {/* Left tap zone */}
                  <button className="absolute left-0 top-0 z-10 h-full w-1/3 opacity-0" onClick={() => { goPrev(); resetTimer(); }} aria-label="Previous page" />
                  {/* Right tap zone */}
                  <button className="absolute right-0 top-0 z-10 h-full w-1/3 opacity-0" onClick={() => { goNext(); resetTimer(); }} aria-label="Next page" />
                  {/* Center tap — toggle controls */}
                  <button className="absolute inset-x-1/3 top-0 z-10 h-full opacity-0" onClick={() => { setShowControls(v => !v); }} aria-label="Toggle controls" />
                </div>
              </div>

              {/* Page indicator — tap to jump */}
              <div className="fixed bottom-16 inset-x-0 flex justify-center z-40">
                {pageInputMode ? (
                  <form onSubmit={e => {
                    e.preventDefault();
                    const n = parseInt(pageInputVal, 10);
                    if (!isNaN(n) && n >= 1 && n <= images.length) setCurrentPage(n);
                    setPageInputMode(false);
                  }}>
                    <input
                      autoFocus
                      type="number" min={1} max={images.length}
                      value={pageInputVal}
                      onChange={e => setPageInputVal(e.target.value)}
                      onBlur={() => setPageInputMode(false)}
                      className="w-24 rounded-full text-center text-sm font-bold tabular-nums outline-none"
                      style={{ background: 'rgba(0,0,0,0.85)', color: 'var(--color-primary)', border: '1px solid rgba(255,107,53,0.5)', padding: '4px 12px' }}
                    />
                  </form>
                ) : (
                  <button
                    onClick={() => { setPageInputVal(String(currentPage)); setPageInputMode(true); }}
                    className="rounded-full px-4 py-1.5 text-sm font-semibold tabular-nums hover:opacity-80"
                    style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.8)' }}
                  >
                    {currentPage} / {images.length}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div
        className="fixed bottom-0 inset-x-0 z-50 flex items-center gap-3 px-4 py-3"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,.85) 0%, transparent 100%)' }}
      >
        {readMode === 'paged' ? (
          <>
            <button
              onClick={() => { (direction === 'rtl' ? goNext : goPrev)(); resetTimer(); }}
              disabled={direction === 'rtl' ? (currentPage > images.length && !nextChapterId) : (currentPage === 1 && !prevChapterId)}
              className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-30 hover:opacity-80"
              style={{ background: 'rgba(255,255,255,.12)' }}
            >
              <ChevronLeft size={16} /> {direction === 'rtl' ? 'Berikutnya' : 'Sebelumnya'}
            </button>

            {/* Page slider */}
            <input
              type="range"
              min={1} max={images.length} value={Math.min(currentPage, images.length)}
              onChange={e => setCurrentPage(Number(e.target.value))}
              className="flex-1 accent-[var(--color-primary)] h-1"
              aria-label="Page slider"
            />

            <button
              onClick={() => { (direction === 'rtl' ? goPrev : goNext)(); resetTimer(); }}
              disabled={direction === 'rtl' ? (currentPage === 1 && !prevChapterId) : (currentPage > images.length && !nextChapterId)}
              className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-30 hover:opacity-80"
              style={{ background: 'var(--color-primary)' }}
            >
              {direction === 'rtl' ? 'Sebelumnya' : 'Berikutnya'} <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <>
            {prevChapterId ? (
              <Link href={`/manga/${mangaSlug}/chapter/${prevChapterId}`}
                className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold text-white hover:opacity-80"
                style={{ background: 'rgba(255,255,255,.12)' }}>
                <ChevronLeft size={16} /> Sebelumnya
              </Link>
            ) : <div />}
            <div className="flex-1" />
            {nextChapterId ? (
              <Link href={`/manga/${mangaSlug}/chapter/${nextChapterId}`}
                className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold text-white hover:opacity-80"
                style={{ background: 'var(--color-primary)' }}>
                Berikutnya <ChevronRight size={16} />
              </Link>
            ) : (
              <Link href={`/manga/${mangaSlug}`}
                className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold text-white hover:opacity-80"
                style={{ background: 'rgba(255,255,255,.12)' }}>
                <List size={16} /> Daftar Chapter
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ImageCard({
  src, alt, width, height, filter, priority, loading,
}: {
  src: string; alt: string; width: number; height: number;
  filter: string; priority?: boolean; loading?: 'eager' | 'lazy';
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => { setStatus('loading'); }, [src]);
  const ar = width > 0 && height > 0 ? `${width} / ${height}` : '2 / 3';
  return (
    <div className="relative w-full" style={{ aspectRatio: ar }}>
      {status === 'loading' && (
        <div className="absolute inset-0 animate-pulse" style={{ background: '#1c1c1c' }} />
      )}
      {status === 'error' ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ background: '#111' }}
        >
          <ImageOff size={28} style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Gambar gagal dimuat</p>
          <button
            onClick={() => { setStatus('loading'); setRetryKey(k => k + 1); }}
            className="mt-1 rounded-lg px-3 py-1 text-xs font-semibold"
            style={{ background: 'rgba(255,107,53,0.2)', color: 'var(--color-primary)' }}
          >
            Coba lagi
          </button>
        </div>
      ) : (
        <MangaImage
          key={retryKey}
          src={src}
          alt={alt}
          width={width || 800}
          height={height || 1200}
          className="w-full"
          style={{ filter, display: 'block', opacity: status === 'loaded' ? 1 : 0, transition: 'opacity 0.15s' }}
          loading={loading}
          priority={priority}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors"
      style={{
        background: active ? 'var(--color-primary)' : 'rgba(255,255,255,.08)',
        color: active ? '#fff' : 'rgba(255,255,255,0.6)',
      }}
    >
      {icon} {label}
    </button>
  );
}
