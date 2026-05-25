import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { Database } from '@/types/database';

type SourceUpdate = Database['public']['Tables']['manga_sources']['Update'];

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sitemap_urls: z.array(z.string().url()).min(1).optional(),
  is_active: z.boolean().optional(),
  type: z.enum(['MANHWA', 'MANGA', 'MANHUA', 'MIXED']).optional(),
  notes: z.string().max(500).optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as unknown;
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const update: SourceUpdate = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.sitemap_urls !== undefined) update.sitemap_urls = parsed.data.sitemap_urls;
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
  if (parsed.data.type !== undefined) update.type = parsed.data.type;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;

  const { data, error } = await supabase
    .from('manga_sources')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { error } = await supabase.from('manga_sources').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success' });
}
