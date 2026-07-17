import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/service';
async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

const CreateGenreSchema = z.object({
  name: z.string().min(1).max(50),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens'),
  description: z.string().max(200).optional().nullable(),
  is_mature: z.boolean().default(false),
});

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('genres')
    .select('id, name, slug, description, is_mature')
    .order('name');
  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json() as unknown;
  const parsed = CreateGenreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', error: parsed.error.flatten() }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('genres')
    .insert(parsed.data)
    .select()
    .single();
  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data }, { status: 201 });
}
