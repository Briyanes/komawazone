'use client';

import { useState, useMemo } from 'react';
import { Search, X, MessageCircle, Heart } from 'lucide-react';
import { DeleteCommentButton } from '@/components/admin/DeleteCommentButton';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  chapter_id: string | null;
  manga_id: string | null;
  likes_count: number;
  chapter: { id: string; number: number; manga: { title: string; slug: string } | null } | null;
  manga: { id: string; title: string; slug: string } | null;
  user: { username: string | null; email: string } | null;
}

export function CommentsClient({ comments: initial }: { comments: Comment[] }) {
  const [search, setSearch]         = useState('');
  const [comments, setComments]     = useState<Comment[]>(initial);
  const [typeFilter, setTypeFilter] = useState<'all' | 'manga' | 'chapter'>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return comments.filter(c => {
      if (typeFilter === 'manga'   && !c.manga_id)   return false;
      if (typeFilter === 'chapter' && !c.chapter_id) return false;
      if (!q) return true;
      const user    = (c.user?.username ?? c.user?.email ?? '').toLowerCase();
      const manga   = (c.manga?.title ?? c.chapter?.manga?.title ?? '').toLowerCase();
      const content = c.content.toLowerCase();
      return user.includes(q) || manga.includes(q) || content.includes(q);
    });
  }, [comments, search, typeFilter]);

  const onDelete = (id: string) => setComments(prev => prev.filter(c => c.id !== id));

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Komentar</h1>
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'rgba(255,107,53,0.12)', color: 'var(--color-primary)' }}>
            {filtered.length}{search || typeFilter !== 'all' ? ` / ${comments.length}` : ''}
          </span>
        </div>
        {/* Type tabs */}
        <div className="flex gap-1">
          {(['all', 'manga', 'chapter'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: typeFilter === t ? 'var(--color-primary)' : 'var(--bg-tertiary)',
                color: typeFilter === t ? '#fff' : 'var(--text-secondary)',
              }}>
              {t === 'all' ? 'Semua' : t === 'manga' ? 'Manga' : 'Chapter'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari user, manga, atau konten…"
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl py-16" style={{ background: 'var(--bg-secondary)' }}>
          <span className="text-4xl opacity-20">💬</span>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {comments.length === 0 ? 'Belum ada komentar' : 'Tidak ada hasil ditemukan'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border divide-y"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          {filtered.map(c => {
            const chapterManga = c.chapter?.manga;
            const directManga = c.manga;
            const mangaTitle = directManga?.title ?? chapterManga?.title;
            const mangaSlug  = directManga?.slug  ?? chapterManga?.slug;
            const href = c.chapter_id
              ? `/manga/${mangaSlug}/chapter/${c.chapter_id}`
              : mangaSlug ? `/manga/${mangaSlug}` : '#';
            const label = c.chapter_id
              ? `${mangaTitle} — Ch. ${c.chapter?.number}`
              : mangaTitle ?? '—';

            return (
              <div key={c.id} className="flex items-start gap-4 px-5 py-3.5">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  {c.user?.username?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {c.user?.username ?? c.user?.email ?? 'anonymous'}
                    </span>
                    <a href={href} target="_blank" rel="noreferrer"
                      className="text-xs hover:underline" style={{ color: 'var(--color-primary)' }}>
                      {label}
                    </a>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(c.created_at).toLocaleDateString('id-ID')}
                    </span>
                    {c.likes_count > 0 && (
                      <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <Heart size={10} className="fill-current text-pink-400" />{c.likes_count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm line-clamp-3" style={{ color: 'var(--text-secondary)' }}>{c.content}</p>
                </div>
                <DeleteCommentButton id={c.id} onDelete={() => onDelete(c.id)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
