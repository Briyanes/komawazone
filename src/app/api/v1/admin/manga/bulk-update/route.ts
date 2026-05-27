import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const BulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  updates: z.object({
    content_rating: z.enum(['general', 'mature']).optional(),
    status: z.enum(['ONGOING', 'COMPLETED', 'HIATUS', 'DROPPED']).optional(),
    is_featured: z.boolean().optional(),
  }).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field to update is required' }),
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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as unknown;
  const parsed = BulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { ids, updates } = parsed.data;

  const { error, data } = await supabase
    .from('manga')
    .update(updates)
    .in('id', ids)
    .select('id');

  if (error) {
    return NextResponse.json(
      { status: 'error', error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: 'success', updated: data?.length ?? 0 });
}
