'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Heart, Trash2, Send, MessageSquare, ChevronDown, CornerDownRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';

interface CommentUser {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  likes_count: number;
  parent_id: string | null;
  user: CommentUser | null;
}

type SortType = 'newest' | 'oldest' | 'popular';

const SORT_LABELS: Record<SortType, string> = {
  newest:  'Terbaru',
  oldest:  'Terlama',
  popular: 'Terpopuler',
};

function UserAvatar({ user, size = 36 }: { user: CommentUser | null; size?: number }) {
  if (user?.avatar_url) {
    return (
      <div className="relative shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
        <Image src={user.avatar_url} alt={user.username ?? 'User'} fill className="object-cover" sizes={`${size}px`} />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-white font-bold"
      style={{ width: size, height: size, fontSize: size <= 28 ? 10 : 13, background: `hsl(${((user?.username ?? 'A').charCodeAt(0) * 37) % 360}, 65%, 45%)` }}
    >
      {(user?.username ?? '?').charAt(0).toUpperCase()}
    </div>
  );
}

interface ReplyBoxProps {
  mangaSlug: string;
  parentId: string;
  onSubmitted: (reply: Comment) => void;
  onCancel: () => void;
}

function ReplyBox({ mangaSlug, parentId, onSubmitted, onCancel }: ReplyBoxProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/manga/${mangaSlug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), parent_id: parentId }),
      });
      const json = await res.json() as { data?: Comment; error?: string };
      if (!res.ok) { setError(json.error ?? 'Gagal kirim'); return; }
      if (json.data) { onSubmitted(json.data); setContent(''); }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-medium)', background: 'var(--bg-secondary)' }}>
        <textarea
          ref={ref}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Tulis balasan..."
          rows={2}
          maxLength={2000}
          className="w-full resize-none bg-transparent px-3 pt-3 pb-2 text-xs outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        <div className="flex justify-end gap-2 px-3 pb-2 pt-1" style={{ borderTop: '1px solid var(--border-light)' }}>
          <button onClick={onCancel} className="rounded-lg px-3 py-1 text-xs font-medium hover:opacity-70" style={{ color: 'var(--text-tertiary)' }}>
            Batal
          </button>
          <button
            onClick={submit}
            disabled={!content.trim() || submitting}
            className={cn('flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold text-white', (!content.trim() || submitting) && 'opacity-40 cursor-not-allowed')}
            style={{ background: 'var(--color-primary)' }}
          >
            <Send size={10} /> {submitting ? 'Kirim...' : 'Balas'}
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}

export function MangaCommentSection({ mangaSlug }: { mangaSlug: string }) {
  const { isAuthenticated, user } = useAuth();
  const [comments, setComments]     = useState<Comment[]>([]);
  const [replies, setReplies]       = useState<Comment[]>([]);
  const [total, setTotal]           = useState(0);
  const [sort, setSort]             = useState<SortType>('newest');
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent]       = useState('');
  const [likedIds, setLikedIds]     = useState<Set<string>>(new Set());
  const [error, setError]           = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = useCallback(async (s: SortType, p: number, append = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/manga/${mangaSlug}/comments?sort=${s}&page=${p}`);
      if (!res.ok) return;
      const json = await res.json() as { data: Comment[]; replies: Comment[]; total: number; hasMore: boolean; likedIds: string[] };
      setComments(prev => append ? [...prev, ...json.data] : json.data);
      setReplies(prev => append ? [...prev, ...json.replies] : json.replies);
      setTotal(json.total);
      setHasMore(json.hasMore);
      setLikedIds(prev => {
        const next = new Set(append ? prev : new Set<string>());
        json.likedIds.forEach(id => next.add(id));
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [mangaSlug]);

  useEffect(() => {
    setPage(1);
    void fetchComments(sort, 1, false);
  }, [sort, fetchComments]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    void fetchComments(sort, next, true);
  };

  const submit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/manga/${mangaSlug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      const json = await res.json() as { data?: Comment; error?: string };
      if (!res.ok) { setError(json.error ?? 'Gagal kirim komentar'); return; }
      if (json.data) {
        setComments(prev => [json.data!, ...prev]);
        setTotal(t => t + 1);
        setContent('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (id: string) => {
    if (!confirm('Hapus komentar ini?')) return;
    const res = await fetch(`/api/v1/manga/${mangaSlug}/comments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      // Could be a reply or top-level
      const isReply = replies.some(r => r.id === id);
      if (isReply) {
        setReplies(prev => prev.filter(r => r.id !== id));
      } else {
        setComments(prev => prev.filter(c => c.id !== id));
        setReplies(prev => prev.filter(r => r.parent_id !== id));
        setTotal(t => t - 1);
      }
    }
  };

  const toggleLike = async (commentId: string) => {
    if (!isAuthenticated) return;
    const wasLiked = likedIds.has(commentId);
    // Optimistic update
    setLikedIds(prev => {
      const next = new Set(prev);
      wasLiked ? next.delete(commentId) : next.add(commentId);
      return next;
    });
    const update = (c: Comment) => c.id === commentId ? { ...c, likes_count: c.likes_count + (wasLiked ? -1 : 1) } : c;
    setComments(prev => prev.map(update));
    setReplies(prev => prev.map(update));
    await fetch(`/api/v1/comments/${commentId}/like`, { method: 'POST' });
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleReplySubmitted = (reply: Comment) => {
    setReplies(prev => [...prev, reply]);
    setReplyingTo(null);
  };

  const getRepliesFor = (commentId: string) => replies.filter(r => r.parent_id === commentId);

  return (
    <section className="mt-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <MessageSquare size={16} style={{ color: 'var(--color-primary)' }} />
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          Komentar
        </h2>
        {total > 0 && (
          <span className="text-sm font-bold" style={{ color: 'var(--text-tertiary)' }}>
            {total}
          </span>
        )}
      </div>

      {/* Input area */}
      <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-medium)', background: 'var(--bg-secondary)' }}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => { setContent(e.target.value); autoResize(); }}
          onInput={autoResize}
          placeholder="Komen di mari..."
          rows={3}
          maxLength={2000}
          className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm outline-none"
          style={{ color: 'var(--text-primary)', minHeight: 80 }}
        />
        <div className="flex items-center justify-between px-4 pb-3 pt-1" style={{ borderTop: '1px solid var(--border-light)' }}>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {content.length} / 2000 kata
          </span>
          <div className="flex items-center gap-2">
            {!isAuthenticated && (
              <Link
                href="/login"
                className="rounded-lg border px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ borderColor: 'var(--border-medium)', color: 'var(--text-primary)' }}
              >
                Login
              </Link>
            )}
            <button
              onClick={submit}
              disabled={!isAuthenticated || !content.trim() || submitting}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold text-white transition-opacity',
                (!isAuthenticated || !content.trim() || submitting) ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90'
              )}
              style={{ background: 'var(--color-primary)' }}
            >
              <Send size={12} />
              {submitting ? 'Kirim...' : 'Kirim'}
            </button>
          </div>
        </div>
        {error && (
          <p className="px-4 pb-3 text-xs" style={{ color: '#ef4444' }}>{error}</p>
        )}
      </div>

      {/* Sort + count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {total} Komentar
        </p>
        <div className="flex gap-1.5">
          {(['newest', 'oldest', 'popular'] as SortType[]).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                sort === s
                  ? 'text-white'
                  : 'hover:opacity-80'
              )}
              style={sort === s
                ? { background: 'var(--color-primary)' }
                : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
              }
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Comment list */}
      <div className="space-y-4">
        {loading && comments.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="size-9 shrink-0 rounded-full" style={{ background: 'var(--bg-tertiary)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded" style={{ background: 'var(--bg-tertiary)' }} />
                  <div className="h-10 rounded" style={{ background: 'var(--bg-tertiary)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && comments.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10" style={{ color: 'var(--text-tertiary)' }}>
            <MessageSquare size={32} style={{ opacity: 0.2 }} />
            <p className="text-sm">Belum ada komentar. Jadilah yang pertama!</p>
          </div>
        )}

        {comments.map(comment => {
          const isOwn = user?.id === comment.user?.id;
          const liked = likedIds.has(comment.id);
          const commentReplies = getRepliesFor(comment.id);
          return (
            <div key={comment.id}>
              {/* Top-level comment */}
              <div className="flex gap-3">
                <UserAvatar user={comment.user} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                      {comment.user?.username ?? 'Anonymous'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: localeId })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
                    {comment.content}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button
                      onClick={() => toggleLike(comment.id)}
                      className={cn('flex items-center gap-1 text-xs transition-colors', liked ? 'font-semibold' : 'hover:opacity-70', !isAuthenticated && 'cursor-default')}
                      style={{ color: liked ? '#ef4444' : 'var(--text-tertiary)' }}
                      title={isAuthenticated ? (liked ? 'Unlike' : 'Like') : 'Login untuk like'}
                    >
                      <Heart size={13} fill={liked ? '#ef4444' : 'none'} />
                      {comment.likes_count > 0 && comment.likes_count}
                    </button>
                    {isAuthenticated && (
                      <button
                        onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                        className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                        style={{ color: replyingTo === comment.id ? 'var(--color-primary)' : 'var(--text-tertiary)' }}
                      >
                        <CornerDownRight size={12} /> Balas
                      </button>
                    )}
                    {isOwn && (
                      <button onClick={() => deleteComment(comment.id)}
                        className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                        style={{ color: 'var(--text-tertiary)' }}>
                        <Trash2 size={12} /> Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline reply input */}
              {replyingTo === comment.id && (
                <div className="ml-12 mt-2">
                  <p className="text-xs mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    Membalas <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>@{comment.user?.username ?? 'Anonymous'}</span>
                  </p>
                  <ReplyBox
                    mangaSlug={mangaSlug}
                    parentId={comment.id}
                    onSubmitted={handleReplySubmitted}
                    onCancel={() => setReplyingTo(null)}
                  />
                </div>
              )}

              {/* Replies */}
              {commentReplies.length > 0 && (
                <div className="ml-12 mt-3 space-y-3 pl-3" style={{ borderLeft: '2px solid var(--border-light)' }}>
                  {commentReplies.map(reply => {
                    const replyIsOwn = user?.id === reply.user?.id;
                    const replyLiked = likedIds.has(reply.id);
                    return (
                      <div key={reply.id} className="flex gap-2.5">
                        <UserAvatar user={reply.user} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>{reply.user?.username ?? 'Anonymous'}</span>
                            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                              {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true, locale: localeId })}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
                            {reply.content}
                          </p>
                          <div className="mt-1 flex items-center gap-3">
                            <button onClick={() => toggleLike(reply.id)}
                              className={cn('flex items-center gap-1 text-[11px] transition-colors', replyLiked ? 'font-semibold' : 'hover:opacity-70')}
                              style={{ color: replyLiked ? '#ef4444' : 'var(--text-tertiary)' }}>
                              <Heart size={11} fill={replyLiked ? '#ef4444' : 'none'} />
                              {reply.likes_count > 0 && reply.likes_count}
                            </button>
                            {replyIsOwn && (
                              <button onClick={() => deleteComment(reply.id)}
                                className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-70"
                                style={{ color: 'var(--text-tertiary)' }}>
                                <Trash2 size={11} /> Hapus
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}
        >
          <ChevronDown size={15} />
          {loading ? 'Memuat...' : `Lihat komentar lainnya`}
        </button>
      )}
    </section>
  );
}
