import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const EventSchema = z.object({
  campaign_id: z.string().uuid(),
  event: z.enum(['impression', 'click']),
  placement: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json() as unknown;
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', error: 'Invalid payload' }, { status: 400 });
  }

  const { campaign_id, event } = parsed.data;
  const supabase = await createClient();

  const ua = request.headers.get('user-agent') ?? '';

  // Insert analytics event row (fire-and-forget, non-critical)
  await supabase.from('ad_analytics').insert({
    campaign_id,
    event: event as 'impression' | 'click',
    user_agent: ua || null,
  });

  return NextResponse.json({ status: 'ok' });
}
