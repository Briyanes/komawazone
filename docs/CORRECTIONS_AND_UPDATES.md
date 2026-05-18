# CORRECTIONS_AND_UPDATES.md
## Exact Fixes Needed - Line-by-Line Corrections

**Status:** READY TO IMPLEMENT  
**Priority:** CRITICAL → HIGH → MEDIUM  
**Time to Complete:** 7 hours

---

## 🔴 CRITICAL CORRECTIONS

### CORRECTION #1: API_DOCUMENTATION.md - Remove Duplicate Checklist

**File:** API_DOCUMENTATION.md  
**Lines:** 1705-1730  
**Issue:** Duplicate endpoint checklist conflicts with documented endpoints

**Current (WRONG):**
```markdown
Lines 1700-1730:
### IMPLEMENTATION CHECKLIST

### Setup Phase
- [ ] POST /auth/signup
- [ ] POST /auth/login
- [ ] POST /auth/logout
... (duplicate of all 42 endpoints)
```

**Fix Action:**
```
1. Delete lines 1705-1730 completely
2. Keep only the endpoint documentation (lines 330-1550)
3. Reference CHECKLIST.md for implementation tracking

New structure:
- Endpoint definitions: lines 330-1550 (KEEP)
- Implementation checklist: lines 1705-1730 (DELETE)
- OpenAPI spec: lines 1550-1705 (KEEP)
```

**Who does this:** Editor - 15 minutes

---

### CORRECTION #2: DATABASE_MIGRATIONS.md - Fix Prisma M2M Relationships

**File:** DATABASE_MIGRATIONS.md  
**Lines:** 295-310  
**Issue:** Invalid Prisma syntax for many-to-many relationships

**Current (WRONG):**
```prisma
model Manga {
  ...
  genres        Genre[]      // ❌ Missing @relation
  authors       Author[]     // ❌ Missing @relation
}

model Genre {
  ...
  manga         Manga[]      // ❌ Wrong, should reference back
}
```

**Fix (CORRECT):**
```prisma
model Manga {
  id            String    @id @default(cuid())
  title         String    @unique
  // ... other fields ...
  genres        Genre[]   @relation("MangaGenre")
  authors       Author[]  @relation("MangaAuthor")
  
  @@map("manga")
}

model Genre {
  id            String    @id @default(cuid())
  name          String    @unique
  slug          String    @unique
  description   String?
  
  manga         Manga[]   @relation("MangaGenre")
  
  @@map("genres")
}

model Author {
  id            String    @id @default(cuid())
  name          String    @unique
  slug          String    @unique
  biography     String?   @db.Text
  
  manga         Manga[]   @relation("MangaAuthor")
  
  @@map("authors")
}
```

**Replace:** Lines 295-310 with corrected code above

**Who does this:** Developer - 30 minutes  
**Verification:** Run `npx prisma validate` to confirm

---

### CORRECTION #3: TYPESCRIPT_SETUP.md - Fix setupTests.ts JSX Issue

**File:** TYPESCRIPT_SETUP.md  
**Lines:** 145-175  
**Issue:** JSX in .ts file will cause compilation error

**Current (WRONG):**
```typescript
// Line 155-160:
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => <img {...props} />,  // ❌ JSX in .ts file
}));
```

**Fix Option 1: Use string template (RECOMMENDED):**
```typescript
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return React.createElement('img', props);
  },
}));
```

**Fix Option 2: Import React.createElement:**
```typescript
import React from 'react';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => React.createElement('img', props),
}));
```

**Recommendation:** Use Option 1 (no additional imports)

**Replace:** Lines 155-160 with Option 1 code

**Who does this:** Developer - 15 minutes  
**Verification:** Run `npm run type-check` - should pass

---

### CORRECTION #4: API_DOCUMENTATION.md + ERROR_HANDLING.md - Standardize Error Response

**Files:** 
- API_DOCUMENTATION.md (lines 95-110)
- ERROR_HANDLING.md (lines 110-130)

**Issue:** `details` field format differs between files

**Current (INCONSISTENT):**

API_DOCUMENTATION.md:
```json
{
  "error": {
    "details": [
      { "field": "email", "message": "Invalid", "code": "too_small" }
    ]
  }
}
```

ERROR_HANDLING.md:
```json
{
  "error": {
    "details": {
      "field": "email",
      "message": "Invalid format"
    }
  }
}
```

**Standard Format (USE THIS EVERYWHERE):**
```json
{
  "status": "error",
  "code": 400,
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "String must contain at least 1 character(s)",
        "code": "too_small"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters",
        "code": "too_small"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-05-15T05:45:00.000Z",
    "requestId": "req-abc123"
  }
}
```

**Update Actions:**
1. [ ] Update API_DOCUMENTATION.md lines 95-110 to use standard format
2. [ ] Update ERROR_HANDLING.md lines 110-130 to match
3. [ ] Update TESTING_STRATEGY.md examples to match
4. [ ] Add to QUICK_REFERENCE.md as standard

**Who does this:** Developer - 30 minutes

---

## 🟡 HIGH-PRIORITY CORRECTIONS

### CORRECTION #5: DATABASE_MIGRATIONS.md - Clarify Relationships

**File:** DATABASE_MIGRATIONS.md  
**Lines:** 280-350  
**Issue:** Session model purpose unclear, Genre/Author relationships ambiguous

**Current Questions:**
1. Is Session model needed if using JWT-only?
2. How are Genre/Author linked to Manga?
3. Is AuditLog required or optional?

**Decision Required:**

**Option A: JWT-Only (Recommended)**
```prisma
❌ Remove Session model entirely
✅ Use only JWT tokens + refresh tokens in httpOnly cookies
```

**Option B: Keep Session for Device Trust**
```prisma
✅ Keep Session model
- Track device fingerprints
- Allow "Remember this device"
- Session timeout per device
```

**Recommendation: Use Option A (JWT-Only, simpler)**

**Action:**
- [ ] Decide between Option A or B
- [ ] Document the choice
- [ ] Update schema accordingly
- [ ] Update API_DOCUMENTATION.md

**Who decides:** Project Lead - 30 minutes decision

---

### CORRECTION #6: RESPONSIVE_DESIGN.md - Standardize Breakpoints

**File:** RESPONSIVE_DESIGN.md  
**Line:** 50

**Current (LINE 50):**
```markdown
Mobile (<640px)
Tablet (640-1024px)
Desktop (>1024px)
```

**But PERFORMANCE_OPTIMIZATION.md says:**
```
Mobile: < 600px
Tablet: 600-1024px
Desktop: > 1024px
```

**Standard Breakpoints (Use These Everywhere):**
```
Mobile:  < 640px   (320px - 639px)
Tablet:  640-1024px (640px - 1023px)
Desktop: ≥ 1024px  (1024px+)

Rationale:
- 640px: iPad Mini width
- 1024px: iPad Pro / standard laptop width
- 320px: iPhone SE minimum width
```

**Update Actions:**
1. [ ] Update RESPONSIVE_DESIGN.md to use standard
2. [ ] Update PERFORMANCE_OPTIMIZATION.md to match
3. [ ] Update DATABASE_MIGRATIONS.md seed data (if any size specs)
4. [ ] Add to DESIGN_SYSTEM.md as official breakpoints

**Who does this:** Designer - 45 minutes

---

### CORRECTION #7: TYPESCRIPT_SETUP.md - Add Missing Environment Variables

**File:** TYPESCRIPT_SETUP.md  
**Lines:** 85-105  
**Issue:** ProcessEnv interface missing variables from DATABASE_MIGRATIONS.md

**Current (INCOMPLETE):**
```typescript
interface ProcessEnv {
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL: string;
  SENTRY_DSN: string;
  JWT_SECRET: string;
  NEXT_PUBLIC_API_URL: string;
}
```

**Complete List (ADD THESE):**
```typescript
interface ProcessEnv {
  // Core
  NODE_ENV: 'development' | 'production' | 'test';
  NEXT_PUBLIC_API_URL: string;
  
  // Database
  DATABASE_URL: string;
  DATABASE_POOL_MIN?: string;
  DATABASE_POOL_MAX?: string;
  DATABASE_LOG?: string;
  DATABASE_LOG_LEVEL?: 'info' | 'warn' | 'error';
  DATABASE_POOL_MODE?: 'transaction' | 'session';
  DATABASE_POOL_SIZE?: string;
  
  // Authentication
  JWT_SECRET: string;
  JWT_EXPIRY?: string;
  REFRESH_TOKEN_EXPIRY?: string;
  
  // Security
  ENCRYPTION_KEY: string;
  
  // External Services
  SENTRY_DSN: string;
  SENTRY_AUTH_TOKEN: string;
  REDIS_URL?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  
  // Optional
  NEXT_PUBLIC_SENTRY_DSN?: string;
  NEXT_PUBLIC_APP_VERSION?: string;
}
```

**Update Action:**
- [ ] Replace lines 85-105 with complete interface above
- [ ] Add JSDoc comments explaining each variable
- [ ] Mark optional with `?`

**Who does this:** Developer - 30 minutes

---

### CORRECTION #8: COMPONENT_STATES.md + FIGMA_IMPLEMENTATION_GUIDE.md - Align Animation Specs

**Files:**
- COMPONENT_STATES.md (lines 80-120)
- FIGMA_IMPLEMENTATION_GUIDE.md (lines 400-450)

**Issue:** Animation timings in COMPONENT_STATES but not clearly in FIGMA guide

**Add to FIGMA_IMPLEMENTATION_GUIDE.md (after line 450):**

```markdown
### Animation Specifications

All animations use these standardized timings:

**Fast Animations (200ms)**
- Hover effects (button color change)
- Icon transitions
- Opacity changes
- Easing: cubic-bezier(0.16, 1, 0.3, 1)

Example:
- Button hover: Primary/500 → Primary/600 (200ms)
- Icon fade: 0% → 100% opacity (200ms)

**Medium Animations (300ms)**
- Page transitions
- Navigation changes
- Tab switches
- Modal open/close (can be 300ms or 500ms)
- Easing: cubic-bezier(0.16, 1, 0.3, 1)

Example:
- Page slide in: Transform X -100% → 0 (300ms)
- Tab slide: Transform X variable (300ms)

**Slow Animations (500ms)**
- Large layout shifts
- Complex transitions
- Reader page change
- Drawer open/close
- Easing: cubic-bezier(0.4, 0, 0.2, 1)

Example:
- Drawer slide: Transform X 100% → 0 (500ms)
- Page layout reflow (500ms)

**GPU Acceleration (IMPORTANT)**
Always animate:
- ✅ opacity
- ✅ transform (translate, scale, rotate)

Never animate:
- ❌ width/height (use transform: scale instead)
- ❌ margin/padding
- ❌ top/left/bottom/right
- ❌ border-width

**Mobile Optimization**
- Respect prefers-reduced-motion
- Reduce animation durations on slow devices
- Use transform3d for better performance
```

**Update Action:**
- [ ] Add animation specifications section to FIGMA_IMPLEMENTATION_GUIDE.md
- [ ] Reference these specs in FIGMA_COMPONENT_LIBRARY_GUIDE.md
- [ ] Document in COMPONENT_STATES.md too

**Who does this:** Designer + Developer - 45 minutes

---

## 🟠 MEDIUM-PRIORITY CORRECTIONS

### CORRECTION #9: Remove Duplication - Create Central Design Tokens File

**Current Issue:**
- DESIGN_SYSTEM.md has color definitions (lines 50-100)
- RESPONSIVE_DESIGN.md repeats them (lines 30-80)
- COMPONENT_STATES.md repeats them (lines 20-60)

**Solution:**
1. [ ] Keep all tokens in DESIGN_SYSTEM.md ONLY
2. [ ] Remove duplicate definitions from other files
3. [ ] Replace with: "See DESIGN_SYSTEM.md for all color definitions"

**Files to Update:**
- [ ] RESPONSIVE_DESIGN.md - remove color section (lines 30-80)
- [ ] COMPONENT_STATES.md - remove color section (lines 20-60)
- [ ] Add reference links instead

**Expected Savings:** ~2-3 KB, improved maintainability

**Who does this:** Editor - 1 hour

---

### CORRECTION #10: TESTING_STRATEGY.md - Add Missing Imports

**File:** TESTING_STRATEGY.md  
**Line:** 280-310  
**Issue:** Code example missing import statement

**Current (INCOMPLETE):**
```typescript
// Missing import!
const seedTestDatabase = async () => {
  await prisma.user.create({ ... });
};
```

**Fixed (COMPLETE):**
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const seedTestDatabase = async () => {
  await prisma.user.create({ ... });
};
```

**Update Actions:**
1. [ ] Add import at top of code block
2. [ ] Review all other code examples for missing imports
3. [ ] Test all examples compile

**Who does this:** Developer - 1 hour

---

### CORRECTION #11: PERFORMANCE_OPTIMIZATION.md - Adjust Targets

**File:** PERFORMANCE_OPTIMIZATION.md  
**Lines:** 30-50  
**Issue:** Same targets for all networks unrealistic

**Current (TOO AGGRESSIVE):**
```
LCP < 2.5s (all networks)
TTFB < 600ms (all networks)
```

**Network-Specific Targets (REALISTIC):**
```
4G Network (1.6 Mbps):
- LCP: < 2.5s ✅ achievable
- TTFB: < 600ms ✅ achievable
- FCP: < 1.8s ✅ achievable

3G Network (400 Kbps):
- LCP: < 4.0s ✅ realistic
- TTFB: < 1.2s ✅ realistic
- FCP: < 3.0s ✅ realistic

Fast Network (10+ Mbps):
- LCP: < 1.5s ✅ high bar
- TTFB: < 300ms ✅ high bar
- FCP: < 1.0s ✅ high bar
```

**Update Action:**
- [ ] Replace lines 30-50 with network-specific targets
- [ ] Document fallback targets for old devices
- [ ] Add rationale for each target

**Who does this:** Performance Engineer - 45 minutes

---

## 📋 CREATE NEW DOCUMENTS NEEDED

### NEW DOCUMENT #1: ENVIRONMENT_VARIABLES.md

**Purpose:** Centralized list of all required/optional env vars  
**Size:** ~200 lines

**Content:**
```markdown
# ENVIRONMENT_VARIABLES.md

## Required (Production Won't Start Without)
- DATABASE_URL
- JWT_SECRET
- ENCRYPTION_KEY
- NODE_ENV

## Strongly Recommended
- SENTRY_DSN
- REDIS_URL

## Optional
- DATABASE_POOL_MIN
- DATABASE_POOL_MAX
- etc.

[Include defaults, validation rules, examples]
```

**Who creates:** Developer - 1 hour

---

### NEW DOCUMENT #2: ERROR_CODES_REFERENCE.md

**Purpose:** Centralized error code reference  
**Size:** ~300 lines

**Content:**
```markdown
# ERROR_CODES_REFERENCE.md

## HTTP Status Codes

### 400 Bad Request
- VALIDATION_ERROR
- INVALID_EMAIL
- INVALID_PASSWORD

### 401 Unauthorized
- UNAUTHORIZED
- TOKEN_EXPIRED
- TOKEN_INVALID

[... all error codes with descriptions]
```

**Who creates:** Developer - 1 hour

---

## ✅ VERIFICATION CHECKLIST - DO THIS AFTER FIXES

**Step 1: Code Compilation**
- [ ] Run `npm run type-check` - should pass
- [ ] Run `npm run lint` - should pass
- [ ] Run `npx prisma validate` - should pass
- [ ] Run `npm run build` - should complete

**Step 2: Cross-File Consistency**
- [ ] Error response format same everywhere ✓
- [ ] Breakpoints same in all design files ✓
- [ ] API endpoints documented consistently ✓
- [ ] Environment variables complete ✓

**Step 3: Code Examples Testing**
- [ ] All Jest examples compile ✓
- [ ] All Prisma examples valid ✓
- [ ] All TypeScript examples have correct types ✓
- [ ] All YAML files valid format ✓

**Step 4: Reference Validation**
- [ ] All cross-references work ✓
- [ ] All file paths correct ✓
- [ ] All link anchors exist ✓
- [ ] No broken references ✓

**Step 5: Final QA**
- [ ] No duplicate content ✓
- [ ] No typos or grammatical errors ✓
- [ ] Professional tone throughout ✓
- [ ] Production-ready ✓

---

## 📊 ESTIMATED FIX TIME

| Correction | Priority | Time | Difficulty |
|-----------|----------|------|------------|
| #1: Remove duplicate checklist | 🔴 CRITICAL | 15 min | Easy |
| #2: Fix Prisma M2M syntax | 🔴 CRITICAL | 30 min | Medium |
| #3: Fix setupTests.ts | 🔴 CRITICAL | 15 min | Easy |
| #4: Standardize error responses | 🔴 CRITICAL | 30 min | Medium |
| #5: Clarify relationships | 🟡 HIGH | 30 min | Medium |
| #6: Standardize breakpoints | 🟡 HIGH | 45 min | Easy |
| #7: Add missing env vars | 🟡 HIGH | 30 min | Easy |
| #8: Align animations | 🟡 HIGH | 45 min | Medium |
| #9: Remove duplication | 🟠 MEDIUM | 60 min | Easy |
| #10: Add imports | 🟠 MEDIUM | 60 min | Easy |
| #11: Adjust performance targets | 🟠 MEDIUM | 45 min | Easy |
| **Create NEW docs** | 🟠 MEDIUM | 120 min | Easy |

**TOTAL TIME:** ~7 hours  
**TEAM:** 1-2 developers + 1 designer  
**TIMELINE:** Can be completed in 1 day

---

## 🎯 IMPLEMENTATION ORDER

**Day 1: Morning (2 hours) - CRITICAL FIXES**
1. Fix API_DOCUMENTATION.md duplicate (15 min)
2. Fix Prisma M2M syntax (30 min)
3. Fix setupTests.ts JSX (15 min)
4. Standardize error responses (30 min)
5. Basic verification (15 min)

**Day 1: Afternoon (3 hours) - HIGH & MEDIUM FIXES**
1. Clarify relationships (30 min)
2. Standardize breakpoints (45 min)
3. Add missing env vars (30 min)
4. Align animations (45 min)
5. Remove duplication (45 min)
6. Verification (15 min)

**Day 1: Evening (2 hours) - NEW DOCS & FINAL QA**
1. Create ENVIRONMENT_VARIABLES.md (60 min)
2. Create ERROR_CODES_REFERENCE.md (60 min)

**Day 2: Morning (1 hour) - FINAL VERIFICATION**
1. Run all checks
2. Final QA review
3. Production ready ✅

---

**Ready to implement?** ✅  
**Questions or clarifications needed?** 🤔

