import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPaymentStatus, calculateVIPExpiry } from '@/lib/payment/tripay';

/**
 * GET /api/v1/payment/status
 * Check payment status by payment ID or order ID
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { status: 'error', error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const paymentId = searchParams.get('id');
    const orderId = searchParams.get('order_id');

    if (!paymentId && !orderId) {
      return NextResponse.json(
        { status: 'error', error: 'Payment ID or Order ID is required' },
        { status: 400 }
      );
    }

    let paymentData;
    let tripayOrderId;

    // Get payment from database
    if (paymentId) {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .eq('user_id', user.id)
        .single();

      paymentData = data;
      tripayOrderId = data?.tripay_transaction_id;
    } else if (orderId) {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('tripay_transaction_id', orderId)
        .eq('user_id', user.id)
        .single();

      paymentData = data;
      tripayOrderId = orderId;
    }

    if (!paymentData) {
      return NextResponse.json(
        { status: 'error', error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Check if payment is already paid
    if (paymentData.payment_status === 'paid') {
      return NextResponse.json({
        status: 'success',
        data: {
          payment_status: 'paid',
          payment_channel: paymentData.payment_channel,
          paid_at: paymentData.paid_at,
          subscription_id: paymentData.subscription_id,
        },
      });
    }

    // Check payment status from Tripay if not paid
    if (tripayOrderId) {
      const tripayStatus = await getPaymentStatus(tripayOrderId);

      if (tripayStatus.success && tripayStatus.data) {
        const normalizedStatus = tripayStatus.data.status.toUpperCase();

        // Payment is PAID on Tripay but webhook hasn't fired yet — activate VIP now
        if (normalizedStatus === 'PAID' && paymentData.payment_status === 'pending') {
          const metadata = paymentData.metadata as { plan?: string } | null;
          const plan = metadata?.plan || '1-month';
          const expiresAt = calculateVIPExpiry(plan);

          // Update payment record
          const { data: updatedPayment } = await supabase
            .from('payments')
            .update({
              payment_status: 'paid',
              payment_channel: tripayStatus.data.paymentChannel,
              paid_at: tripayStatus.data.paidAt || new Date().toISOString(),
              tripay_status: tripayStatus.data.status,
            })
            .eq('id', paymentData.id)
            .select()
            .single();

          if (updatedPayment) {
            // Create subscription if it doesn't exist yet
            const { data: existingSub } = await supabase
              .from('subscriptions')
              .select('id')
              .eq('payment_id', paymentData.id)
              .maybeSingle();

            if (!existingSub) {
              await supabase.from('subscriptions').insert({
                user_id: paymentData.user_id,
                plan: 'vip',
                amount: paymentData.amount,
                started_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                status: 'active',
                payment_method: tripayStatus.data.paymentChannel,
                payment_id: paymentData.id,
              });
            }

            // Update user VIP status
            await supabase
              .from('users')
              .update({ vip_expires_at: expiresAt.toISOString() })
              .eq('id', paymentData.user_id);

            paymentData = updatedPayment;
          }
        }

        return NextResponse.json({
          status: 'success',
          data: {
            payment_status: normalizedStatus === 'PAID' ? 'paid'
              : normalizedStatus === 'FAILED' ? 'failed'
              : normalizedStatus === 'EXPIRED' ? 'expired'
              : tripayStatus.data.status.toLowerCase(),
            payment_channel: tripayStatus.data.paymentChannel,
            paid_at: tripayStatus.data.paidAt,
            subscription_id: paymentData?.subscription_id,
          },
        });
      }
    }

    // Return current payment status
    return NextResponse.json({
      status: 'success',
      data: {
        payment_status: paymentData.payment_status,
        payment_channel: paymentData.payment_channel,
        paid_at: paymentData.paid_at,
        subscription_id: paymentData.subscription_id,
        expired_at: paymentData.expired_at,
      },
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Internal server error' },
      { status: 500 }
    );
  }
}
