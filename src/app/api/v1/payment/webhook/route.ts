import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyWebhookSignature, calculateVIPExpiry } from '@/lib/payment/tripay';

/**
 * POST /api/v1/payment/webhook
 * Handle Tripay payment notifications (webhooks)
 * This endpoint is called by Tripay when payment status changes
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const rawBody = await req.text();

    if (!rawBody) {
      return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
    }

    // Tripay sends signature in X-Callback-Signature header
    const callbackSignature = req.headers.get('x-callback-signature') ?? '';
    const callbackEvent = req.headers.get('x-callback-event');

    // Only handle payment_status events
    if (callbackEvent && callbackEvent !== 'payment_status') {
      return NextResponse.json({ success: true, message: 'Event ignored' });
    }

    // Verify webhook signature against raw body
    if (!verifyWebhookSignature(rawBody, callbackSignature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Extract Tripay webhook data
    const {
      reference,
      merchant_ref,
      status,
      amount,
      payment_method,
      payment_channel,
      paid_at,
    } = payload as {
      reference: string;
      merchant_ref: string;
      status: string;
      amount: number;
      payment_method?: string;
      payment_channel?: string;
      paid_at?: number | null;
    };

    if (!reference || !status || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find payment by Tripay reference
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('tripay_transaction_id', reference)
      .single();

    if (!payment) {
      console.error('Payment not found for reference:', reference, 'merchant_ref:', merchant_ref);
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Prevent duplicate processing
    if (payment.payment_status !== 'pending') {
      return NextResponse.json({ success: true, message: 'Payment already processed' });
    }

    const normalizedStatus = (status as string).toUpperCase();

    if (normalizedStatus === 'PAID') {
      await supabase
        .from('payments')
        .update({
          payment_status: 'paid',
          payment_channel: payment_channel || payment_method,
          tripay_status: status,
          paid_at: paid_at
            ? new Date(paid_at * 1000).toISOString()
            : new Date().toISOString(),
        })
        .eq('id', payment.id);

      const metadata = payment.metadata as { plan?: string } | null;
      const plan = metadata?.plan || '1-month';
      const expiresAt = calculateVIPExpiry(plan);

      const { data: subscription } = await supabase
        .from('subscriptions')
        .insert({
          user_id: payment.user_id,
          plan: 'vip',
          amount: payment.amount,
          started_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          status: 'active',
          payment_method: payment_channel || payment_method,
          payment_id: payment.id,
        })
        .select()
        .single();

      if (!subscription) {
        throw new Error('Failed to create subscription');
      }

      const { error: userUpdateError } = await supabase
        .from('users')
        .update({ vip_expires_at: expiresAt.toISOString() })
        .eq('id', payment.user_id);

      if (userUpdateError) {
        throw new Error('Failed to update user VIP status');
      }

      console.log('Payment successful:', {
        paymentId: payment.id,
        userId: payment.user_id,
        reference,
        amount,
        plan,
      });

      return NextResponse.json({ success: true, message: 'Payment processed successfully' });
    }

    if (normalizedStatus === 'FAILED' || normalizedStatus === 'EXPIRED') {
      const failedStatus = normalizedStatus.toLowerCase() as 'failed' | 'expired';
      await supabase
        .from('payments')
        .update({ payment_status: failedStatus, tripay_status: status })
        .eq('id', payment.id);

      console.log('Payment failed/expired:', { paymentId: payment.id, reference, status });
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
