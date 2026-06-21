'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, X, Flag, BookOpen, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { DismissReportButton } from '@/components/admin/DismissReportButton';
import { Pagination } from '@/components/ui/admin-table';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 20;

interface ChapterReport {
  id: string;
  reason: string;
  notes: string | null;
  created_at: string;
  chapter: { id: string; number: number; title: string | null; manga: { title: string; slug: string } | null } | null;
  reporter: { username: string | null; email: string } | null;
}

interface MangaReport {
  id: string;
  reason: string;
  notes: string | null;
  status: string;
  created_at: string;
  manga: { id: string; title: string; slug: string } | null;
  reporter: { username: string | null; email: string } | null;
}

type Tab = 'manga' | 'chapter';

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  reviewed: { label: 'Reviewed', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  resolved: { label: 'Resolved', color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
};

export function ReportsClient({
  chapterReports: initialChapter,
  mangaReports: initialManga,
}: {
  chapterReports: ChapterReport[];
  mangaReports: MangaReport[];
}) {
  const [tab, setTab]                   = useState<Tab>('manga');
  const [search, setSearch]             = useState('');
  const [chapterReports, setChapter]    = useState<ChapterReport[]>(initialChapter);
  const [mangaReports, setManga]        = useState<MangaReport[]>(initialManga);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [page, setPage]                 = useState(1);

  const filteredManga = useMemo(() => {
    const q = search.toLowerCase().trim();
    return mangaReports.filter(r => {
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      if (!matchStatus) return false;
      if (!q) return true;
      return (
        (r.manga?.title?.toLowerCase() ?? '').includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        (r.reporter?.username ?? r.reporter?.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [mangaReports, search, statusFilter]);

  const filteredChapter = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return chapterReports;
    return chapterReports.filter(r => {
      return (
        (r.chapter?.manga?.title?.toLowerCase() ?? '').includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        (r.reporter?.username ?? r.reporter?.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [chapterReports, search]);

  const activeFiltered = tab === 'manga' ? filteredManga : filteredChapter;
  const totalPages = Math.ceil(activeFiltered.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, totalPages);

  // BUG FIX: Clamp page state when current page becomes empty (e.g., after dismissing/resolving reports)
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pagedManga = filteredManga.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pagedChapter = filteredChapter.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const updateMangaReportStatus = async (id: string, status: string) => {
    if (updatingId) return;
    setUpdatingId(id);
    const res = await fetch(`/api/v1/admin/manga-reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setUpdatingId(null);
    if (!res.ok) {
      toast.error('Gagal mengupdate status laporan');
      return;
    }
    setManga(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    toast.success(`Laporan ditandai sebagai ${STATUS_BADGE[status]?.label ?? status}`);
  };

  const onDismissChapter = (id: string) => {
    setChapter(prev => prev.filter(r => r.id !== id));
    toast.success('Laporan chapter di-dismiss');
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Flag size={16} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Laporan</h1>
          {totalPages > 1 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              · Hal {currentPage}/{totalPages}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {([['manga', 'Manga', mangaReports.length], ['chapter', 'Chapter', chapterReports.length]] as const).map(([key, label, count]) => (
            <button key={key} onClick={() => { setTab(key); setPage(1); }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: tab === key ? 'var(--color-primary)' : 'var(--bg-tertiary)',
                color: tab === key ? '#fff' : 'var(--text-secondary)',
              }}>
              {label}
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: tab === key ? 'rgba(255,255,255,0.2)' : 'var(--bg-secondary)' }}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {tab === 'manga' && (
          <div className="flex gap-1">
            {(['all', 'pending', 'reviewed', 'resolved'] as const).map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: statusFilter === s ? 'var(--bg-tertiary)' : 'transparent',
                  color: statusFilter === s ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-light)',
                }}>
                {s === 'all' ? 'Semua' : STATUS_BADGE[s]?.label ?? s}
              </button>
            ))}
          </div>
        )}

        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Cari manga, alasan, pelapor…"
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Manga Reports */}
      {tab === 'manga' && (
        activeFiltered.length === 0 ? (
          <EmptyState hasData={mangaReports.length > 0} />
        ) : (
          <>
            <div className="rounded-xl overflow-hidden border divide-y"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
              {pagedManga.map(r => {
                const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending;
                return (
                  <div key={r.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'rgba(239,68,68,0.12)' }}>
                      <BookOpen size={14} className="text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                        <a href={`/manga/${r.manga?.slug}`} target="_blank" rel="noreferrer"
                          className="text-sm font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
                          {r.manga?.title ?? 'Unknown'}
                        </a>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          by {r.reporter?.username ?? r.reporter?.email ?? 'anonymous'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          · {new Date(r.created_at).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-1">
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                          {r.reason}
                        </span>
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                      {r.notes && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{r.notes}</p>}
                    </div>
                    {/* Status actions */}
                    <div className="flex gap-1 shrink-0">
                      {r.status === 'pending' && (
                        <button onClick={() => updateMangaReportStatus(r.id, 'reviewed')} disabled={updatingId === r.id}
                          title="Tandai sudah ditinjau"
                          className={cn('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                            updatingId === r.id ? 'opacity-50' : 'hover:bg-[var(--bg-tertiary)]')}
                          style={{ color: '#60a5fa' }}>
                          <Clock size={12} /> {updatingId === r.id ? '…' : 'Reviewed'}
                        </button>
                      )}
                      {r.status !== 'resolved' && (
                        <button onClick={() => updateMangaReportStatus(r.id, 'resolved')} disabled={updatingId === r.id}
                          title="Tandai selesai"
                          className={cn('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                            updatingId === r.id ? 'opacity-50' : 'hover:bg-[var(--bg-tertiary)]')}
                          style={{ color: '#4ade80' }}>
                          <CheckCircle2 size={12} /> {updatingId === r.id ? '…' : 'Resolved'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} total={activeFiltered.length} pageSize={PAGE_SIZE} />
            )}
          </>
        )
      )}

      {/* Chapter Reports */}
      {tab === 'chapter' && (
        activeFiltered.length === 0 ? (
          <EmptyState hasData={chapterReports.length > 0} />
        ) : (
          <>
            <div className="rounded-xl overflow-hidden border divide-y"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
              {pagedChapter.map(r => {
                const manga = r.chapter?.manga;
                const slug = manga?.slug ?? '';
                const chapterId = r.chapter?.id ?? '';
                return (
                  <div key={r.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'rgba(239,68,68,0.12)' }}>
                      <Flag size={14} className="text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                        <a href={`/manga/${slug}/chapter/${chapterId}`} target="_blank" rel="noreferrer"
                          className="text-sm font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
                          {manga?.title ?? 'Unknown'} — Ch. {r.chapter?.number}
                          {r.chapter?.title ? ` (${r.chapter.title})` : ''}
                        </a>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          by {r.reporter?.username ?? r.reporter?.email ?? 'anonymous'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          · {new Date(r.created_at).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold mb-1"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                        {r.reason}
                      </span>
                      {r.notes && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{r.notes}</p>}
                    </div>
                    <DismissReportButton id={r.id} onDismiss={() => onDismissChapter(r.id)} />
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} total={activeFiltered.length} pageSize={PAGE_SIZE} />
            )}
          </>
        )
      )}
    </div>
  );
}

function EmptyState({ hasData }: { hasData: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl py-16" style={{ background: 'var(--bg-secondary)' }}>
      <span className="text-4xl opacity-20">{hasData ? '🔍' : '🎉'}</span>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        {hasData ? 'Tidak ada hasil ditemukan' : 'Tidak ada laporan — semua bersih!'}
      </p>
    </div>
  );
}