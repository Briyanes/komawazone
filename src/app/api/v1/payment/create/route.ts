import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createQRISPayment, parsePlanName } from '@/lib/payment/tripay';

/**
 * POST /api/v1/payment/create
 * Create new QRIS payment transaction
 */
export async function POST(req: NextRequest) {
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
    const body = await req.json() as { plan: string };

    if (!body.plan) {
      return NextResponse.json(
        { status: 'error', error: 'Plan is required' },
        { status: 400 }
      );
    }

    // Parse plan name
    const planCode = parsePlanName(body.plan);

    // Get plan price
    const planPrices: Record<string, number> = {
      '1-month': 15000,
      '3-month': 40000,
      '6-month': 75000,
    };

    const amount = planPrices[planCode];
    if (!amount) {
      return NextResponse.json(
        { status: 'error', error: 'Invalid plan' },
        { status: 400 }
      );
    }

    // Get user email
    const userEmail = user.email;
    const userName = user.user_metadata?.username || user.email?.split('@')[0] || 'OLLUQ User';

    // Create payment transaction via Tripay
    const payment = await createQRISPayment({
      userId: user.id,
      plan: planCode,
      amount,
      userEmail,
      userName,
    });

    if (!payment.success || !payment.data) {
      return NextResponse.json(
        { status: 'error', error: payment.error || 'Failed to create payment' },
        { status: 500 }
      );
    }

    // Save payment to database
    const { data: paymentData, error: dbError } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        amount,
        payment_method: 'qris',
        tripay_transaction_id: payment.data.orderId,
        tripay_payment_url: payment.data.paymentUrl,
        tripay_qr_string: payment.data.qrString,
        expired_at: payment.data.expiresAt,
        metadata: { plan: planCode },
      })
      .select()
      .single();

    if (dbError || !paymentData) {
      console.error('Failed to save payment:', dbError);
      return NextResponse.json(
        { status: 'error', error: 'Failed to save payment data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'success',
      data: {
        paymentId: paymentData.id,
        orderId: payment.data.orderId,
        paymentUrl: payment.data.paymentUrl,
        qrString: payment.data.qrString,
        expiresAt: payment.data.expiresAt,
        amount,
        plan: planCode,
      },
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Internal server error' },
      { status: 500 }
    );
  }
}
