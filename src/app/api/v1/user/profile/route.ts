import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { z } from 'zod';
import { rateLimit, RateLimits } from '@/lib/rate-limit';

const updateProfileSchema = z.object({
  username: z.string().min(3).max(30).optional(),
  bio: z.string().max(300).optional(),
  avatar_url: z.string().url().optional(),
});

export async function GET() {
  try {
    // 1. Authenticate with user session (SSR client)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch profile using service role (bypass RLS)
    const serviceClient = createServiceClient();
    let { data, error } = await serviceClient
      .from('users')
      .select('id, email, username, avatar_url, bio, role, created_at, vip_expires_at')
      .eq('id', user.id)
      .single();

    // Auto-create profile row if trigger missed it
    if (error) {
      const username = user.user_metadata?.username ?? user.email?.split('@')[0] ?? 'user';
      const { data: newRow, error: insertErr } = await serviceClient
        .from('users')
        .upsert({ id: user.id, email: user.email!, username })
        .select('id, email, username, avatar_url, bio, role, created_at, vip_expires_at')
        .single();
      if (insertErr) throw insertErr;
      data = newRow;
    }

    return NextResponse.json({ status: 'success', data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  // Rate limit: 20 profile updates per minute
  const rateLimitResult = await rateLimit(request, RateLimits.userAction);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { status: 'error', error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
        },
      }
    );
  }

  try {
    // 1. Authenticate with user session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', error: parsed.error.flatten() }, { status: 400 });
    }

    // 2. Update profile using service role (bypass RLS)
    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from('users')
      .update(parsed.data)
      .eq('id', user.id);

    if (error) throw error;
    return NextResponse.json({ status: 'success' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}