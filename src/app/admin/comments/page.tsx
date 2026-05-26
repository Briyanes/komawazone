import { createClient } from '@/lib/supabase/server';
import { CommentsClient } from '@/components/admin/CommentsClient';

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

export default async function AdminCommentsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('comments')
    .select('id, content, created_at, chapter_id, manga_id, likes_count, chapter:chapters(id, number, manga:manga(title, slug)), manga:manga(id, title, slug), user:users(username, email)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl py-16" style={{ background: 'var(--bg-secondary)' }}>
        <span className="text-4xl opacity-20">⚠️</span>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Gagal memuat komentar: {error.message}</p>
      </div>
    );
  }

  const comments = (data ?? []) as unknown as Comment[];
  return <CommentsClient comments={comments} />;
}

