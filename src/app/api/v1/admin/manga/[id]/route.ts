import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const MangaUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  alt_title: z.string().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  artist: z.string().optional(),
  cover_url: z.string().url().optional().or(z.literal('')),
  banner_url: z.string().url().optional().or(z.literal('')),
  status: z.enum(['ONGOING', 'COMPLETED', 'HIATUS', 'DROPPED']).optional(),
  type: z.enum(['MANGA', 'MANHWA', 'MANHUA', 'WEBTOON']).optional(),
  genres: z.array(z.string()).optional(),
  release_year: z.number().int().min(1900).max(2100).optional(),
  rating: z.number().min(0).max(10).optional(),
  is_featured: z.boolean().optional(),
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

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json() as unknown;
  const parsed = MangaUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates = { ...parsed.data } as Record<string, unknown>;
  if ('cover_url' in updates && updates.cover_url === '') updates.cover_url = null;
  if ('banner_url' in updates && updates.banner_url === '') updates.banner_url = null;

  const { data, error } = await supabase
    .from('manga')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(updates as any)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ status: 'error', error: 'Slug already exists. Please use a different slug.' }, { status: 409 });
    }
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'success', data });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { error } = await supabase
    .from('manga')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'success' });
}
