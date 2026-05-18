import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { BookOpen, Users, FileText, TrendingUp, Plus, Megaphone, ArrowRight, Clock } from 'lucide-react';
import { AdminAnalyticsChart } from '@/components/admin/AdminAnalyticsChart';

async function getStats() {
  const supabase = await createClient();
  const [mangaRes, chapterRes, userRes, viewsRes] = await Promise.all([
    supabase.from('manga').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('chapters').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('manga').select('views').is('deleted_at', null),
  ]);
  const totalViews = (viewsRes.data ?? []).reduce((sum, m) => sum + (m.views ?? 0), 0);
  return {
    manga: mangaRes.count ?? 0,
    chapters: chapterRes.count ?? 0,
    users: userRes.count ?? 0,
    views: totalViews,
  };
}

async function getRecentManga() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('manga')
    .select('id, slug, title, status, views, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(6);
  return data ?? [];
}

async function getRecentChapters() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('chapters')
    .select('id, number, title, release_date, manga(title, slug)')
    .order('release_date', { ascending: false })
    .limit(5);
  return data ?? [];
}

const statusColor: Record<string, string> = {
  ONGOING: '#10B981',
  COMPLETED: '#3B82F6',
  HIATUS: '#F59E0B',
  DROPPED: '#EF4444',
};

export default async function AdminDashboard() {
  const [stats, recentManga, recentChapters] = await Promise.all([
    getStats(), getRecentManga(), getRecentChapters(),
  ]);

  const statCards = [
    {
      icon: BookOpen, label: 'Manga', value: stats.manga,
      href: '/admin/manga', color: 'var(--color-primary)',
      bg: 'rgba(255,107,53,0.1)',
    },
    {
      icon: FileText, label: 'Chapters', value: stats.chapters,
      href: '/admin/chapters', color: '#3B82F6',
      bg: 'rgba(59,130,246,0.1)',
    },
    {
      icon: Users, label: 'Users', value: stats.users,
      href: '/admin/users', color: '#10B981',
      bg: 'rgba(16,185,129,0.1)',
    },
    {
      icon: TrendingUp, label: 'Views', value: stats.views,
      href: '/admin/stats', color: '#8B5CF6',
      bg: 'rgba(139,92,246,0.1)',
    },
  ];

  const quickActions = [
    { href: '/admin/manga/new',    icon: Plus,      label: 'New Manga',   color: 'var(--color-primary)' },
    { href: '/admin/chapters/new', icon: FileText,  label: 'New Chapter', color: '#3B82F6' },
    { href: '/admin/ads',          icon: Megaphone, label: 'Manage Ads',  color: '#F59E0B' },
  ];

  return (
    <div className="space-y-5 w-full">

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(card => (
          <Link
            key={card.label}
            href={card.href}
            className="group rounded-xl p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <div
              className="mb-3 flex size-9 items-center justify-center rounded-lg"
              style={{ background: card.bg }}
            >
              <card.icon size={18} style={{ color: card.color }} />
            </div>
            <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </p>
            <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {card.label}
            </p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map(action => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: action.color }}
          >
            <action.icon size={15} />
            <span className="hidden sm:inline">{action.label}</span>
          </Link>
        ))}
      </div>

      {/* Analytics Charts */}
      <AdminAnalyticsChart />

      {/* Two-column content */}
      <div className="grid gap-4 lg:grid-cols-5">

        {/* Recent manga — 3 cols */}
        <div className="lg:col-span-3 rounded-xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border-light)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Recent Manga
            </h2>
            <Link href="/admin/manga" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {recentManga.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <span className="text-3xl opacity-20">📚</span>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No manga yet</p>
              <Link href="/admin/manga/new" className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                Add one →
              </Link>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
              {recentManga.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: statusColor[m.status] ?? '#999' }}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/manga/${m.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {m.title}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {(m.views ?? 0).toLocaleString()} views
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ background: `${statusColor[m.status]}18`, color: statusColor[m.status] ?? '#999' }}
                  >
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent chapters — 2 cols */}
        <div className="lg:col-span-2 rounded-xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border-light)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Recent Chapters
            </h2>
            <Link href="/admin/chapters" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {recentChapters.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <span className="text-3xl opacity-20">📄</span>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No chapters yet</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
              {recentChapters.map(ch => {
                const manga = ch.manga as { title?: string; slug?: string } | null;
                return (
                  <div key={ch.id} className="px-4 py-2.5">
                    <p className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {manga?.title ?? '—'}
                    </p>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Ch. {ch.number}{ch.title ? ` — ${ch.title}` : ''}
                    </p>
                    {ch.release_date && (
                      <p className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        <Clock size={10} />
                        {new Date(ch.release_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
