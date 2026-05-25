import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { Database } from '@/types/database';

type AdProviderUpdate = Database['public']['Tables']['ad_providers']['Update'];

const ProviderPatchSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['BANNER', 'PIXEL', 'CUSTOM_HTML', 'NATIVE']).optional(),
  pixel_code: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
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
  const parsed = ProviderPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates = { ...parsed.data };
  const updateData: AdProviderUpdate = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.pixel_code !== undefined) updateData.pixel_code = updates.pixel_code;
  if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

  const { data, error } = await supabase
    .from('ad_providers')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
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
  const { error } = await supabase.from('ad_providers').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'success' });
}
