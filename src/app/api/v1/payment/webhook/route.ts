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
    // Get raw body for signature verification
    const rawBody = await req.text();

    if (!rawBody) {
      return NextResponse.json(
        { error: 'Missing request body' },
        { status: 400 }
      );
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // Extract Tripay webhook data
    const {
      reference,
      status,
      amount,
      signature,
      payment_method,
      payment_channel,
      paid_at,
    } = payload;

    if (!reference || !status || !amount || !signature) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const isValidSignature = verifyWebhookSignature(
      reference,
      status,
      amount.toString(),
      signature
    );

    if (!isValidSignature) {
      console.error('Invalid webhook signature for order:', reference);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 403 }
      );
    }

    // Find payment by Tripay transaction ID
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('tripay_transaction_id', reference)
      .single();

    if (!payment) {
      console.error('Payment not found for order:', reference);
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Only process if payment is still pending (prevent duplicate processing)
    if (payment.payment_status !== 'pending') {
      return NextResponse.json({
        success: true,
        message: 'Payment already processed',
      });
    }

    // Handle successful payment
    if (status === 'paid') {
      // Update payment status
      const { data: updatedPayment } = await supabase
        .from('payments')
        .update({
          payment_status: 'paid',
          payment_channel: payment_channel || payment_method,
          tripay_status: status,
          paid_at: paid_at || new Date().toISOString(),
        })
        .eq('id', payment.id)
        .select()
        .single();

      if (!updatedPayment) {
        throw new Error('Failed to update payment status');
      }

      // Get plan from metadata
      const plan = (payment.metadata?.plan as string) || '1-month';
      const expiresAt = calculateVIPExpiry(plan);

      // Create subscription
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

      // Update user VIP status
      const { error: userUpdateError } = await supabase
        .from('users')
        .update({
          vip_expires_at: expiresAt.toISOString(),
        })
        .eq('id', payment.user_id);

      if (userUpdateError) {
        throw new Error('Failed to update user VIP status');
      }

      console.log('Payment successful:', {
        paymentId: payment.id,
        userId: payment.user_id,
        orderId: reference,
        amount,
        plan,
      });

      return NextResponse.json({
        success: true,
        message: 'Payment processed successfully',
      });
    }

    // Handle failed payment
    if (status === 'failed' || status === 'expired') {
      await supabase
        .from('payments')
        .update({
          payment_status: status,
          tripay_status: status,
        })
        .eq('id', payment.id);

      console.log('Payment failed/expired:', {
        paymentId: payment.id,
        userId: payment.user_id,
        orderId: reference,
        status,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook processed',
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
