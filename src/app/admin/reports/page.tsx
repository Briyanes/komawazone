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
  const [{ data: chapterReports }, { data: mangaReports }] = await Promise.all([
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

  return (
    <ReportsClient
      chapterReports={(chapterReports ?? []) as unknown as ChapterReport[]}
      mangaReports={(mangaReports ?? []) as unknown as MangaReport[]}
    />
  );
}
