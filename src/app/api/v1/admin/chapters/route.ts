import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { Database } from '@/types/database';

type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];

const ChapterImageSchema = z.object({
  image_url: z.string().url(),
  number: z.number().int().min(1),
});

const ChapterCreateSchema = z.object({
  manga_id: z.string().uuid(),
  number: z.number().min(0),
  title: z.string().optional(),
  thumbnail_url: z.string().url().optional().nullable(),
  release_date: z.string().datetime({ offset: true }).optional().nullable(),
  images: z.array(ChapterImageSchema).min(1),
});

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const mangaId = searchParams.get('manga_id');
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const limit = Math.min(100, Number(searchParams.get('limit') ?? 50));
  const from = (page - 1) * limit;

  let query = supabase
    .from('chapters')
    .select('id, manga_id, chapter_number, title, views, created_at', { count: 'exact' })
    .is('deleted_at', null)
    .order('chapter_number', { ascending: false })
    .range(from, from + limit - 1);

  if (mangaId) {
    query = query.eq('manga_id', mangaId);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: 'success',
    data,
    meta: { total: count ?? 0, page, limit },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as unknown;
  const parsed = ChapterCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { manga_id, number, title, thumbnail_url, release_date, images } = parsed.data;

  // Insert chapter
  const { data: chapter, error: chErr } = await supabase
    .from('chapters')
    .insert({
      manga_id,
      number,
      title: title ?? null,
      thumbnail_url: thumbnail_url ?? null,
      release_date: release_date ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (chErr) {
    return NextResponse.json({ status: 'error', error: chErr.message }, { status: 500 });
  }

  // Insert chapter images in batch
  const imageRows = images.map(img => ({
    chapter_id: chapter.id,
    image_url: img.image_url,
    number: img.number,
  }));

  const { error: imgErr } = await supabase.from('chapter_images').insert(imageRows);
  if (imgErr) {
    // Rollback chapter on images failure
    await supabase.from('chapters').delete().eq('id', chapter.id);
    return NextResponse.json({ status: 'error', error: imgErr.message }, { status: 500 });
  }

  // Notify users who bookmarked OR are actively reading this manga (fire-and-forget)
  void (async () => {
    try {
      const { data: manga } = await supabase
        .from('manga')
        .select('title, slug')
        .eq('id', manga_id)
        .single();
      if (!manga) return;

      // Collect unique user_ids from bookmarks + reading_list(reading)
      const [{ data: bookmarks }, { data: readers }] = await Promise.all([
        supabase.from('bookmarks').select('user_id').eq('manga_id', manga_id),
        supabase.from('reading_list').select('user_id').eq('manga_id', manga_id).eq('status', 'reading'),
      ]);

      const seen = new Set<string>();
      const allUsers = [...(bookmarks ?? []), ...(readers ?? [])].filter(r => {
        if (seen.has(r.user_id)) return false;
        seen.add(r.user_id);
        return true;
      });

      if (!allUsers.length) return;

      const chTitle = title ? `Ch. ${number}: ${title}` : `Chapter ${number}`;
      const notifRows: NotificationInsert[] = allUsers.map(b => ({
        user_id:    b.user_id,
        type:       'new_chapter',
        title:      `Chapter baru: ${manga.title}`,
        body:       chTitle,
        manga_id,
        chapter_id: chapter.id,
      }));
      await supabase.from('notifications').insert(notifRows);
    } catch {
      // Non-critical: notifications are best-effort
    }
  })();

  return NextResponse.json({ status: 'success', data: chapter }, { status: 201 });
}
