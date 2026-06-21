'use client';

import { useState, useTransition, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X, Star, Lock, Crown } from 'lucide-react';
import { MangaGrid } from '@/components/manga/MangaGrid';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/client';
import type { MangaStatus, MangaFilters } from '@/types';

const STATUS_OPTIONS: { value: MangaStatus; label: string }[] = [
  { value: 'ONGOING',   label: 'Terbit'    },
  { value: 'COMPLETED', label: 'Tamat'     },
  { value: 'HIATUS',    label: 'Hiatus'    },
  { value: 'DROPPED',   label: 'Berhenti'  },
];

const SORT_OPTIONS = [
  { value: 'latest',  label: 'Terbaru' },
  { value: 'popular', label: 'Populer' },
  { value: 'rating',  label: 'Rating'  },
  { value: 'title',   label: 'A-Z'     },
] as const;

const TYPE_OPTIONS = ['Manga', 'Manhwa', 'Manhua', 'Webtoon'] as const;
type MangaType = typeof TYPE_OPTIONS[number];

interface Genre { id: string; name: string; slug: string; is_mature?: boolean }

interface SearchResult {
  id: string;
  slug: string;
  title: string;
  cover_url?: string | null;
  status: string;
  rating?: number;
  views?: number;
  updated_at?: string | null;
  content_rating?: 'general' | 'mature';
}

export default function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [isVip, setIsVip] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yearDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query   = searchParams.get('q')      ?? '';
  const status  = (searchParams.get('status') ?? '') as MangaStatus | '';
  const genre   = searchParams.get('genre')  ?? '';
  const sort    = (searchParams.get('sort')  ?? 'latest') as MangaFilters['sortBy'];
  const page    = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const author  = searchParams.get('author') ?? '';
  const type    = (searchParams.get('type')  ?? '') as MangaType | '';
  const year    = searchParams.get('year')   ?? '';

  const [inputValue, setInputValue] = useState(query);
  const [inputAuthor, setInputAuthor] = useState(author);
  const [inputYear, setInputYear] = useState(year);
  const minRating = searchParams.get('min_rating') ?? '';

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetch('/api/v1/admin/genres')
      .then(r => r.json())
      .then((d: { status: string; data: Genre[] }) => { if (d.status === 'success') setGenres(d.data); })
      .catch(() => {});

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('vip_expires_at')
        .eq('id', user.id)
        .single();
      if (data?.vip_expires_at) {
        setIsVip(new Date(data.vip_expires_at) > new Date());
      }
    });
  }, [supabase]);

  const fetchResults = useCallback(() => {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (query)      params.set('q',          query);
      if (status)     params.set('status',      status);
      if (genre)      params.set('genre',       genre);
      if (sort)       params.set('sort',        sort);
      if (author)     params.set('author',      author);
      if (type)       params.set('type',        type);
      if (year)       params.set('year',        year);
      if (minRating)  params.set('min_rating',  minRating);
      params.set('page', String(page));

      try {
        const res = await fetch(`/api/v1/manga?${params}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.data ?? []);
          setTotal(data.meta?.total ?? 0);
        } else {
          setResults([]);
        }
      } catch { /* noop */ }
    });
  }, [query, status, genre, sort, page, author, type, year, minRating]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const updateParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    if (key !== 'page') p.delete('page'); // reset ke halaman 1 saat filter berubah, bukan saat pindah halaman
    if (key === 'page') window.scrollTo({ top: 0, behavior: 'smooth' });
    router.push(`/search?${p}`);
  };

  const handleSearchInput = (value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam('q', value), 400);
  };

  const handleAuthorInput = (value: string) => {
    setInputAuthor(value);
    if (authorDebounceRef.current) clearTimeout(authorDebounceRef.current);
    authorDebounceRef.current = setTimeout(() => updateParam('author', value), 400);
  };

  const handleYearInput = (value: string) => {
    setInputYear(value);
    if (yearDebounceRef.current) clearTimeout(yearDebounceRef.current);
    yearDebounceRef.current = setTimeout(() => updateParam('year', value), 400);
  };

  // Cleanup debounces on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (authorDebounceRef.current) clearTimeout(authorDebounceRef.current);
      if (yearDebounceRef.current) clearTimeout(yearDebounceRef.current);
    };
  }, []);

  // Sync local input states when URL params change (e.g. back/forward)
  useEffect(() => { setInputValue(query); }, [query]);
  useEffect(() => { setInputAuthor(author); }, [author]);
  useEffect(() => { setInputYear(year); }, [year]);

  const activeFilterCount = [status, genre, author, type, year, minRating].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Search bar */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
          style={{ borderColor: 'var(--border-medium)', background: 'var(--bg-secondary)' }}>
          <Search size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Cari manga, manhwa…"
            value={inputValue}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {inputValue && (
            <button onClick={() => { setInputValue(''); updateParam('q', ''); }} aria-label="Hapus">
              <X size={16} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
              showFilters
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            )}
          >
            <SlidersHorizontal size={13} />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="rounded-xl border p-4 space-y-4 animate-fade-in"
            style={{ borderColor: 'var(--border-light)', background: 'var(--bg-secondary)' }}>

            {/* Row 1: Status + Sort */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Status</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip active={!status} onClick={() => updateParam('status', '')}>Semua</FilterChip>
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <FilterChip key={value} active={status === value} onClick={() => updateParam('status', status === value ? '' : value)}>
                      {label}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Tipe</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip active={!type} onClick={() => updateParam('type', '')}>Semua</FilterChip>
                  {TYPE_OPTIONS.map(t => (
                    <FilterChip key={t} active={type === t} onClick={() => updateParam('type', type === t ? '' : t)}>
                      {t}
                    </FilterChip>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Sort + Year + Author */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Urutan</p>
                <div className="flex flex-wrap gap-2">
                  {SORT_OPTIONS.map(({ value, label }) => (
                    <FilterChip key={value} active={sort === value} onClick={() => updateParam('sort', value)}>
                      {label}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Tahun</p>
                <input
                  type="number" min="1900" max={new Date().getFullYear()} placeholder="cth. 2023"
                  value={inputYear} onChange={e => handleYearInput(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Penulis</p>
                <input
                  type="text" placeholder="Nama penulis…"
                  value={inputAuthor} onChange={e => handleAuthorInput(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            {/* Row 3: Rating */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Rating Minimum</p>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5].map(r => (
                  <button key={r} onClick={() => updateParam('min_rating', r === 0 ? '' : String(r))}
                    className={cn(
                      'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border',
                      (r === 0 ? !minRating : minRating === String(r))
                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                        : 'border-[var(--border-medium)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                    )}>
                    {r === 0 ? 'Semua' : <><Star size={11} className="fill-current" />{r}+</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Genre */}
            {genres.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Genre</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip active={!genre} onClick={() => updateParam('genre', '')}>Semua</FilterChip>
                  {genres.map(g => {
                    const locked = !!(g.is_mature && !isVip);
                    return locked ? (
                      <a key={g.id} href="/vip"
                        className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                        style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#f59e0b', background: 'rgba(245,158,11,0.08)' }}
                        title="Butuh VIP untuk akses genre ini">
                        <Lock size={10} />{g.name}<Crown size={10} />
                      </a>
                    ) : (
                      <FilterChip key={g.id} active={genre === g.name} onClick={() => updateParam('genre', genre === g.name ? '' : g.name)}>
                        {g.name}
                      </FilterChip>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Clear all */}
            {activeFilterCount > 0 && (
              <div className="flex justify-end">
                <button onClick={() => {
                  const p = new URLSearchParams();
                  if (query) p.set('q', query);
                  router.push(`/search?${p}`);
                }} className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors">
                  Reset filter
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {isLoading
            ? 'Mencari…'
            : `${total.toLocaleString('id-ID')} hasil${query ? ` untuk "${query}"` : ''}${genre ? ` dalam ${genre}` : ''}`}
        </p>
      </div>

      <MangaGrid items={results} isLoading={isLoading} skeletonCount={20} />

      {/* Pagination */}
      {total > 20 && (() => {
        const totalPages = Math.ceil(total / 20);
        const delta = 2;
        const pages: (number | '...')[] = [];
        for (let i = 1; i <= totalPages; i++) {
          if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
            pages.push(i);
          } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
          }
        }
        return (
          <div className={cn("mt-8 flex flex-wrap justify-center items-center gap-1.5", isLoading && "pointer-events-none opacity-50")}>
            <button
              onClick={() => updateParam('page', String(page - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-30"
              style={{ borderColor: 'var(--border-medium)', color: 'var(--text-primary)' }}>
              ‹ Prev
            </button>
            {pages.map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>…</span>
              ) : (
                <button key={p} onClick={() => updateParam('page', String(p))}
                  className="flex size-9 items-center justify-center rounded-lg text-sm font-semibold transition-colors"
                  style={p === page
                    ? { background: 'var(--color-primary)', color: '#fff' }
                    : { border: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }
                  }>
                  {p}
                </button>
              )
            )}
            <button onClick={() => updateParam('page', String(page + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-30"
              style={{ background: 'var(--color-primary)' }}>
              Next ›
            </button>
          </div>
        );
      })()}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--border-medium)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
      )}>
      {children}
    </button>
  );
}

