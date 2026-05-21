'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  Heart, Trash2, Send, MessageSquare, ChevronDown,
  CornerDownRight, Flag, X, CheckCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
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
  user_id: string;
  user: CommentUser | null;
}

type SortType = 'newest' | 'oldest' | 'popular';
const SORT_LABELS: Record<SortType, string> = { newest: 'Terbaru', oldest: 'Terlama', popular: 'Terpopuler' };

const REPORT_REASONS = [
  { value: 'wrong_chapter',   label: 'Chapter salah upload' },
  { value: 'broken_images',   label: 'Gambar rusak / hilang' },
  { value: 'low_quality',     label: 'Kualitas gambar buruk' },
  { value: 'duplicate',       label: 'Chapter duplikat' },
  { value: 'other',           label: 'Lainnya' },
] as const;

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
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size, height: size, fontSize: size <= 28 ? 10 : 13,
        background: `hsl(${((user?.username ?? 'A').charCodeAt(0) * 37) % 360}, 55%, 38%)`,
        color: 'rgba(255,255,255,0.9)',
      }}
    >
      {(user?.username ?? '?').charAt(0).toUpperCase()}
    </div>
  );
}

interface ReplyBoxProps {
  chapterId: string;
  parentId: string;
  onSubmitted: (reply: Comment) => void;
  onCancel: () => void;
}

function ReplyBox({ chapterId, parentId, onSubmitted, onCancel }: ReplyBoxProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async () => {
    if (!content.trim() || submitting || !user) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({ chapter_id: chapterId, user_id: user.id, content: content.trim(), parent_id: parentId })
        .select('id, content, created_at, likes_count, parent_id, user_id, user:users(id, username, avatar_url)')
        .single();
      if (!error && data) { onSubmitted(data as unknown as Comment); setContent(''); }
    } finally { setSubmitting(false); }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
      <textarea
        ref={ref}
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Tulis balasan..."
        rows={2}
        maxLength={2000}
        className="w-full resize-none bg-transparent px-3 pt-3 pb-2 text-xs outline-none"
        style={{ color: 'rgba(255,255,255,0.85)' }}
      />
      <div className="flex justify-end gap-2 px-3 pb-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={onCancel} className="rounded-lg px-3 py-1 text-xs font-medium hover:opacity-70" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
  );
}

export function ChapterEngagement({ chapterId }: { chapterId: string }) {
  const { isAuthenticated, user } = useAuth();
  const supabase = createClient();

  // Like
  const [likeCount, setLikeCount]   = useState(0);
  const [isLiked, setIsLiked]       = useState(false);
  const [likePending, setLikePending] = useState(false);

  // Comments
  const [comments, setComments]     = useState<Comment[]>([]);
  const [replies, setReplies]       = useState<Comment[]>([]);
  const [sort, setSort]             = useState<SortType>('newest');
  const [loading, setLoading]       = useState(true);
  const [hasMore, setHasMore]       = useState(false);
  const [page, setPage]             = useState(1);
  const [likedIds, setLikedIds]     = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Report
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<string>('wrong_chapter');
  const [reportNotes, setReportNotes] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  // Load likes
  useEffect(() => {
    async function load() {
      const { count } = await supabase
        .from('chapter_likes')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', chapterId);
      setLikeCount(count ?? 0);
      if (user) {
        const { data } = await supabase
          .from('chapter_likes').select('id')
          .eq('chapter_id', chapterId).eq('user_id', user.id).maybeSingle();
        setIsLiked(!!data);
      }
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, user?.id]);

  const PAGE_SIZE = 10;

  const fetchComments = useCallback(async (s: SortType, p: number, append = false) => {
    setLoading(true);
    try {
      const orderMap: Record<SortType, { col: string; asc: boolean }> = {
        newest:  { col: 'created_at', asc: false },
        oldest:  { col: 'created_at', asc: true  },
        popular: { col: 'likes_count', asc: false },
      };
      const { col, asc } = orderMap[s];
      const from = (p - 1) * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      const { data: topLevel, count } = await supabase
        .from('comments')
        .select('id, content, created_at, likes_count, parent_id, user_id, user:users(id, username, avatar_url)', { count: 'exact' })
        .eq('chapter_id', chapterId)
        .is('parent_id', null)
        .order(col, { ascending: asc })
        .range(from, to);

      const items = (topLevel ?? []) as unknown as Comment[];
      const ids = items.map(c => c.id);

      let reps: Comment[] = [];
      if (ids.length > 0) {
        const { data: replyData } = await supabase
          .from('comments')
          .select('id, content, created_at, likes_count, parent_id, user_id, user:users(id, username, avatar_url)')
          .eq('chapter_id', chapterId)
          .in('parent_id', ids)
          .order('created_at', { ascending: true });
        reps = (replyData ?? []) as unknown as Comment[];
      }

      setComments(prev => append ? [...prev, ...items] : items);
      setReplies(prev => append ? [...prev, ...reps] : reps);
      setHasMore((count ?? 0) > p * PAGE_SIZE);

      if (isAuthenticated && user) {
        const allIds = [...items.map(c => c.id), ...reps.map(r => r.id)];
        if (allIds.length > 0) {
          const { data: liked } = await supabase
            .from('comment_likes')
            .select('comment_id')
            .eq('user_id', user.id)
            .in('comment_id', allIds);
          if (liked) {
            setLikedIds(prev => {
              const next = new Set(append ? prev : new Set<string>());
              liked.forEach(l => next.add(l.comment_id));
              return next;
            });
          }
        }
      }
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, user?.id, isAuthenticated]);

  useEffect(() => {
    setPage(1);
    void fetchComments(sort, 1, false);
  }, [sort, fetchComments]);

  const toggleLike = async () => {
    if (!isAuthenticated || !user || likePending) return;
    setLikePending(true);
    if (isLiked) {
      await supabase.from('chapter_likes').delete().match({ chapter_id: chapterId, user_id: user.id });
      setIsLiked(false); setLikeCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from('chapter_likes').insert({ chapter_id: chapterId, user_id: user.id });
      setIsLiked(true); setLikeCount(c => c + 1);
    }
    setLikePending(false);
  };

  const toggleCommentLike = async (commentId: string) => {
    if (!isAuthenticated || !user) return;
    const wasLiked = likedIds.has(commentId);
    setLikedIds(prev => { const n = new Set(prev); if (wasLiked) { n.delete(commentId); } else { n.add(commentId); } return n; });
    const upd = (c: Comment) => c.id === commentId ? { ...c, likes_count: c.likes_count + (wasLiked ? -1 : 1) } : c;
    setComments(prev => prev.map(upd));
    setReplies(prev => prev.map(upd));
    if (wasLiked) {
      await supabase.from('comment_likes').delete().match({ comment_id: commentId, user_id: user.id });
    } else {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
    }
  };

  const submitComment = async () => {
    if (!commentText.trim() || submitting || !user) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({ chapter_id: chapterId, user_id: user.id, content: commentText.trim() })
        .select('id, content, created_at, likes_count, parent_id, user_id, user:users(id, username, avatar_url)')
        .single();
      if (!error && data) {
        setComments(prev => [data as unknown as Comment, ...prev]);
        setCommentText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
    } finally { setSubmitting(false); }
  };

  const deleteComment = async (id: string) => {
    if (!confirm('Hapus komentar ini?') || !user) return;
    await supabase.from('comments').delete().match({ id, user_id: user.id });
    const isReply = replies.some(r => r.id === id);
    if (isReply) setReplies(prev => prev.filter(r => r.id !== id));
    else { setComments(prev => prev.filter(c => c.id !== id)); setReplies(prev => prev.filter(r => r.parent_id !== id)); }
  };

  const submitReport = async () => {
    if (!user || reportSubmitting) return;
    setReportSubmitting(true);
    await supabase.from('chapter_reports').insert({
      chapter_id: chapterId, user_id: user.id, reason: reportReason,
      notes: reportNotes.trim() || null,
    });
    setReportDone(true);
    setTimeout(() => { setShowReport(false); setReportDone(false); setReportNotes(''); setReportReason('wrong_chapter'); }, 2000);
    setReportSubmitting(false);
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const getRepliesFor = (id: string) => replies.filter(r => r.parent_id === id);
  const totalComments = comments.length + replies.length;

  return (
    <div className="w-full px-3 pb-28" style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Action bar: Like + Report ─────────────────────────────────── */}
      <div
        className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-5"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={toggleLike}
          disabled={!isAuthenticated || likePending}
          className={cn('flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all', (!isAuthenticated) && 'opacity-40 cursor-not-allowed')}
          style={{ background: isLiked ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.07)' }}
        >
          <Heart size={15} fill={isLiked ? '#ef4444' : 'none'} stroke={isLiked ? '#ef4444' : 'rgba(255,255,255,0.55)'} />
          <span style={{ color: isLiked ? '#ef4444' : 'rgba(255,255,255,0.6)' }}>{likeCount}</span>
          <span className="hidden sm:inline text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Votes</span>
        </button>

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
          <MessageSquare size={13} />
          <span>{totalComments}</span>
          <span className="hidden sm:inline text-xs">Komentar</span>
        </div>

        <div className="flex-1" />

        <button
          onClick={isAuthenticated ? () => setShowReport(true) : undefined}
          className={cn('flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-colors', isAuthenticated ? 'hover:text-red-400 hover:bg-red-500/10' : 'opacity-30 cursor-not-allowed')}
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)' }}
        >
          <Flag size={13} />
          <span className="hidden sm:inline">Laporkan</span>
        </button>
      </div>

      {/* ── Comment section ───────────────────────────────────────────── */}
      <div>
        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare size={15} style={{ color: 'var(--color-primary)' }} />
          <h3 className="text-sm font-bold text-white">Diskusi</h3>
          {totalComments > 0 && <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>{totalComments}</span>}
        </div>

        {/* Input */}
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
          <textarea
            ref={textareaRef}
            value={commentText}
            onChange={e => { setCommentText(e.target.value); autoResize(); }}
            placeholder="Tambah komentar..."
            rows={3}
            maxLength={2000}
            className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm outline-none"
            style={{ color: 'rgba(255,255,255,0.85)', minHeight: 80 }}
          />
          <div className="flex items-center justify-between px-4 pb-3 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{commentText.length} / 2000</span>
            <div className="flex items-center gap-2">
              {!isAuthenticated && (
                <Link href="/login" className="rounded-lg border px-4 py-1.5 text-xs font-semibold hover:opacity-80"
                  style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
                  Login
                </Link>
              )}
              <button
                onClick={submitComment}
                disabled={!isAuthenticated || !commentText.trim() || submitting}
                className={cn('flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold text-white', (!isAuthenticated || !commentText.trim() || submitting) && 'opacity-40 cursor-not-allowed')}
                style={{ background: 'var(--color-primary)' }}
              >
                <Send size={12} /> {submitting ? 'Kirim...' : 'Kirim'}
              </button>
            </div>
          </div>
        </div>

        {/* Sort */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">{totalComments} Komentar</p>
          <div className="flex gap-1.5">
            {(['newest', 'oldest', 'popular'] as SortType[]).map(s => (
              <button key={s} onClick={() => setSort(s)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', sort === s ? 'text-white' : 'hover:opacity-80')}
                style={sort === s ? { background: 'var(--color-primary)' } : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="space-y-5">
          {loading && comments.length === 0 && (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="size-9 shrink-0 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-28 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
                    <div className="h-10 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && comments.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10" style={{ color: 'rgba(255,255,255,0.2)' }}>
              <MessageSquare size={32} style={{ opacity: 0.3 }} />
              <p className="text-sm">Belum ada komentar. Jadilah yang pertama!</p>
            </div>
          )}

          {comments.map(comment => {
            const isOwn = user?.id === comment.user_id;
            const liked = likedIds.has(comment.id);
            const commentReplies = getRepliesFor(comment.id);
            return (
              <div key={comment.id}>
                <div className="flex gap-3">
                  <UserAvatar user={comment.user} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                        {comment.user?.username ?? 'Anonymous'}
                      </span>
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: localeId })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'rgba(255,255,255,0.75)' }}>
                      {comment.content}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <button onClick={() => toggleCommentLike(comment.id)}
                        className={cn('flex items-center gap-1 text-xs transition-colors', liked ? 'font-semibold' : 'hover:opacity-70')}
                        style={{ color: liked ? '#ef4444' : 'rgba(255,255,255,0.35)' }}>
                        <Heart size={13} fill={liked ? '#ef4444' : 'none'} />
                        {comment.likes_count > 0 && comment.likes_count}
                      </button>
                      {isAuthenticated && (
                        <button
                          onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                          className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                          style={{ color: replyingTo === comment.id ? 'var(--color-primary)' : 'rgba(255,255,255,0.35)' }}
                        >
                          <CornerDownRight size={12} /> Balas
                        </button>
                      )}
                      {isOwn && (
                        <button onClick={() => deleteComment(comment.id)}
                          className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                          style={{ color: 'rgba(255,255,255,0.3)' }}>
                          <Trash2 size={12} /> Hapus
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {replyingTo === comment.id && (
                  <div className="ml-12 mt-2">
                    <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Membalas <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>@{comment.user?.username ?? 'Anonymous'}</span>
                    </p>
                    <ReplyBox
                      chapterId={chapterId} parentId={comment.id}
                      onSubmitted={r => { setReplies(prev => [...prev, r]); setReplyingTo(null); }}
                      onCancel={() => setReplyingTo(null)}
                    />
                  </div>
                )}

                {commentReplies.length > 0 && (
                  <div className="ml-12 mt-3 space-y-3 pl-3" style={{ borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
                    {commentReplies.map(reply => {
                      const replyOwn = user?.id === reply.user_id;
                      const replyLiked = likedIds.has(reply.id);
                      return (
                        <div key={reply.id} className="flex gap-2.5">
                          <UserAvatar user={reply.user} size={28} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>{reply.user?.username ?? 'Anonymous'}</span>
                              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true, locale: localeId })}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'rgba(255,255,255,0.7)' }}>
                              {reply.content}
                            </p>
                            <div className="mt-1 flex items-center gap-3">
                              <button onClick={() => toggleCommentLike(reply.id)}
                                className={cn('flex items-center gap-1 text-[11px]', replyLiked ? 'font-semibold' : 'hover:opacity-70')}
                                style={{ color: replyLiked ? '#ef4444' : 'rgba(255,255,255,0.3)' }}>
                                <Heart size={11} fill={replyLiked ? '#ef4444' : 'none'} />
                                {reply.likes_count > 0 && reply.likes_count}
                              </button>
                              {replyOwn && (
                                <button onClick={() => deleteComment(reply.id)}
                                  className="flex items-center gap-1 text-[11px] hover:opacity-70"
                                  style={{ color: 'rgba(255,255,255,0.3)' }}>
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

        {hasMore && (
          <button
            onClick={() => { const next = page + 1; setPage(next); void fetchComments(sort, next, true); }}
            disabled={loading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          >
            <ChevronDown size={15} />
            {loading ? 'Memuat...' : 'Lihat komentar lainnya'}
          </button>
        )}
      </div>

      {/* ── Report modal ─────────────────────────────────────────────── */}
      {showReport && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/75" onClick={() => setShowReport(false)} />
          <div className="fixed inset-x-4 bottom-0 z-[201] mx-auto rounded-t-2xl p-5 sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-80 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
            style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div className="flex justify-center mb-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            {reportDone ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <CheckCircle size={32} style={{ color: '#22c55e' }} />
                <p className="text-sm font-semibold text-white">Laporan terkirim!</p>
                <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>Tim kami akan meninjau laporan ini.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Flag size={14} style={{ color: '#ef4444' }} />
                    <span className="text-sm font-bold text-white">Laporkan Chapter</span>
                  </div>
                  <button onClick={() => setShowReport(false)} className="rounded-lg p-1 hover:opacity-70" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <X size={14} />
                  </button>
                </div>
                <p className="mb-2 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>Alasan laporan:</p>
                <div className="space-y-1.5 mb-4">
                  {REPORT_REASONS.map(r => (
                    <button key={r.value} onClick={() => setReportReason(r.value)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-left transition-colors"
                      style={{
                        background: reportReason === r.value ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${reportReason === r.value ? 'rgba(239,68,68,0.4)' : 'transparent'}`,
                        color: reportReason === r.value ? '#ef4444' : 'rgba(255,255,255,0.65)',
                        fontWeight: reportReason === r.value ? 600 : 400,
                      }}
                    >
                      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full border"
                        style={{ borderColor: reportReason === r.value ? '#ef4444' : 'rgba(255,255,255,0.2)', background: reportReason === r.value ? '#ef4444' : 'transparent' }}>
                        {reportReason === r.value && <span className="size-1.5 rounded-full bg-white" />}
                      </span>
                      {r.label}
                    </button>
                  ))}
                </div>
                {reportReason === 'other' && (
                  <textarea value={reportNotes} onChange={e => setReportNotes(e.target.value)}
                    placeholder="Jelaskan masalahnya..." rows={2} maxLength={500}
                    className="mb-3 w-full resize-none rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}
                  />
                )}
                <button onClick={submitReport} disabled={reportSubmitting}
                  className={cn('flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white', reportSubmitting && 'opacity-50 cursor-not-allowed')}
                  style={{ background: '#ef4444' }}>
                  <Flag size={12} /> {reportSubmitting ? 'Mengirim...' : 'Kirim Laporan'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
