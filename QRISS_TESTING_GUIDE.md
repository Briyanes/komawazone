# 🧪 QRISS Payment Testing Guide - OLLUQ VIP

## 📋 Prerequisites Checklist

Before testing the payment flow, ensure you have:

- [ ] Tripay sandbox account registered
- [ ] API credentials added to `.env.local`
- [ ] Database migration run: `npx supabase db push`
- [ ] Dev server running: `npm run dev`
- [ ] ngrok installed (for webhook testing)
- [ ] Test user account created

---

## 🚀 Local Testing Setup

### Step 1: Configure Environment Variables

Add to `.env.local`:
```bash
TRIPAY_MODE=sandbox
TRIPAY_API_KEY=SB-Mtd-xxxxx
TRIPAY_PRIVATE_KEY=xxxxx-xxxxx-xxxxx-xxxxx
TRIPAY_MERCHANT_CODE=Txxxxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Step 2: Run Database Migration

```bash
# Push payments table to Supabase
npx supabase db push

# Verify table created
npx supabase db remote tables list
```

Expected tables:
- `payments` ✅
- `subscriptions` ✅
- `users` ✅

### Step 3: Setup Ngrok for Webhook Testing

**Install ngrok** (if not installed):
```bash
# macOS via Homebrew
brew install ngrok

# Or download from: https://ngrok.com/download
```

**Start ngrok tunnel**:
```bash
ngrok http 3000
```

Expected output:
```
Forwarding   https://abc123.ngrok.io -> http://localhost:3000
```

**Update Tripay webhook**:
1. Go to: https://tripay.co.id/dashboard/integration/webhook
2. Set webhook URL: `https://abc123.ngrok.io/api/v1/payment/webhook`
3. Save changes

---

## 🧪 Testing Scenarios

### Test 1: Payment Creation Flow

**Steps**:
1. Login as test user: http://localhost:3000/login
2. Visit VIP page: http://localhost:3000/vip
3. Select "QRIS Instant" payment method
4. Click on any plan (e.g., "1 Bulan - Rp 15.000")
5. Verify modal opens with QR code

**Expected Results**:
- ✅ Modal displays with QR code
- ✅ Payment amount matches plan price
- ✅ Countdown timer starts (24h expiry)
- ✅ Payment instructions displayed
- ✅ Status polling begins (every 5 seconds)
- ✅ No console errors

**Database Verification**:
```sql
SELECT * FROM payments WHERE user_id = 'your-user-id' ORDER BY created_at DESC LIMIT 1;
```

Expected:
- `payment_status`: 'pending'
- `payment_method`: 'qris'
- `amount`: 15000 (for 1-month plan)
- `tripay_transaction_id`: populated
- `tripay_payment_url`: populated
- `tripay_qr_string`: populated

---

### Test 2: Payment Status Polling

**Steps**:
1. Keep payment modal open
2. Wait for 5 seconds
3. Observe status updates in modal

**Expected Results**:
- ✅ Status updates every 5 seconds
- ✅ No excessive API calls
- ✅ Graceful error handling if Tripay API is down

**API Verification**:
```bash
# Check status endpoint
curl http://localhost:3000/api/v1/payment/status?paymentId=<payment-id>
```

Expected response:
```json
{
  "success": true,
  "status": "pending",
  "tripayStatus": "paid"
}
```

---

### Test 3: Simulate Successful Payment (Tripay Sandbox)

**Option A: Using Tripay Dashboard Simulator**
1. Go to: https://tripay.co.id/dashboard/transaction/simulator
2. Enter your transaction ID
3. Select status: "paid"
4. Submit simulation

**Option B: Manual Status Update**
```sql
-- Simulate webhook received
UPDATE payments 
SET payment_status = 'paid',
    tripay_status = 'paid',
    paid_at = NOW()
WHERE id = '<payment-id>';

-- Then run webhook logic manually
```

**Expected Results After Payment Success**:
- ✅ Modal closes automatically
- ✅ Success page/message displayed
- ✅ User VIP status activated
- ✅ Subscription record created
- ✅ Redirect to profile or home

**Database Verification**:
```sql
-- Check payment status
SELECT * FROM payments WHERE id = '<payment-id>';

-- Check user VIP status
SELECT vip_status, vip_expires_at FROM users WHERE id = '<user-id>';

-- Check subscription created
SELECT * FROM subscriptions WHERE user_id = '<user-id>' ORDER BY created_at DESC LIMIT 1;
```

Expected:
- `payments.payment_status`: 'paid'
- `payments.paid_at`: timestamp populated
- `users.vip_status`: true
- `users.vip_expires_at`: 30 days from now (for 1-month plan)
- `subscriptions.plan_duration`: 1
- `subscriptions.is_active`: true

---

### Test 4: Webhook Handler

**Steps**:
1. Simulate Tripay webhook call:
```bash
curl -X POST https://abc123.ngrok.io/api/v1/payment/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "OLLUQ-VIP-userid-timestamp",
    "status": "paid",
    "amount": 15000,
    "signature": "calculated_signature_here"
  }'
```

**Expected Results**:
- ✅ Returns 200 OK
- ✅ Signature verification passes
- ✅ VIP status activated
- ✅ Subscription created
- ✅ Payment record updated

**Ngrok Console Verification**:
- Check ngrok console for webhook POST requests
- Verify response code: 200

---

### Test 5: Payment Expiry

**Steps**:
1. Create a new payment
2. Wait for 24 hours (or manually expire in database)
3. Try to access expired payment

**Database Simulation**:
```sql
-- Manually expire payment
UPDATE payments 
SET payment_status = 'expired',
    expired_at = NOW()
WHERE id = '<payment-id>';
```

**Expected Results**:
- ✅ Modal shows "Payment expired" message
- ✅ Option to create new payment
- ✅ No VIP status activated

---

### Test 6: Error Handling

**Test 6a: Invalid API Credentials**
```bash
# Update .env.local with invalid credentials
TRIPAY_API_KEY=invalid_key
```

Expected:
- ✅ Error message shown in modal
- ✅ Clear "Payment creation failed" message
- ✅ Guidance to contact support

**Test 6b: Network Timeout**
- Disconnect internet
- Try to create payment

Expected:
- ✅ Graceful error message
- ✅ No infinite loading
- ✅ Option to retry

**Test 6c: Duplicate Payment**
- Create multiple payments quickly

Expected:
- ✅ Each payment gets unique ID
- ✅ No duplicate database records
- ✅ Proper queue handling

---

### Test 7: VIP Access Verification

**Steps**:
1. Complete a successful payment
2. Navigate to mature content (genre 18+)
3. Verify access granted

**Expected Results**:
- ✅ Can access mature manga pages
- ✅ No "Upgrade to VIP" modal
- ✅ VIP badge shown on profile
- ✅ No ads displayed (if implemented)

---

### Test 8: Payment History Page

**Steps**:
1. Visit: http://localhost:3000/profile/payments
2. Verify all payments displayed

**Expected Results**:
- ✅ All payments listed in reverse chronological order
- ✅ Status badges (paid, pending, expired, failed)
- ✅ Transaction details shown (amount, date, method)
- ✅ Download invoice button for paid payments
- ✅ Filter by status (if implemented)

---

## 🐛 Common Issues & Solutions

### Issue 1: "Payment creation failed"

**Possible Causes**:
- Invalid Tripay API credentials
- Tripay API down
- Network timeout
- Invalid plan code

**Solutions**:
```bash
# Check .env.local loaded
curl http://localhost:3000/api/debug/env

# Test Tripay API connection
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://tripay.co.id/api/transaction/create

# Check server logs
tail -f logs/development.log
```

---

### Issue 2: QR Code Not Displaying

**Possible Causes**:
- Missing `qrcode.react` dependency
- Invalid QR string from Tripay
- Modal state issue

**Solutions**:
```bash
# Check qrcode.react installed
npm list qrcode.react

# If missing, install:
npm install qrcode.react
```

---

### Issue 3: Webhook Not Received

**Possible Causes**:
- Ngrok tunnel closed
- Webhook URL incorrect
- Firewall blocking Tripay
- SSL certificate issue

**Solutions**:
```bash
# Verify ngrok running
curl https://abc123.ngrok.io/api/health

# Test webhook endpoint manually
curl -X POST https://abc123.ngrok.io/api/v1/payment/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check ngrok inspector
# Open: http://localhost:4040
```

---

### Issue 4: VIP Not Activating After Payment

**Possible Causes**:
- Webhook handler not executed
- Database transaction failed
- RLS policy blocking update
- User ID mismatch

**Solutions**:
```sql
-- Check webhook log
SELECT * FROM webhook_logs WHERE payment_id = '<payment-id>';

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'payments';

-- Manually activate VIP
UPDATE users 
SET vip_status = true,
    vip_expires_at = NOW() + INTERVAL '30 days'
WHERE id = '<user-id>';
```

---

## ✅ Pre-Production Checklist

Before going live with production credentials:

- [ ] All sandbox tests passed
- [ ] Error handling tested
- [ ] Database migrations verified
- [ ] Webhook endpoint tested with Tripay
- [ ] VIP activation logic verified
- [ ] Payment history page working
- [ ] Mobile responsiveness tested
- [ ] Console errors cleared
- [ ] Performance optimized
- [ ] Analytics events added
- [ ] Legal documents updated (ToS, Privacy Policy)
- [ ] Support documentation created
- [ ] Admin monitoring dashboard ready

---

## 🚀 Production Deployment

### Step 1: Update Environment Variables

```bash
# Using Vercel CLI
vercel env add TRIPAY_MODE production
vercel env add TRIPAY_API_KEY production_api_key
vercel env add TRIPAY_PRIVATE_KEY production_private_key
vercel env add TRIPAY_MERCHANT_CODE production_merchant_code

# Or update in Vercel Dashboard:
# Project Settings → Environment Variables
```

### Step 2: Update Webhook URL

1. Go to: https://tripay.co.id/dashboard/integration/webhook
2. Update webhook URL: `https://olluq.com/api/v1/payment/webhook`
3. Save changes

### Step 3: Run Production Migration

```bash
# Push migrations to production
npx supabase db push --linked

# Verify tables created
npx supabase db remote tables list
```

### Step 4: Small Amount Test

1. Create test plan for Rp 1.000
2. Complete payment flow
3. Verify webhook received
4. Check VIP activation
5. Monitor for 24 hours

### Step 5: Monitor First Transactions

**Key Metrics to Track**:
- Payment success rate
- Average payment completion time
- Webhook failure rate
- VIP conversion rate
- User feedback

**Monitoring Tools**:
- Supabase logs
- Tripay dashboard
- Vercel Analytics
- Error tracking (Sentry)

---

## 📊 Success Metrics

Track these metrics for 30 days post-launch:

**Conversion Metrics**:
- % of free users visiting VIP page
- % completing payment flow
- % of successful payments
- Average time from visit to payment

**Technical Metrics**:
- API response time (< 2s)
- Webhook success rate (> 99%)
- Modal load time (< 1s)
- Payment status polling accuracy

**User Metrics**:
- VIP renewal rate
- Payment history page visits
- Support tickets related to payments
- User satisfaction score

---

## 📞 Support & Resources

**Tripay Resources**:
- Documentation: https://tripay.co.id/developer
- API Reference: https://tripay.co.id/developer/documentation
- Dashboard: https://tripay.co.id/dashboard
- Support: support@tripay.co.id

**OLLUQ Resources**:
- Setup Guide: `TRIPAY_SETUP_GUIDE.md`
- Migration: `supabase/migrations/019_payments_table.sql`
- Payment Service: `src/lib/payment/tripay.ts`

---

**Status**: Ready for testing! 🧪

Complete all tests above before deploying to production.
