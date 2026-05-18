import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const ReportSchema = z.object({
  reason: z.enum(['wrong_info', 'broken_images', 'duplicate', 'inappropriate', 'other']),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as unknown;
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { data: manga } = await supabase
    .from('manga')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!manga) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('manga_reports')
    .upsert(
      { user_id: user.id, manga_id: manga.id, reason: parsed.data.reason, notes: parsed.data.notes ?? null, status: 'pending' },
      { onConflict: 'user_id,manga_id' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
