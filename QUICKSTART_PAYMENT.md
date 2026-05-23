# ⚡ Quick Start - QRISS Payment System

## 🚀 Get Payment Working in 10 Minutes

### Step 1: Register Tripay (3 minutes)
1. Go to: https://tripay.co.id/developer
2. Click "Daftar Sekarang"
3. Fill form with email, password, phone
4. Verify email
5. Login

### Step 2: Get Credentials (2 minutes)
1. Go to: Integration → API Configuration
2. Copy these 3 things:
   - `API Key`: "SB-Mtd-xxxxx"
   - `Private Key`: "xxxxx-xxxxx-xxxxx-xxxxx"
   - `Merchant Code`: "Txxxxx"

### Step 3: Configure .env.local (1 minute)
```bash
TRIPAY_MODE=sandbox
TRIPAY_API_KEY=your_actual_api_key_here
TRIPAY_PRIVATE_KEY=your_actual_private_key_here
TRIPAY_MERCHANT_CODE=your_actual_merchant_code_here
```

### Step 4: Run Migration (1 minute)
```bash
npx supabase db push
```

### Step 5: Restart Server (1 minute)
```bash
# Stop server (Ctrl+C)
npm run dev
```

### Step 6: Test (2 minutes)
1. Visit: http://localhost:3000/vip
2. Click "QRIS Instant"
3. Select any plan
4. QR code modal appears! ✅

---

## ✅ Success! 

The payment system is now live. The QR code will be displayed for users to scan.

**For Webhook Testing**: See `QRISS_TESTING_GUIDE.md`

**For Production Deployment**: See `TRIPAY_SETUP_GUIDE.md`

**For Complete Implementation Details**: See `QRISS_IMPLEMENTATION_SUMMARY.md`
