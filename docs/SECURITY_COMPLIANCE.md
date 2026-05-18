# SECURITY_COMPLIANCE.md
## Tier-2 Developer Specification: Security & Compliance Strategy

**Document ID:** TIER2-DEV-002  
**Created:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ COMPLETE  
**Priority:** CRITICAL (Phase 2 - Security)

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Authentication Security](#authentication-security)
3. [Data Protection](#data-protection)
4. [API Security](#api-security)
5. [Frontend Security](#frontend-security)
6. [Infrastructure Security](#infrastructure-security)
7. [Compliance Frameworks](#compliance-frameworks)
8. [Security Testing](#security-testing)
9. [Incident Response](#incident-response)
10. [Security Checklist](#security-checklist)

---

## 1. EXECUTIVE SUMMARY

### Security Objectives
- **Confidentiality:** Protect user data from unauthorized access
- **Integrity:** Ensure data hasn't been modified
- **Availability:** Keep service running 99.9% uptime
- **Compliance:** Meet GDPR, CCPA, and local regulations

### Threat Model

**High Risk Threats**
- SQL injection / Database attacks
- XSS (Cross-site scripting)
- CSRF (Cross-site request forgery)
- Unauthorized authentication
- Sensitive data exposure

**Medium Risk Threats**
- DDoS attacks
- Brute force attacks
- Insecure deserialization
- Broken access control

**Low Risk Threats**
- Credential exposure in logs
- Weak cryptography
- Missing security headers

### Security Stack
```
Frontend:    CSP, SameSite cookies, HTTPS, input validation
API:         JWT, rate limiting, input validation, CORS
Database:    Encryption at rest, parameterized queries, backups
Infrastructure: WAF, DDoS protection, secrets management, TLS 1.3
```

---

## 2. AUTHENTICATION SECURITY

### Password Security

**Requirements**
```
Minimum: 8 characters
Must include: Uppercase, lowercase, number, special character
Must NOT include: Username, common patterns
Must NOT be in breach database (HaveIBeenPwned API check)
```

**Implementation**
```typescript
import { z } from 'zod';
import pino from 'pino';

const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'Include uppercase letter')
  .regex(/[a-z]/, 'Include lowercase letter')
  .regex(/[0-9]/, 'Include number')
  .regex(/[!@#$%^&*]/, 'Include special character')
  .refine(
    async (password) => {
      // Check against HaveIBeenPwned
      const hash = await sha1(password);
      const prefix = hash.slice(0, 5);
      const response = await fetch(
        `https://api.pwnedpasswords.com/range/${prefix}`
      );
      const hashes = await response.text();
      return !hashes.includes(hash.slice(5));
    },
    'Password has been breached'
  );
```

### Password Hashing

**Algorithm: Argon2 (not bcrypt)**
```typescript
import argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id, // Most secure variant
    memoryCost: 65536, // 64 MB
    timeCost: 3, // 3 iterations
    parallelism: 4, // 4 threads
  });
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

### JWT Security

**Token Structure**
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-123",
    "email": "user@example.com",
    "role": "USER",
    "iat": 1715768899,
    "exp": 1715855299,
    "jti": "unique-token-id"
  },
  "signature": "HMACSHA256(...)"
}
```

**Token Expiration**
```
Access Token:  24 hours (short-lived)
Refresh Token: 7 days (long-lived, in httpOnly cookie)
Session:       30 days (for device trust)
```

**Token Revocation (Blacklist)**
```typescript
// Store revoked tokens in Redis
export async function revokeToken(token: string) {
  const decoded = jwt.decode(token);
  const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
  
  if (expiresIn > 0) {
    await redis.setex(`revoked:${decoded.jti}`, expiresIn, '1');
  }
}

export async function isTokenRevoked(token: string): Promise<boolean> {
  const decoded = jwt.decode(token);
  return redis.exists(`revoked:${decoded.jti}`);
}
```

### Multi-Factor Authentication (MFA)

**TOTP (Time-based One-Time Password)**
```typescript
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export async function setupTOTP(userId: string) {
  const secret = speakeasy.generateSecret({
    name: `Manga Zone (${userId})`,
    issuer: 'Manga Zone',
    length: 32,
  });

  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,
    qrCode,
  };
}

export function verifyTOTP(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 30s window on each side
  });
}
```

---

## 3. DATA PROTECTION

### Encryption at Rest

**Database Encryption (Supabase)**
```
PostgreSQL at-rest encryption: AES-256
Enabled by default in production
Encryption key managed by Supabase
```

**Sensitive Fields**
```typescript
// Fields requiring encryption
- Password hashes (via Argon2)
- API keys
- Payment tokens (if added later)
- TOTP secrets
- Reset tokens

// Implementation
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes
const ALGORITHM = 'aes-256-gcm';

export function encryptField(data: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptField(encrypted: string): string {
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### HTTPS & TLS

**Requirements**
```
- TLS 1.3 (or TLS 1.2 minimum)
- Strong cipher suites only
- Certificate renewal: automatic via Let's Encrypt
- HSTS: enabled with 1 year max-age
```

**HSTS Header**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### Secrets Management

**Environment Variables**
```
# .env.local (development - local file only)
JWT_SECRET=dev_secret_...
DATABASE_URL=postgresql://...

# Vercel Secrets (production)
# Stored in Vercel dashboard, never in code
```

**Secrets Rotation**
```bash
# Monthly rotation
1. Generate new key
2. Deploy with both old & new keys
3. Re-encrypt sensitive data with new key
4. Remove old key after 30 days
```

---

## 4. API SECURITY

### Input Validation

**Zod Schemas (Type-safe validation)**
```typescript
import { z } from 'zod';

const createMangaSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000),
  status: z.enum(['ONGOING', 'COMPLETED', 'HIATUS']),
  coverUrl: z.string().url(),
  genres: z.string().array().min(1).max(10),
});

export async function validateMangaInput(data: unknown) {
  return createMangaSchema.parse(data); // Throws if invalid
}
```

### SQL Injection Prevention

**Always use parameterized queries (Prisma handles this)**
```typescript
// ✅ SAFE: Prisma automatically parameterizes
const user = await prisma.user.findUnique({
  where: { email: userInput },
});

// ✅ SAFE: Raw query with parameters
const result = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${userInput}
`;

// ❌ NEVER: String concatenation
// const result = await db.query(`SELECT * FROM users WHERE email = '${userInput}'`);
```

### CORS Configuration

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
}));
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// API endpoint rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    if (req.user?.role === 'ADMIN') return 1000;
    if (req.user?.role === 'USER') return 100;
    return 20; // Public
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login attempt limiting (stricter)
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  skipSuccessfulRequests: true,
});

app.post('/auth/login', loginLimiter, handleLogin);
app.use('/api', apiLimiter);
```

---

## 5. FRONTEND SECURITY

### Content Security Policy (CSP)

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
      style-src 'self' 'unsafe-inline';
      img-src 'self' https: data:;
      font-src 'self' https://fonts.googleapis.com;
      connect-src 'self' https://api.mangazone.id https://sentry.io;
      frame-ancestors 'none';
      base-uri 'self';
      form-action 'self';
    `.replace(/\n/g, ' ').trim(),
  },
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

### XSS Prevention

**Input Escaping (React automatically escapes)**
```typescript
// ✅ SAFE: React escapes by default
<div>{userInput}</div>

// ❌ DANGER: Never use dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// If needed to sanitize HTML:
import DOMPurify from 'isomorphic-dompurify';
const sanitized = DOMPurify.sanitize(userInput);
<div>{sanitized}</div>
```

### CSRF Protection

```typescript
// Add CSRF token to forms
export function useCSRFToken() {
  const [token, setToken] = useState('');

  useEffect(() => {
    fetch('/api/csrf-token')
      .then(r => r.json())
      .then(data => setToken(data.token));
  }, []);

  return token;
}

// Usage in form
<form method="POST" action="/api/manga">
  <input type="hidden" name="_csrf" value={csrfToken} />
  {/* ... form fields ... */}
</form>

// Server-side validation
app.use(csrf()); // Express CSRF middleware
```

### Cookie Security

```typescript
// httpOnly: Not accessible from JavaScript
// Secure: Only sent over HTTPS
// SameSite: Prevents CSRF
res.cookie('token', jwtToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

---

## 6. INFRASTRUCTURE SECURITY

### WAF (Web Application Firewall)

**Cloudflare WAF Rules**
```
Rule 1: Block obvious SQL injection patterns
Rule 2: Block XSS patterns in query strings
Rule 3: Rate limit by IP (>1000 req/min)
Rule 4: Block known malicious IPs
Rule 5: Require valid user-agent
```

### DDoS Protection

```
Cloudflare DDoS protection (automatic):
- Anycast network absorbs traffic
- Intelligent traffic filtering
- Rate-based blocking
- Geographic restrictions (if needed)
```

### Secrets Management

**Vercel Secrets**
```bash
# Store in Vercel dashboard
# Never commit to Git
# Injected at build/runtime

vercel env ls        # List all secrets
vercel env pull      # Pull to .env.local
vercel env add NAME  # Add new secret
```

### Network Security

**VPC (if needed in future)**
```
Database: Private network only (no internet access)
API: In private subnet with load balancer
CDN: Public-facing, sits in front
```

---

## 7. COMPLIANCE FRAMEWORKS

### GDPR (EU Privacy Law)

**User Rights**
- ✅ Right to access: Export all personal data
- ✅ Right to be forgotten: Delete account & data
- ✅ Right to rectification: Edit personal data
- ✅ Right to data portability: Export data format

**Implementation**
```typescript
// 1. Data access (export)
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const bookmarks = await prisma.bookmark.findMany({ where: { userId } });
  const likes = await prisma.like.findMany({ where: { userId } });
  
  return JSON.stringify({ user, bookmarks, likes }, null, 2);
}

// 2. Right to delete
export async function deleteUserData(userId: string) {
  // Delete in order: avoid FK constraints
  await prisma.bookmark.deleteMany({ where: { userId } });
  await prisma.like.deleteMany({ where: { userId } });
  await prisma.readingHistory.deleteMany({ where: { userId } });
  await prisma.userSettings.delete({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

// 3. Consent tracking
export async function trackConsent(userId: string, type: string) {
  return prisma.consent.create({
    data: {
      userId,
      type, // 'marketing', 'analytics', 'cookies'
      givenAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });
}
```

### CCPA (California Privacy Law)

**Requirements (same as GDPR +)**
- Disclosure of data collection
- Opt-out of data selling (we don't sell data)
- Non-discrimination for exercising rights

### Regional Compliance

**Indonesia (if applicable)**
```
- Data residency: Store user data in Indonesia region
- Notification: Notify users within 72h of breach
- Lawful basis: Explicit consent for processing
```

---

## 8. SECURITY TESTING

### OWASP Top 10 Testing

```bash
# 1. Injection - Tested
npm run test:security -- --test "SQL injection"

# 2. Broken Authentication - Tested
npm run test:security -- --test "Authentication bypass"

# 3. XSS - Tested (React escapes by default)
npm run test:security -- --test "XSS prevention"

# 4. CSRF - Tested
npm run test:security -- --test "CSRF token validation"

# 5. Sensitive Data Exposure - Tested
npm run test:security -- --test "Unencrypted data"

# 6. Broken Access Control - Tested
npm run test:security -- --test "Unauthorized access"

# 7. Security Misconfiguration - Manual review
npm run test:security -- --test "Headers check"

# 8. XXE - N/A (we don't parse XML)

# 9. Broken Auth - Tested
npm run test:security -- --test "Token validation"

# 10. Insufficient Logging - Tested
npm run test:security -- --test "Event logging"
```

### Penetration Testing

```
Frequency: Quarterly (or after major changes)
Scope: Full application + API
Tools: Burp Suite, OWASP ZAP
Budget: $5,000-$15,000 per test
```

---

## 9. INCIDENT RESPONSE

### Breach Detection

```
Alert if:
- Unusual number of failed logins (>10 in 5min)
- Multiple users reporting unauthorized access
- Sentry reports SQL injection attempts
- WAF blocks >100 requests from same IP
```

### Incident Response Plan

**Step 1: Contain (0-1 hour)**
```
- Disable affected user accounts
- Block suspicious IPs
- Stop data export if ongoing
- Alert security team
```

**Step 2: Assess (1-4 hours)**
```
- Determine scope of breach
- Identify affected data
- Check logs for evidence
- Calculate user impact
```

**Step 3: Notify (4-24 hours)**
```
- GDPR: Notify users if personal data affected
- Regulatory: Report to data protection authorities
- Public: Optional press statement if large breach
- Timeline: GDPR requires within 72 hours
```

**Step 4: Remediate (1-7 days)**
```
- Patch vulnerability
- Reset passwords for affected users
- Deploy fix to production
- Document all changes
```

**Step 5: Lessons Learned (7-30 days)**
```
- Post-incident review
- Update security controls
- Improve monitoring
- Update runbooks
```

---

## 10. SECURITY CHECKLIST

### Pre-Launch Security Review

**Authentication**
- [ ] Passwords hash with Argon2
- [ ] JWT tokens expire after 24h
- [ ] Refresh tokens in httpOnly cookies
- [ ] MFA available for admin users
- [ ] Failed login attempts rate-limited

**Data Protection**
- [ ] HTTPS on all connections
- [ ] Sensitive data encrypted at rest
- [ ] Database backups encrypted
- [ ] HSTS header enabled
- [ ] TLS 1.3+ configured

**API Security**
- [ ] All inputs validated with Zod
- [ ] SQL injection prevented (parameterized queries)
- [ ] CORS properly configured
- [ ] Rate limiting enforced
- [ ] No sensitive data in logs

**Frontend Security**
- [ ] CSP headers implemented
- [ ] XSS protection enabled
- [ ] CSRF tokens validated
- [ ] Cookies: httpOnly + Secure + SameSite
- [ ] No hardcoded secrets

**Infrastructure**
- [ ] WAF enabled
- [ ] DDoS protection active
- [ ] Secrets in Vercel, not Git
- [ ] Database access restricted
- [ ] Backup strategy tested

**Compliance**
- [ ] Privacy policy created
- [ ] GDPR data export working
- [ ] Account deletion working
- [ ] Audit logs implemented
- [ ] Consent tracking active

**Testing**
- [ ] Penetration test passed
- [ ] OWASP Top 10 reviewed
- [ ] Security headers validated
- [ ] Dependency vulnerabilities checked
- [ ] Secrets scanning enabled

---

## SUMMARY

This security strategy provides:

✅ **Authentication:** Secure password hashing, JWT tokens, MFA  
✅ **Data Protection:** Encryption at rest & in transit, secure backups  
✅ **API Security:** Input validation, SQL injection prevention, rate limiting  
✅ **Compliance:** GDPR, CCPA, regional regulations  
✅ **Incident Response:** Documented procedures and runbooks  

**Security Score Target:** 95/100 on OWASP

---

**Next Tier-2 File:** DEVOPS_DEPLOYMENT.md
