import { createClient } from '@/lib/supabase/server';
import { ReportsClient } from '@/components/admin/ReportsClient';

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

export default async function AdminReportsPage() {
  const supabase = await createClient();
  const [
    { data: chapterReports, error: chapterError },
    { data: mangaReports, error: mangaError },
  ] = await Promise.all([
    supabase
      .from('chapter_reports')
      .select('id, reason, notes, created_at, chapter:chapters(id, number, title, manga:manga(title, slug)), reporter:users(username, email)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('manga_reports')
      .select('id, reason, notes, status, created_at, manga:manga(id, title, slug), reporter:users(username, email)')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const errorMsg = chapterError?.message ?? mangaError?.message;
  if (errorMsg) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl py-16" style={{ background: 'var(--bg-secondary)' }}>
        <span className="text-4xl opacity-20">⚠️</span>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Gagal memuat laporan: {errorMsg}</p>
      </div>
    );
  }

  return (
    <ReportsClient
      chapterReports={(chapterReports ?? []) as unknown as ChapterReport[]}
      mangaReports={(mangaReports ?? []) as unknown as MangaReport[]}
    />
  );
}
