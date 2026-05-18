import { createClient } from '@/lib/supabase/server';
import { BarChart, HorizontalBar } from '@/components/admin/Charts';

interface StatsData {
  manga_count: number;
  chapter_count: number;
  user_count: number;
  active_ad_providers: number;
  top_manga: Array<{
    id: string;
    title: string;
    cover_url: string | null;
    views: number;
  }>;
}

function buildDailyBuckets(
  rows: Array<{ last_read_at: string }>,
  days = 30
): Array<{ label: string; value: number }> {
  const counts: Record<string, number> = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    counts[key] = 0;
  }
  for (const row of rows) {
    const key = row.last_read_at.slice(0, 10);
    if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts).map(([key, value]) => ({
    label: new Date(key + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    value,
  }));
}

export default async function AdminStatsPage() {
  const supabase = await createClient();

  // Fetch engagement data (last 30 days) + standard stats in parallel
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const [statsRes, { data: readActivity }, { data: commentActivity }] = await Promise.all([
    fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/v1/admin/stats`,
      { cache: 'no-store' }
    ),
    supabase
      .from('reading_progress')
      .select('last_read_at')
      .gte('last_read_at', cutoff.toISOString()),
    supabase
      .from('comments')
      .select('created_at')
      .gte('created_at', cutoff.toISOString()),
  ]);

  let stats: StatsData | null = null;
  if (statsRes.ok) {
    const json = await statsRes.json() as { status: string; data?: StatsData };
    stats = json.data ?? null;
  }

  if (!stats) {
    const [
      { count: manga_count },
      { count: chapter_count },
      { count: user_count },
      { data: top_manga },
      { count: active_ad_providers },
    ] = await Promise.all([
      supabase.from('manga').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('chapters').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('manga').select('id, title, cover_url, views').order('views', { ascending: false }).limit(5),
      supabase.from('ad_providers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ]);
    stats = {
      manga_count: manga_count ?? 0,
      chapter_count: chapter_count ?? 0,
      user_count: user_count ?? 0,
      active_ad_providers: active_ad_providers ?? 0,
      top_manga: (top_manga ?? []) as StatsData['top_manga'],
    };
  }

  const dailyReads = buildDailyBuckets(
    (readActivity ?? []).map(r => ({ last_read_at: r.last_read_at })),
    30
  );
  const dailyComments = buildDailyBuckets(
    (commentActivity ?? []).map(r => ({ last_read_at: r.created_at })),
    30
  );

  const totalReads30 = dailyReads.reduce((s, d) => s + d.value, 0);
  const totalComments30 = dailyComments.reduce((s, d) => s + d.value, 0);

  const topMax = Math.max(...stats.top_manga.map(m => m.views), 1);

  const cards = [
    { label: 'Total Manga', value: stats.manga_count },
    { label: 'Total Chapters', value: stats.chapter_count },
    { label: 'Total Users', value: stats.user_count },
    { label: 'Active Ad Providers', value: stats.active_ad_providers },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
        Site Statistics
      </h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(card => (
          <div
            key={card.label}
            className="rounded-2xl p-5 flex flex-col gap-1"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {card.label}
            </span>
            <span className="text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>
              {card.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Reads */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-secondary)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Daily Reads (last 30 days)
            </h2>
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-primary)' }}>
              {totalReads30.toLocaleString()} total
            </span>
          </div>
          <BarChart data={dailyReads} height={100} />
        </div>

        {/* Daily Comments */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-secondary)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Daily Comments (last 30 days)
            </h2>
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-primary)' }}>
              {totalComments30.toLocaleString()} total
            </span>
          </div>
          <BarChart data={dailyComments} height={100} color="#8B5CF6" />
        </div>
      </div>

      {/* Top Manga */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Top Manga by Views
          </h2>
        </div>
        {stats.top_manga.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No data yet
          </div>
        ) : (
          <div className="px-5 py-3 divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {stats.top_manga.map((m, i) => (
              <HorizontalBar
                key={m.id}
                rank={i + 1}
                label={m.title}
                value={m.views ?? 0}
                max={topMax}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
