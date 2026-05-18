import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/v1/admin/analytics
 * Returns daily stats for last 30 days: chapters uploaded, views trend.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Last 30 days chapters per day
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: chapters } = await supabase
    .from('chapters')
    .select('release_date')
    .gte('release_date', since)
    .order('release_date', { ascending: true });

  // Last 30 days new users per day
  const { data: users } = await supabase
    .from('users')
    .select('created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  // Build daily buckets
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }

  const chaptersByDay = Object.fromEntries(days.map(d => [d, 0]));
  const usersByDay    = Object.fromEntries(days.map(d => [d, 0]));

  for (const ch of chapters ?? []) {
    const day = (ch.release_date as string).slice(0, 10);
    if (day in chaptersByDay) chaptersByDay[day]++;
  }
  for (const u of users ?? []) {
    const day = (u.created_at as string).slice(0, 10);
    if (day in usersByDay) usersByDay[day]++;
  }

  return NextResponse.json({
    status: 'success',
    data: days.map(d => ({
      date: d,
      chapters: chaptersByDay[d],
      users: usersByDay[d],
    })),
  });
}
