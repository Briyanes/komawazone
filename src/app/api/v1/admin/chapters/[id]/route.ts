import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const ChapterUpdateSchema = z.object({
  number: z.number().min(0).optional(),
  title: z.string().optional().nullable(),
  thumbnail_url: z.string().url().optional().nullable(),
  release_date: z.string().optional().nullable(),
});

const ImageAddSchema = z.object({
  action: z.literal('add_images'),
  images: z.array(z.object({
    image_url: z.string().url(),
    number: z.number().int().min(1),
    width: z.number().optional(),
    height: z.number().optional(),
  })).min(1),
});

const ImageDeleteSchema = z.object({
  action: z.literal('delete_image'),
  image_id: z.string().uuid(),
});

const ImageReorderSchema = z.object({
  action: z.literal('reorder_images'),
  order: z.array(z.object({ id: z.string().uuid(), number: z.number().int().min(1) })),
});

const PatchBodySchema = z.discriminatedUnion('action', [
  ImageAddSchema,
  ImageDeleteSchema,
  ImageReorderSchema,
]).or(ChapterUpdateSchema);

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  if (!await assertAdmin(supabase))
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });

  const { data: chapter, error } = await supabase
    .from('chapters')
    .select('id, manga_id, number, title, views, release_date, manga:manga(id, title, slug)')
    .eq('id', id)
    .single();
  if (error || !chapter)
    return NextResponse.json({ status: 'error', error: 'Not found' }, { status: 404 });

  const { data: images } = await supabase
    .from('chapter_images')
    .select('id, number, image_url, width, height')
    .eq('chapter_id', id)
    .order('number', { ascending: true });

  return NextResponse.json({ status: 'success', data: { ...chapter, images: images ?? [] } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  if (!await assertAdmin(supabase))
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as unknown;

  // Try action-based patch first
  const actionParsed = z.object({ action: z.string() }).safeParse(body);
  if (actionParsed.success) {
    const action = actionParsed.data.action;

    if (action === 'add_images') {
      const p = ImageAddSchema.safeParse(body);
      if (!p.success) return NextResponse.json({ status: 'error', error: p.error.flatten() }, { status: 400 });
      const rows = p.data.images.map(img => ({
        chapter_id: id,
        image_url: img.image_url,
        number: img.number,
        width: img.width ?? 0,
        height: img.height ?? 0,
      }));
      const { error } = await supabase.from('chapter_images').insert(rows);
      if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
      return NextResponse.json({ status: 'success' });
    }

    if (action === 'delete_image') {
      const p = ImageDeleteSchema.safeParse(body);
      if (!p.success) return NextResponse.json({ status: 'error', error: p.error.flatten() }, { status: 400 });
      const { error } = await supabase.from('chapter_images').delete().eq('id', p.data.image_id);
      if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
      return NextResponse.json({ status: 'success' });
    }

    if (action === 'reorder_images') {
      const p = ImageReorderSchema.safeParse(body);
      if (!p.success) return NextResponse.json({ status: 'error', error: p.error.flatten() }, { status: 400 });
      // Use raw SQL-style update via rpc or update each row — chapter_images.number field
      await Promise.all(
        p.data.order.map(({ id: imgId, number: num }) =>
          supabase.from('chapter_images').update({ number: num } as never).eq('id', imgId)
        )
      );
      return NextResponse.json({ status: 'success' });
    }
  }

  // Chapter field update
  const parsed = ChapterUpdateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ status: 'error', error: parsed.error.flatten() }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (parsed.data.number !== undefined) updates.number = parsed.data.number;
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.thumbnail_url !== undefined) updates.thumbnail_url = parsed.data.thumbnail_url;
  if (parsed.data.release_date !== undefined) updates.release_date = parsed.data.release_date;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ status: 'error', error: 'No fields to update' }, { status: 400 });

  const { data, error } = await supabase
    .from('chapters').update(updates as never).eq('id', id).select().single();
  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  if (!await assertAdmin(supabase))
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });

  // Delete images first (storage cleanup should be done client-side if needed)
  await supabase.from('chapter_images').delete().eq('chapter_id', id);
  const { error } = await supabase.from('chapters').delete().eq('id', id);
  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success' });
}
