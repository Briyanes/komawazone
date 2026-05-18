import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/cron/notify-chapters
 * Called after a chapter is uploaded (from admin or webhook).
 * Body: { chapter_id: string, manga_id: string }
 *
 * Queries reading_list for all users tracking this manga with status='reading',
 * then batch-inserts notifications for each of them.
 *
 * Protect with CRON_SECRET env var.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { chapter_id?: string; manga_id?: string };
  const { chapter_id, manga_id } = body;
  if (!chapter_id || !manga_id) {
    return NextResponse.json({ error: 'chapter_id and manga_id required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Fetch manga title + chapter number
  const [{ data: manga }, { data: chapter }] = await Promise.all([
    supabase.from('manga').select('title').eq('id', manga_id).single(),
    supabase.from('chapters').select('number, title').eq('id', chapter_id).single(),
  ]);

  if (!manga || !chapter) {
    return NextResponse.json({ error: 'Manga or chapter not found' }, { status: 404 });
  }

  // Find all users reading this manga
  const { data: readers } = await supabase
    .from('reading_list')
    .select('user_id')
    .eq('manga_id', manga_id)
    .eq('status', 'reading');

  if (!readers || readers.length === 0) {
    return NextResponse.json({ status: 'success', notified: 0 });
  }

  const chNum = chapter.number % 1 === 0 ? chapter.number : chapter.number.toFixed(1);
  const title = `Chapter baru: ${manga.title}`;
  const bodyText = `Chapter ${chNum}${chapter.title ? ` — ${chapter.title}` : ''} sudah tersedia!`;

  const notifications = readers.map(r => ({
    user_id:    r.user_id,
    type:       'new_chapter',
    title,
    body:       bodyText,
    manga_id,
    chapter_id,
    read:       false,
  }));

  // Insert in batches of 500 to avoid payload limits
  const BATCH = 500;
  for (let i = 0; i < notifications.length; i += BATCH) {
    await supabase.from('notifications').insert(notifications.slice(i, i + BATCH));
  }

  return NextResponse.json({ status: 'success', notified: notifications.length });
}
