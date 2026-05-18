import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const MangaCreateSchema = z.object({
  title:        z.string().min(1),
  alt_title:    z.string().optional(),
  slug:         z.string().min(1).regex(/^[a-z0-9-]+$/),
  description:  z.string().optional(),
  author:       z.string().optional(),
  artist:       z.string().optional(),
  cover_url:    z.string().url().optional().or(z.literal('')),
  banner_url:   z.string().url().optional().or(z.literal('')),
  status:       z.enum(['ONGOING', 'COMPLETED', 'HIATUS', 'DROPPED']).default('ONGOING'),
  type:         z.enum(['MANGA', 'MANHWA', 'MANHUA', 'WEBTOON']).default('MANGA'),
  genres:       z.array(z.string()).default([]),
  release_year: z.number().int().min(1900).max(2100).optional(),
  rating:       z.number().min(0).max(10).optional(),
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
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const limit = Math.min(50, Number(searchParams.get('limit') ?? 20));
  const from = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('manga')
    .select('id, title, slug, cover_url, status, type, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

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
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as unknown;
  const parsed = MangaCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { cover_url, banner_url, ...rest } = parsed.data;
  const { data, error } = await supabase
    .from('manga')
    .insert({ ...rest, cover_url: cover_url || null, banner_url: banner_url || null, uploaded_by: user.id } as never)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ status: 'error', error: 'Slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'success', data }, { status: 201 });
}
