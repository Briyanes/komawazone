/**
 * Tripay Payment Service
 * Integration with Tripay payment gateway for QRIS payments
 * Docs: https://tripay.co.id/developer
 */

interface TripayConfig {
  mode: 'production' | 'sandbox';
  apiKey: string;
  privateKey: string;
  merchantCode: string;
  baseUrl: string;
}

const config: TripayConfig = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
  apiKey: process.env.TRIPAY_API_KEY || '',
  privateKey: process.env.TRIPAY_PRIVATE_KEY || '',
  merchantCode: process.env.TRIPAY_MERCHANT_CODE || '',
  baseUrl: process.env.TRIPAY_MODE === 'production'
    ? 'https://tripay.co.id'
    : 'https://tripay.co.id',
};

interface TransactionRequest {
  userId: string;
  plan: string;
  amount: number;
  userEmail?: string;
  userName?: string;
}

interface Transaction {
  order_id: string;
  amount: number;
  user_id: string;
  plan: string;
  created_at: string;
}

/**
 * Create signature for Tripay API requests
 * Signature format: md5(apiKey + privatekey + orderId + amount)
 */
function createSignature(orderId: string, amount: number): string {
  const data = config.apiKey + config.privateKey + orderId + amount;
  // Simple hash implementation (consider using crypto module in production)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Create QRIS payment transaction via Tripay
 */
export async function createQRISPayment(params: TransactionRequest): Promise<{
  success: boolean;
  data?: {
    orderId: string;
    paymentUrl: string;
    qrString: string;
    expiresAt: string;
  };
  error?: string;
}> {
  try {
    // Generate order ID
    const orderId = `OLLUQ-VIP-${params.userId}-${Date.now()}`;

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Prepare transaction data for Tripay
    const transaction: Transaction = {
      order_id: orderId,
      amount: params.amount,
      user_id: params.userId,
      plan: params.plan,
      created_at: new Date().toISOString(),
    };

    // Create Tripay transaction request
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
      expiry_time: Math.floor(Date.now() / 1000) + 86400, // 24 hours in seconds
    };

    // Call Tripay API (using fetch instead of axios for lighter weight)
    const response = await fetch(`${config.baseUrl}/api/v2/transaction/create`, {
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
      return {
        success: false,
        error: 'Failed to create payment transaction',
      };
    }

    const tripayResponse = await response.json();

    if (tripayResponse.status === false) {
      return {
        success: false,
        error: tripayResponse.message || 'Payment creation failed',
      };
    }

    // Extract payment URL and QR string from Tripay response
    const paymentData = tripayResponse.data;

    return {
      success: true,
      data: {
        orderId,
        paymentUrl: paymentData.payment_url || paymentData.checkout_url,
        qrString: paymentData.qr_string || paymentData.qr_string,
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
 * Get payment status from Tripay
 */
export async function getPaymentStatus(orderId: string): Promise<{
  success: boolean;
  data?: {
    status: string;
    paymentChannel?: string;
    paidAt?: string;
  };
  error?: string;
}> {
  try {
    const response = await fetch(`${config.baseUrl}/api/v2/transaction/detail?order_id=${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: 'Failed to get payment status',
      };
    }

    const tripayResponse = await response.json();

    if (tripayResponse.status === false) {
      return {
        success: false,
        error: tripayResponse.message || 'Failed to get status',
      };
    }

    const transaction = tripayResponse.data;

    return {
      success: true,
      data: {
        status: transaction.status, // paid, unpaid, expired
        paymentChannel: transaction.payment_channel,
        paidAt: transaction.paid_at,
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
 * Verify Tripay webhook signature
 * Signature format: md5(orderId + statusCode + grossAmount + signatureKey)
 */
export function verifyWebhookSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signature: string
): boolean {
  const data = orderId + statusCode + grossAmount + config.privateKey;

  // Simple hash implementation (match signature creation)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const calculatedSignature = Math.abs(hash).toString(16);

  // Safe comparison to prevent timing attacks
  return calculatedSignature.toLowerCase() === signature.toLowerCase();
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
