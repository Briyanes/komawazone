import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

/** Generate a human-readable voucher code: OLLUQ-XXXX-XXXX */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusable chars (0/O, 1/I)
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `OLLUQ-${segment()}-${segment()}`;
}

const GenerateSchema = z.object({
  plan: z.enum(['1-month', '3-month', '6-month']),
  count: z.number().int().min(1).max(100),
});

// GET: list all vouchers (with optional filter)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter'); // 'unused' | 'used' | null

  let query = supabase
    .from('vip_codes')
    .select('id, code, plan, created_at, used_at, used_by, users!vip_codes_used_by_fkey(email, username)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (filter === 'unused') {
    query = query.is('used_by', null);
  } else if (filter === 'used') {
    query = query.not('used_by', 'is', null);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'success', data: data ?? [] });
}

// POST: generate batch of voucher codes
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as unknown;
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', error: parsed.error.flatten() }, { status: 400 });
  }

  const { plan, count } = parsed.data;

  // Generate unique codes (retry on collision)
  const codes: { code: string; plan: typeof plan; created_by: string }[] = [];
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 10) {
      const code = generateCode();
      // Check if code already exists in our batch or DB
      if (codes.some(c => c.code === code)) {
        attempts++;
        continue;
      }
      const { data: existing } = await supabase
        .from('vip_codes')
        .select('code')
        .eq('code', code)
        .maybeSingle();
      if (!existing) {
        codes.push({ code, plan, created_by: user.id });
        break;
      }
      attempts++;
    }
  }

  if (codes.length === 0) {
    return NextResponse.json({ status: 'error', error: 'Failed to generate unique codes' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('vip_codes')
    .insert(codes)
    .select('code, plan');

  if (error) return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });

  return NextResponse.json({
    status: 'success',
    data: data ?? [],
    message: `Berhasil generate ${data?.length ?? 0} kode voucher ${plan}`,
  }, { status: 201 });
}