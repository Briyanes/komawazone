import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const CampaignPatchSchema = z.object({
  is_active: z.boolean().optional(),
  html_content: z.string().optional().nullable(),
  priority: z.number().int().min(0).optional(),
  image_url: z.string().url().optional().nullable(),
  link_url: z.string().url().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  target_mobile: z.boolean().optional(),
  target_desktop: z.boolean().optional(),
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
  const parsed = CampaignPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updatePayload = parsed.data as Record<string, unknown>;

  const { data, error } = await (supabase
    .from('ad_campaigns') as unknown as {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          select: () => { single: () => Promise<{ data: unknown; error: { message: string } | null }> };
        };
      };
    })
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single() as unknown as { data: unknown; error: { message: string } | null };

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
  const { error } = await supabase.from('ad_campaigns').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'success' });
}
