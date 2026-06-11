import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/v1/vip/redeem
 * Redeem a VIP voucher code
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Must be authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { code?: string };
  const code = body.code?.trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: 'Kode voucher harus diisi' }, { status: 400 });
  }

  // Look up the voucher code
  const { data: voucher, error: fetchError } = await supabase
    .from('vip_codes')
    .select('*')
    .eq('code', code)
    .single();

  if (fetchError || !voucher) {
    return NextResponse.json({ error: 'Kode voucher tidak valid' }, { status: 404 });
  }

  // Check if already used
  if (voucher.used_by) {
    return NextResponse.json({ error: 'Kode voucher sudah pernah digunakan' }, { status: 400 });
  }

  // Calculate VIP expiry
  const durationDays: Record<string, number> = {
    '1-month': 30,
    '3-month': 90,
    '6-month': 180,
  };
  const days = durationDays[voucher.plan] || 30;

  // Check if user already has VIP — extend from current expiry or from now
  const { data: userData } = await supabase
    .from('users')
    .select('vip_expires_at')
    .eq('id', user.id)
    .single();

  const currentExpiry = (userData as { vip_expires_at?: string | null } | null)?.vip_expires_at;
  const now = new Date();
  const baseDate = currentExpiry && new Date(currentExpiry) > now
    ? new Date(currentExpiry)
    : now;
  const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

  // Mark voucher as used
  const { error: updateVoucherError } = await supabase
    .from('vip_codes')
    .update({
      used_by: user.id,
      used_at: new Date().toISOString(),
    })
    .eq('id', voucher.id)
    .is('used_by', null); // Extra safety: only update if not yet used

  if (updateVoucherError) {
    return NextResponse.json({ error: 'Gagal menukar kode. Coba lagi.' }, { status: 500 });
  }

  // Update user VIP expiry
  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ vip_expires_at: newExpiry.toISOString() })
    .eq('id', user.id);

  if (userUpdateError) {
    console.error('Failed to update VIP:', userUpdateError);
    return NextResponse.json({ error: 'Gagal mengaktifkan VIP. Hubungi admin.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `VIP berhasil diaktifkan! Berlaku hingga ${newExpiry.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    plan: voucher.plan,
    expiresAt: newExpiry.toISOString(),
  });
}