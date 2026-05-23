import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPaymentStatus } from '@/lib/payment/tripay';

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
    const searchParams = await req.nextUrl.searchParams;
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
        // Update payment status if changed
        if (tripayStatus.data.status === 'paid' && paymentData.payment_status === 'pending') {
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

          paymentData = updatedPayment;
        }

        return NextResponse.json({
          status: 'success',
          data: {
            payment_status: tripayStatus.data.status,
            payment_channel: tripayStatus.data.paymentChannel,
            paid_at: tripayStatus.data.paidAt,
            subscription_id: paymentData.subscription_id,
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
