import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { Database } from '@/types/database';

type SourceInsert = Database['public']['Tables']['manga_sources']['Insert'];

const SourceSchema = z.object({
  name: z.string().min(1).max(100),
  base_url: z.string().url(),
  sitemap_urls: z.array(z.string().url()).min(1),
  is_active: z.boolean().default(true),
  type: z.enum(['MANHWA', 'MANGA', 'MANHUA', 'MIXED']).default('MANHWA'),
  content_rating: z.enum(['general', 'mature']).default('general'),
  notes: z.string().max(500).optional().nullable(),
});

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('manga_sources')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as unknown;
  const parsed = SourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const insert: SourceInsert = {
    name: parsed.data.name,
    base_url: parsed.data.base_url,
    sitemap_urls: parsed.data.sitemap_urls,
    is_active: parsed.data.is_active,
    type: parsed.data.type,
    content_rating: parsed.data.content_rating,
    notes: parsed.data.notes ?? null,
  };

  const { data, error } = await supabase
    .from('manga_sources')
    .insert(insert)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'base_url sudah ada' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'success', data }, { status: 201 });
}
