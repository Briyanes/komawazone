import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { Database } from '@/types/database';

import { createServiceClient } from '@/lib/supabase/service';
type MangaUpdate = Database['public']['Tables']['manga']['Update'];

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
  content_rating: z.enum(['general', 'mature']).optional(),
});

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await serviceClient
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

  const updates = { ...parsed.data };
  const updateData: MangaUpdate = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.alt_title !== undefined) updateData.alt_title = updates.alt_title;
  if (updates.slug !== undefined) updateData.slug = updates.slug;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.author !== undefined) updateData.author = updates.author;
  if (updates.artist !== undefined) updateData.artist = updates.artist;
  if (updates.cover_url !== undefined) updateData.cover_url = updates.cover_url || null;
  if (updates.banner_url !== undefined) updateData.banner_url = updates.banner_url || null;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.genres !== undefined) updateData.genres = updates.genres;
  if (updates.release_year !== undefined) updateData.release_year = updates.release_year;
  if (updates.rating !== undefined) updateData.rating = updates.rating;
  if (updates.is_featured !== undefined) updateData.is_featured = updates.is_featured;
  if (updates.content_rating !== undefined) updateData.content_rating = updates.content_rating;

  const { data, error } = await supabase
    .from('manga')
    .update(updateData)
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
