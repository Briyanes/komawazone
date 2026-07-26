import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/auth/admin-log';
import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/service';
const UpdateSchema = z.object({ role: z.enum(['USER', 'ADMIN']) });

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const serviceClient = createServiceClient();
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

  const { data, error } = await serviceClient
    .from('users').update({ role: parsed.data.role }).eq('id', id).select('id, role').single();
  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data });
}

// DELETE: hard-delete a user (auth.users + public.users)
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await assertAdmin(supabase);
  if (!admin) return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });

  // Guard 1: prevent self-delete
  if (id === admin.id)
    return NextResponse.json({ status: 'error', error: 'Anda tidak bisa menghapus akun sendiri' }, { status: 400 });

  const adminClient = createAdminClient();
  const serviceClient = createServiceClient();

  // Guard 2: prevent deleting other admins
  const { data: target } = await serviceClient
    .from('users').select('role, email').eq('id', id).single();
  if (target?.role === 'ADMIN')
    return NextResponse.json({ status: 'error', error: 'Tidak bisa menghapus admin lain. Demote dulu.' }, { status: 400 });

  // Step 1: delete auth user (cascades to public.users if FK CASCADE is set)
  const { error: authError } = await adminClient.auth.admin.deleteUser(id);
  if (authError) {
    // Fallback: try deleting public.users row directly
    const { error: dbError } = await adminClient.from('users').delete().eq('id', id);
    if (dbError)
      return NextResponse.json({ status: 'error', error: `Auth: ${authError.message} | DB: ${dbError.message}` }, { status: 500 });
  }

  // Step 2: cleanup orphaned public.users row (in case auth delete didn't cascade)
  await adminClient.from('users').delete().eq('id', id);

  // Log the action
  logAdminAction({
    admin,
    action: 'DELETE',
    entity: 'user',
    entityId: id,
    method: 'DELETE',
    path: req.nextUrl.pathname,
    status: 200,
    details: { deleted_email: target?.email ?? 'unknown' },
  });

  return NextResponse.json({ status: 'success', data: { id } });
}
