import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const UpdateSchema = z.object({ role: z.enum(['USER', 'ADMIN']) });

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await assertAdmin(supabase);
  if (!admin) return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as unknown;
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ status: 'error', error: parsed.error.flatten() }, { status: 400 });

  // Prevent admin from demoting themselves
  if (id === admin.id && parsed.data.role !== 'ADMIN')
    return NextResponse.json({ status: 'error', error: 'Cannot demote yourself' }, { status: 400 });

  const { data, error } = await supabase
    .from('users').update({ role: parsed.data.role }).eq('id', id).select('id, role').single();
  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data });
}
