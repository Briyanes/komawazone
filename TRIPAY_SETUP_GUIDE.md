# 💳 Tripay QRIS Setup Guide - OLLUQ VIP Payments

## 🎯 Quick Setup Steps

### **Step 1: Register Tripay Account** (15 minutes)

1. **Go to**: https://tripay.co.id/developer
2. **Click**: "Daftar Sekarang" (Register Now)
3. **Fill form**:
   - Email (use your business email)
   - Password
   - Phone number
   - Full name
4. **Verify email**: Check your inbox for verification link
5. **Login**: Use your email & password

### **Step 2: Get API Credentials** (5 minutes)

After login:

1. **Go to Dashboard**: https://tripay.co.id/dashboard
2. **Menu**: "Integration" → "API Configuration"
3. **Copy credentials**:
   ```
   - API Key: "SB-Mid-xxxxx" (sandbox mode)
   - Private Key: "xxxxx-xxxxx-xxxxx-xxxxx" (sandbox mode)
   - Merchant Code: "Txxxxx" (sandbox mode)
   ```

### **Step 3: Configure Webhook** (5 minutes)

1. **Go to**: Integration → Configuration → Webhook
2. **Set webhook URL**: 
   ```
   https://yourdomain.com/api/v1/payment/webhook
   ```
3. **Save changes**

**Note**: For local testing, use ngrok or similar:
```
ngrok http 3000
# Will give you: https://abc123.ngrok.io/api/v1/payment/webhook
```

### **Step 4: Add to Project** (2 minutes)

1. **Copy your credentials** from Step 2
2. **Update `.env.local`**:
   ```bash
   TRIPAY_MODE=sandbox
   TRIPAY_API_KEY=your_actual_api_key
   TRIPAY_PRIVATE_KEY=your_actual_private_key
   TRIPAY_MERCHANT_CODE=your_actual_merchant_code
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

3. **Restart dev server**:
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

---

## 🧪 **Testing Phase (Sandbox)**

### **Test Payment Flow**:

1. **Open**: http://localhost:3000/vip
2. **Select**: "QRIS Instant" payment method
3. **Choose plan**: e.g., "1 Bulan - Rp 15.000"
4. **Click**: Payment button
5. **Should show**: QR code modal

### **Simulate Payment** (Tripay Sandbox):

Tripay sandbox provides test credentials:
- **Phone**: 081234567890
- **PIN**: Any 6 digits
- **Balance**: Unlimited (sandbox)

---

## 🚀 **Production Setup** (When Ready)

### **Requirements for Production**:

1. **Upgrade Tripay Account**:
   - Go to: https://tripay.co.id/dashboard
   - Request: "Production Access"
   - Submit business verification documents:
     - KTP (Kartu Tanda Penduduk)
     - NPWP (Nomor Pokok Wajib Pajak) - optional for individual
     - Business address
     - Bank account (for withdrawals)

2. **Get Production Credentials**:
   ```bash
   TRIPAY_MODE=production
   TRIPAY_API_KEY=production_api_key
   TRIPAY_PRIVATE_KEY=production_private_key
   TRIPAY_MERCHANT_CODE=production_merchant_code
   ```

3. **Update Webhook URL**:
   ```
   https://olluq.com/api/v1/payment/webhook
   ```

4. **Test Production**:
   - Small amount test (Rp 1.000)
   - Verify webhook works
   - Check VIP status activation
   - Monitor for 24 hours

---

## 🔧 **Troubleshooting**

### **Common Issues**:

#### 1. **"Payment creation failed"**
- **Check**: API credentials correct?
- **Check**: `.env.local` file updated?
- **Check**: Server restarted?
- **Solution**: 
  ```bash
  # Kill server
  # Update .env.local
  # Restart: npm run dev
  ```

#### 2. **QR Code not showing**
- **Check**: Console errors (F12 → Console)
- **Check**: Network tab for failed requests
- **Solution**: Verify Tripay API key has correct permissions

#### 3. **Payment successful but VIP not activated**
- **Check**: Webhook URL accessible?
- **Check**: Database migration ran?
- **Check**: Webhook signature valid?
- **Solution**: 
  ```bash
  # Check logs
  # Verify webhook endpoint returns 200
  # Check database for payment records
  ```

#### 4. **"Invalid signature" in webhook**
- **Issue**: Signature calculation mismatch
- **Solution**: 
  - Verify private key matches
  - Check raw body parsing
  - Ensure no extra spaces in signature

---

## 💰 **Pricing & Fees**

### **Tripay Fee Structure**:
```
QRIS: 0.7% + Rp 1.000
- Minimum fee: ~Rp 1.050 per transaction

Your Revenue (net):
- 1 bulan:  Rp 15.000 - Rp 1.050 = Rp 13.950
- 3 bulan:  Rp 40.000 - Rp 1.280 = Rp 38.720
- 6 bulan:  Rp 75.000 -  Rp 1.525 = Rp 73.475
```

### **Compared to Manual Payment**:
- ✅ **Instant activation** (user satisfaction)
- ✅ **24/7 operation** (no admin needed)
- ✅ **Automated** (save admin time)
- ❌ **Small fee** (~3-5%)
- ❌ **Setup complexity** (one-time)

---

## 🎯 **Best Practices**

### **Security**:
- ✅ Never commit `.env.local` to git
- ✅ Use different keys for sandbox/production
- ✅ Rotate API keys periodically
- ✅ Monitor webhook calls
- ✅ Validate payment amounts server-side

### **User Experience**:
- ✅ Show countdown timer (24h expiry)
- ✅ Auto-refresh payment status
- ✅ Clear instructions for QRIS scanning
- ✅ Fallback to manual payment
- ✅ Success confirmation page

### **Monitoring**:
- ✅ Track payment success rate
- ✅ Monitor webhook failures
- ✅ Alert on failed payments
- ✅ Revenue dashboard

---

## 📋 **Testing Checklist**

Before going live:

- [ ] Sandbox payment test successful
- [ ] VIP activates correctly after payment
- [ ] Webhook receives notifications
- [ ] Database records payments correctly
- [ ] Error handling works
- [ ] QR code displays properly
- [ ] Countdown timer works
- [ ] Success page shows
- [ ] Manual payment still works
- [ ] Production credentials obtained
- [ ] Webhook URL configured
- [ ] SSL certificate active (production)
- [ ] Terms of service updated

---

## 🚀 **Go Live Checklist**

When ready for production:

1. **Update** `.env.local` with production credentials
2. **Run** database migration: `npx supabase db push`
3. **Test** small payment (Rp 1.000)
4. **Monitor** for 24 hours
5. **Announce** to users
6. **Monitor** first 50 transactions
7. **Collect** user feedback
8. **Optimize** based on data

---

## 📞 **Support**

### **Tripay Support**:
- Email: support@tripay.co.id
- WhatsApp: +62 812-3000-300
- Documentation: https://tripay.co.id/developer
- Dashboard: https://tripay.co.id/dashboard

### **Common Issues**:
- **API Key not working**: Regenerate in dashboard
- **Webhook not receiving**: Check URL, SSL, permissions
- **Payment stuck pending**: Manual expiry after 24h
- **Wrong amount charged**: Check plan pricing code

---

## ✅ **Next Steps**

After setup complete:

1. **Test** full payment flow
2. **Monitor** first transactions
3. **Gather** user feedback
4. **Optimize** conversion rates
5. **Consider** adding promo codes
6. **Add** subscription management
7. **Implement** auto-renewal

---

**Need Help?**

- Check `QRISS_PAYMENT_GUIDE.md` for technical details
- Review database migration: `supabase/migrations/019_payments_table.sql`
- Test payment flow: Visit `/vip` page
- Check webhook logs: `/api/v1/payment/webhook`

---

**Status**: Ready to implement! 🚀

Once you have Tripay credentials, update `.env.local` and you're good to go!
