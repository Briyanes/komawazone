/**
 * Tripay Payment Service
 * Integration with Tripay payment gateway for QRIS payments
 * Docs: https://tripay.co.id/developer
 */

import { createHmac } from 'crypto';

interface TripayConfig {
  mode: 'production' | 'sandbox';
  apiKey: string;
  privateKey: string;
  merchantCode: string;
  baseUrl: string;
}

const isSandbox = process.env.TRIPAY_MODE !== 'production';

const config: TripayConfig = {
  mode: isSandbox ? 'sandbox' : 'production',
  apiKey: process.env.TRIPAY_API_KEY || '',
  privateKey: process.env.TRIPAY_PRIVATE_KEY || '',
  merchantCode: process.env.TRIPAY_MERCHANT_CODE || '',
  // Sandbox uses /api-sandbox/, production uses /api/
  baseUrl: isSandbox
    ? 'https://tripay.co.id/api-sandbox'
    : 'https://tripay.co.id/api',
};

interface TransactionRequest {
  userId: string;
  plan: string;
  amount: number;
  userEmail?: string;
  userName?: string;
}

/**
 * Create HMAC-SHA256 signature for Tripay API transaction requests.
 * Format: HMAC-SHA256(merchantCode + merchantRef + amount, privateKey)
 */
function createSignature(merchantRef: string, amount: number): string {
  return createHmac('sha256', config.privateKey)
    .update(config.merchantCode + merchantRef + amount)
    .digest('hex');
}

/**
 * Create QRIS payment transaction via Tripay
 */
export async function createQRISPayment(params: TransactionRequest): Promise<{
  success: boolean;
  data?: {
    orderId: string;
    tripayReference: string;
    paymentUrl: string;
    qrString: string;
    expiresAt: string;
  };
  error?: string;
}> {
  try {
    const orderId = `OLLUQ-VIP-${params.userId}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const expiredTime = Math.floor(Date.now() / 1000) + 86400;

    const tripayPayload = {
      method: 'QRIS',
      merchant_ref: orderId,
      amount: params.amount,
      customer_name: params.userName || 'OLLUQ User',
      customer_email: params.userEmail || 'user@olluq.com',
      order_items: [
        {
          sku: `VIP-${params.plan}`,
          name: `OLLUQ VIP Subscription - ${params.plan}`,
          price: params.amount,
          quantity: 1,
        },
      ],
      signature: createSignature(orderId, params.amount),
      expired_time: expiredTime,
    };

    const response = await fetch(`${config.baseUrl}/transaction/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tripayPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tripay API error:', errorText);
      return { success: false, error: 'Failed to create payment transaction' };
    }

    const tripayResponse = await response.json() as {
      success: boolean;
      message?: string;
      data?: {
        reference: string;
        checkout_url?: string;
        payment_url?: string;
        qr_string?: string;
        qr_url?: string;
      };
    };

    if (!tripayResponse.success) {
      return {
        success: false,
        error: tripayResponse.message || 'Payment creation failed',
      };
    }

    const paymentData = tripayResponse.data!;

    return {
      success: true,
      data: {
        orderId,
        tripayReference: paymentData.reference,
        paymentUrl: paymentData.checkout_url || paymentData.payment_url || '',
        qrString: paymentData.qr_string || paymentData.qr_url || '',
        expiresAt,
      },
    };
  } catch (error) {
    console.error('Payment creation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get payment status from Tripay using Tripay's transaction reference
 */
export async function getPaymentStatus(tripayReference: string): Promise<{
  success: boolean;
  data?: {
    status: string;
    paymentChannel?: string;
    paidAt?: string;
  };
  error?: string;
}> {
  try {
    const response = await fetch(
      `${config.baseUrl}/transaction/detail?reference=${encodeURIComponent(tripayReference)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Failed to get payment status' };
    }

    const tripayResponse = await response.json() as {
      success: boolean;
      message?: string;
      data?: {
        status: string;
        payment_method?: string;
        paid_at?: number | string | null;
      };
    };

    if (!tripayResponse.success) {
      return {
        success: false,
        error: tripayResponse.message || 'Failed to get status',
      };
    }

    const transaction = tripayResponse.data!;
    const paidAt = transaction.paid_at
      ? typeof transaction.paid_at === 'number'
        ? new Date(transaction.paid_at * 1000).toISOString()
        : String(transaction.paid_at)
      : undefined;

    return {
      success: true,
      data: {
        status: transaction.status,
        paymentChannel: transaction.payment_method,
        paidAt,
      },
    };
  } catch (error) {
    console.error('Payment status check error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Verify Tripay webhook callback signature.
 * Tripay sends the signature in the X-Callback-Signature HTTP header.
 * Verification: HMAC-SHA256(rawBody, privateKey) must match the header value.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const calculated = createHmac('sha256', config.privateKey)
    .update(rawBody)
    .digest('hex');
  return calculated.toLowerCase() === signature.toLowerCase();
}

/**
 * Calculate VIP expiry date based on plan
 */
export function calculateVIPExpiry(plan: string): Date {
  const durationDays: Record<string, number> = {
    '1-month': 30,
    '3-month': 90,
    '6-month': 180,
  };

  const days = durationDays[plan] || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Parse plan name to plan code
 */
export function parsePlanName(planName: string): string {
  const planMap: Record<string, string> = {
    '1 Bulan': '1-month',
    '3 Bulan': '3-month',
    '6 Bulan': '6-month',
    '1-month': '1-month',
    '3-month': '3-month',
    '6-month': '6-month',
  };

  return planMap[planName] || '1-month';
}

/**
 * Format plan code to display name
 */
export function formatPlanName(planCode: string): string {
  const planMap: Record<string, string> = {
    '1-month': '1 Bulan',
    '3-month': '3 Bulan',
    '6-month': '6 Bulan',
  };

  return planMap[planCode] || planCode;
}

/**
 * Validate plan pricing
 */
export function validatePlanPricing(plan: string, amount: number): boolean {
  const planPrices: Record<string, number> = {
    '1-month': 15000,
    '3-month': 40000,
    '6-month': 75000,
  };

  return planPrices[plan] === amount;
}

/**
 * Get plan price
 */
export function getPlanPrice(plan: string): number {
  const planPrices: Record<string, number> = {
    '1-month': 15000,
    '3-month': 40000,
    '6-month': 75000,
  };

  return planPrices[plan] || 15000;
}
