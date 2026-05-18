# PRODUCTION FIXES ACTION PLAN
## Detailed Corrections & Updates Required

**Status:** Implementation Guide  
**Priority:** CRITICAL - Must complete before production  
**Estimated Time:** 7-12 hours  
**Date Created:** 2026-05-15

---

## 🚨 CRITICAL FIXES (BLOCKING) - 7 HOURS

### FIX #1: TypeScript Syntax Errors in Examples
**Status:** ⚠️ NEEDS FIX  
**Location:** Multiple files  
**Files:**
- TYPESCRIPT_SETUP.md
- ERROR_HANDLING.md
- TESTING_STRATEGY.md

**Issues Found:**
```typescript
// ❌ ERROR: Missing return in some paths
export function formatDate(date: Date | string | number): string {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date');
  }
  // NO RETURN HERE - TypeScript strict mode fails!
}

// ❌ ERROR: Wrong parameter syntax
export async function setupTOTP(userId: string) {
  // Uses speakeasy but not imported
  const secret = speakeasy.generateSecret({...});
}
```

**Corrections Needed:**
```typescript
// ✅ CORRECT: All paths return
export function formatDate(
  date: Date | string | number,
  locale: string = 'en-US'
): string {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date');
  }
  return dateObj.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ✅ CORRECT: Imports included
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
```

**Action Items:**
- [ ] Review all TypeScript examples in TYPESCRIPT_SETUP.md
- [ ] Add missing return statements
- [ ] Add all necessary imports at top of examples
- [ ] Test each example by actually compiling it
- [ ] Add comment: `// ✅ Tested and working`

**Files to Update:**
1. TYPESCRIPT_SETUP.md - Lines ~100-350 (all examples)
2. ERROR_HANDLING.md - Lines ~180-220 (error class examples)
3. TESTING_STRATEGY.md - Lines ~200-250 (hook test examples)

---

### FIX #2: Invalid Prisma Directives
**Status:** ⚠️ NEEDS FIX  
**Location:** DATABASE_MIGRATIONS.md, line ~150

**Issue Found:**
```prisma
// ❌ INVALID - @@fulltext is NOT valid Prisma
model Manga {
  id            String    @id @default(cuid())
  title         String    @unique
  description   String    @db.Text
  
  @@fulltext([title, description])  // ← NOT VALID!
  @@index([slug])
  @@map("manga")
}
```

**Why It's Wrong:**
- Prisma doesn't support `@@fulltext` directive
- This is PostgreSQL syntax, not Prisma
- Code won't compile!

**Correction:**
```prisma
// ✅ CORRECT - Use raw SQL for full-text search
model Manga {
  id            String    @id @default(cuid())
  title         String    @unique
  description   String    @db.Text
  
  // Full-text search implemented via raw SQL (see docs)
  // @@index([slug])  // ← Standard Prisma index
  @@map("manga")
}

// In migration file, add raw SQL:
// --- MIGRATION ---
// CREATE INDEX idx_manga_search ON manga 
//   USING GIN(to_tsvector('english', title || ' ' || description));
```

**Action Items:**
- [ ] Remove `@@fulltext` from schema.prisma
- [ ] Document full-text search implementation in README
- [ ] Add raw SQL example in DATABASE_MIGRATIONS.md
- [ ] Note: Use Elasticsearch or Meilisearch for production full-text search

---

### FIX #3: Incomplete API Documentation - Missing 7 Endpoints
**Status:** ⚠️ NEEDS FIX  
**Location:** API_DOCUMENTATION.md  
**Current:** 35-36 endpoints documented  
**Target:** 42 endpoints

**Missing Endpoints (Must Add):**

```markdown
## MISSING ENDPOINT #1: POST /admin/analytics/report
Generate analytics report for dashboard

**Auth Required:** Yes (ADMIN only)

**Request:**
\`\`\`json
{
  "dateFrom": "2026-05-01",
  "dateTo": "2026-05-31",
  "metrics": ["users", "manga_views", "reads"]
}
\`\`\`

**Response (200):**
\`\`\`json
{
  "status": "success",
  "code": 200,
  "data": {
    "period": "May 2026",
    "newUsers": 1500,
    "mangaViews": 500000,
    "totalReads": 2000000,
    "topManga": [...]
  }
}
\`\`\`

---

## MISSING ENDPOINT #2: GET /admin/health/status
System health check (for monitoring)

**Auth Required:** No (Public health check)

**Response (200):**
\`\`\`json
{
  "status": "healthy",
  "timestamp": "2026-05-15T05:43:43Z",
  "services": {
    "database": "ok",
    "cache": "ok",
    "cdn": "ok",
    "email": "ok"
  }
}
\`\`\`

---

## MISSING ENDPOINT #3: POST /api/data/export
Export user data (GDPR compliance)

**Auth Required:** Yes (Own data only)

**Request:**
\`\`\`json
{
  "format": "json" | "csv"
}
\`\`\`

**Response (200):**
\`\`\`json
{
  "status": "success",
  "code": 200,
  "data": {
    "downloadUrl": "https://cdn.../exports/user-data-12345.json",
    "expiresIn": 86400
  }
}
\`\`\`

---

## MISSING ENDPOINT #4: DELETE /api/data
Delete all user data (GDPR "right to be forgotten")

**Auth Required:** Yes

**Request:**
\`\`\`json
{
  "password": "user-password",
  "confirmDelete": "DELETE"
}
\`\`\`

**Response (200):**
\`\`\`json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Account and all data scheduled for deletion",
    "completionDate": "2026-06-15"
  }
}
\`\`\`

---

## MISSING ENDPOINT #5: GET /api/consent/status
Check user consent status

**Auth Required:** Yes

**Response (200):**
\`\`\`json
{
  "status": "success",
  "code": 200,
  "data": {
    "marketing": false,
    "analytics": true,
    "cookies": true,
    "lastUpdated": "2026-05-01T00:00:00Z"
  }
}
\`\`\`

---

## MISSING ENDPOINT #6: POST /api/consent
Record user consent

**Auth Required:** No (works with tracking ID)

**Request:**
\`\`\`json
{
  "marketing": true,
  "analytics": true,
  "cookies": true
}
\`\`\`

**Response (201):**
\`\`\`json
{
  "status": "success",
  "code": 201,
  "data": {
    "consentId": "consent-123",
    "recordedAt": "2026-05-15T05:43:43Z"
  }
}
\`\`\`

---

## MISSING ENDPOINT #7: PATCH /user/profile/avatar
Upload and update user avatar

**Auth Required:** Yes

**Request (multipart/form-data):**
\`\`\`
file: <image file, max 5MB>
\`\`\`

**Response (200):**
\`\`\`json
{
  "status": "success",
  "code": 200,
  "data": {
    "avatarUrl": "https://cdn.../avatars/user-123.webp",
    "updated": true
  }
}
\`\`\`
```

**Action Items:**
- [ ] Add all 7 missing endpoints to API_DOCUMENTATION.md
- [ ] Update endpoint count in summary: 42 total
- [ ] Add rate limit info for each
- [ ] Add error codes
- [ ] Test all endpoints work in Postman
- [ ] Update OpenAPI spec (if exists)

---

### FIX #4: Naming Conventions Consolidation
**Status:** ⚠️ NEEDS FIX  
**Location:** New file required  
**Files:** COMPONENT_STATES.md, FIGMA_COMPONENT_LIBRARY_GUIDE.md, DATABASE_MIGRATIONS.md conflicting

**Problem:** Developers see 3 different naming styles - will cause errors

**Solution: Create `docs/NAMING_CONVENTIONS.md`**

```markdown
# NAMING CONVENTIONS
## Unified Style Guide for Manga Zone

### Component Names (UI)

**Format:** `Category/Name/Variant/Size/State`

Examples:
- Button/Primary/Medium/Default
- Button/Primary/Medium/Hover
- Input/Text/Medium/Focus
- Card/Manga/Mobile/Loading
- Modal/Confirm/Large/Error

**Rules:**
- PascalCase for each segment
- Forward slash (/) as separator
- State always last
- Size before state

---

### Database & Code

**Models:** PascalCase
\`\`\`prisma
model User { }
model Manga { }
model ReadingHistory { }
\`\`\`

**Enums:** UPPER_SNAKE_CASE
\`\`\`prisma
enum UserRole {
  USER
  ADMIN
  MODERATOR
}

enum MangaStatus {
  ONGOING
  COMPLETED
  HIATUS
}
\`\`\`

**Database Tables:** snake_case
\`\`\`prisma
model User {
  @@map("users")  // Table name
}
\`\`\`

**Columns:** camelCase
\`\`\`prisma
model User {
  id: String
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime?
}
\`\`\`

---

### API Routes

**Format:** `/api/v1/resource/action`

Examples:
- GET /api/v1/manga - List all
- GET /api/v1/manga/:id - Get one
- POST /api/v1/manga - Create
- PUT /api/v1/manga/:id - Update
- DELETE /api/v1/manga/:id - Delete
- POST /api/v1/manga/:id/bookmark - Custom action

**Rules:**
- Lowercase
- Kebab-case for multi-word resources
- Version prefix: /v1/
- Singular resource name (or plural if collection)
- HTTP verbs indicate action

---

### TypeScript/JavaScript

**Variables:** camelCase
\`\`\`typescript
const firstName = 'John';
let userCount = 0;
\`\`\`

**Constants:** UPPER_SNAKE_CASE
\`\`\`typescript
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;
\`\`\`

**Types/Interfaces:** PascalCase
\`\`\`typescript
type User = { ... };
interface MangaResponse { ... };
\`\`\`

**Functions:** camelCase
\`\`\`typescript
function fetchManga() { }
const createUser = () => { };
\`\`\`

**Classes:** PascalCase
\`\`\`typescript
class ErrorHandler { }
class Database { }
\`\`\`

---

### Files & Folders

**Documentation:** UPPER_SNAKE_CASE.md
\`\`\`
API_DOCUMENTATION.md
TESTING_STRATEGY.md
DATABASE_MIGRATIONS.md
\`\`\`

**Source code:** camelCase
\`\`\`
src/components/MangaCard.tsx
src/hooks/useMangaSearch.ts
src/lib/prisma.ts
src/utils/formatters.ts
\`\`\`

**Folders:** lowercase
\`\`\`
src/components/
src/hooks/
src/lib/
src/utils/
src/pages/
\`\`\`

---

### CSS Classes

**Format:** kebab-case
\`\`\`html
<div class="manga-card">
  <img class="manga-card__image" />
  <p class="manga-card__title">Title</p>
</div>
\`\`\`

**BEM Notation:**
- Block: .manga-card
- Element: .manga-card__image
- Modifier: .manga-card--featured

---

### Environment Variables

**Format:** UPPER_SNAKE_CASE with prefix

Public (client-side):
\`\`\`
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_APP_VERSION=
\`\`\`

Private (server-side):
\`\`\`
DATABASE_URL=
JWT_SECRET=
ENCRYPTION_KEY=
REDIS_URL=
\`\`\`

---

### Branch Names

**Format:** `type/description`

Types: feature, fix, docs, refactor, chore  
Examples:
- feature/user-authentication
- fix/manga-search-bug
- docs/api-documentation
- refactor/cache-layer
- chore/update-dependencies

---

### Commit Messages

**Format:** `type(scope): description`

\`\`\`
feat(auth): implement JWT token refresh
fix(reader): prevent infinite scroll
docs(api): update endpoint documentation
style(components): reorder properties
test(manga): add search filter tests
chore(deps): upgrade React to 18.3
\`\`\`

---

### Figma Components

**Format:** `Category/Name/Variant/Size/State`

\`\`\`
Button/Primary/Medium/Default
Button/Primary/Medium/Hover
Input/Text/Large/Focused
Card/Manga/Mobile/Loading
Modal/Confirm/Default/Error
\`\`\`
```

**Action Items:**
- [ ] Create docs/NAMING_CONVENTIONS.md
- [ ] Reference from other docs
- [ ] Share with team before starting
- [ ] Use in code linter/prettier config

---

### FIX #5: Centralized Environment Variables Reference
**Status:** ⚠️ NEEDS FIX  
**Location:** New file required  

**Action: Create `docs/.env.example`**

```bash
# ============================================
# APPLICATION CONFIGURATION
# ============================================
NODE_ENV=development
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_API_URL=http://localhost:3000

# ============================================
# DATABASE
# ============================================
# Development: Use local PostgreSQL or Docker
# Production: Use Supabase
DATABASE_URL=postgresql://postgres:password@localhost:5432/manga_zone_dev

# Optional: Connection pooling
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20

# ============================================
# AUTHENTICATION & SECURITY
# ============================================
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_jwt_secret_key_min_32_chars
ENCRYPTION_KEY=your_encryption_key_32_chars

# ============================================
# EXTERNAL SERVICES
# ============================================
# Sentry (Error tracking)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# Redis (Caching)
REDIS_URL=redis://localhost:6379

# Cloudinary (Image hosting)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# ============================================
# ANALYTICS & MONITORING
# ============================================
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=
LOGROCKET_APP_ID=
DATADOG_API_KEY=

# ============================================
# EMAIL (if needed later)
# ============================================
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=no-reply@mangazone.id

# ============================================
# STRIPE (if adding payments)
# ============================================
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

**Action Items:**
- [ ] Create docs/.env.example
- [ ] Update .gitignore to ignore .env.local
- [ ] Document in README how to set up
- [ ] Reference from Vercel setup docs

---

## 🟡 HIGH PRIORITY FIXES (3 HOURS)

### FIX #6: Consolidate Duplicate "Core Web Vitals" Content
**Status:** ⚠️ NEEDS FIX  
**Files:** 5 files with identical content

**Action:** Centralize in DESIGN_SYSTEM.md

**In DESIGN_SYSTEM.md, add:**
```markdown
## Core Web Vitals Targets

Our performance targets for all pages:

| Metric | Target | Measurement |
|--------|--------|-------------|
| LCP (Largest Contentful Paint) | < 2.5s | 75th percentile |
| CLS (Cumulative Layout Shift) | < 0.1 | Entire page lifetime |
| INP (Interaction to Next Paint) | < 200ms | 75th percentile |
| TTFB (Time to First Byte) | < 600ms | Server response |
| FCP (First Contentful Paint) | < 1.8s | First pixel paint |

For detailed performance optimization, see [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md).
```

**In other files, REPLACE with:**
```markdown
## Performance Standards

For Web Vitals targets, see [DESIGN_SYSTEM.md#core-web-vitals](DESIGN_SYSTEM.md#core-web-vitals).
```

**Action Items:**
- [ ] Update DESIGN_SYSTEM.md with CWV table
- [ ] Update all 5 files that duplicate this content
- [ ] Verify links work

---

### FIX #7: Review & Organize PRODUCTION_REVIEW_REPORT.md
**Status:** ❓ UNKNOWN  
**Action:** Read file and decide if merge, keep, or delete

**Possible outcomes:**
- If outdated: DELETE
- If useful: MERGE into COMPREHENSIVE_AUDIT_REPORT.md
- If different purpose: KEEP and link from README

**Action Items:**
- [ ] Read PRODUCTION_REVIEW_REPORT.md
- [ ] Determine if duplicate of COMPREHENSIVE_AUDIT_REPORT.md
- [ ] If duplicate: Delete and reference audit report instead
- [ ] If unique: Clarify purpose and link from README

---

### FIX #8: Create Development Setup Guide
**Status:** ⚠️ NEEDS FIX  
**Action:** Create `docs/SETUP_GUIDE.md`

**Should include:**
```markdown
# Development Setup Guide

## Prerequisites
- Node.js 18+
- npm 9+
- Docker (for PostgreSQL)
- Git
- Figma account (optional, for design review)

## Step 1: Clone Repository
\`\`\`bash
git clone https://github.com/yourusername/manga-zone.git
cd manga-zone
\`\`\`

## Step 2: Install Dependencies
\`\`\`bash
npm install
\`\`\`

## Step 3: Setup Database (PostgreSQL)

### Option A: Docker (Recommended)
\`\`\`bash
docker run --name manga-zone-db \\
  -e POSTGRES_PASSWORD=dev_password \\
  -e POSTGRES_DB=manga_zone_dev \\
  -p 5432:5432 \\
  -v postgres_data:/var/lib/postgresql/data \\
  postgres:15
\`\`\`

### Option B: Local PostgreSQL
\`\`\`bash
# macOS
brew install postgresql
brew services start postgresql

# Create database
createdb manga_zone_dev
\`\`\`

## Step 4: Configure Environment
\`\`\`bash
# Copy example env
cp docs/.env.example .env.local

# Edit .env.local and set:
# - DATABASE_URL
# - JWT_SECRET
# - ENCRYPTION_KEY
\`\`\`

## Step 5: Setup Database Schema
\`\`\`bash
# Run migrations
npx prisma migrate deploy

# Seed with test data
npm run db:seed
\`\`\`

## Step 6: Start Development Server
\`\`\`bash
npm run dev
\`\`\`

Open http://localhost:3000 in your browser.

## Step 7: Verify Setup
- [ ] Homepage loads
- [ ] Can navigate to /api/manga
- [ ] Database connection works
- [ ] No console errors

## Common Issues

### "Cannot find module 'next'"
\`\`\`bash
npm install
\`\`\`

### "PostgreSQL connection refused"
- Verify PostgreSQL running: `psql -U postgres`
- Check DATABASE_URL in .env.local
- For Docker: `docker ps` to verify container running

### "Prisma error - migrations not synced"
\`\`\`bash
npx prisma migrate resolve
npx prisma migrate deploy
\`\`\`

## Next Steps
1. Read [START_HERE.md](START_HERE.md) for your role
2. Review relevant specification files
3. Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for common tasks
```

**Action Items:**
- [ ] Create docs/SETUP_GUIDE.md with steps above
- [ ] Test all instructions actually work
- [ ] Add troubleshooting section
- [ ] Link from README.md

---

### FIX #9: Verify All Internal Links Work
**Status:** ⚠️ NEEDS CHECK  
**Action:** Audit all cross-file references

**Check these files:**
- [ ] QUICK_REFERENCE.md - Verify all links work
- [ ] START_HERE.md - Check all role links
- [ ] INDEX.md - Test navigation
- [ ] README.md - Verify all links in intro

**Common link patterns to check:**
```markdown
[TESTING_STRATEGY.md](TESTING_STRATEGY.md)
[API_DOCUMENTATION.md#endpoints](API_DOCUMENTATION.md#endpoints)
../docs/SETUP_GUIDE.md
```

**Action Items:**
- [ ] Read each file and check markdown links
- [ ] Verify all files referenced actually exist
- [ ] Fix any broken or incorrect paths
- [ ] Test in GitHub (links look different in preview)

---

## 🟢 POLISH FIXES (2 HOURS)

### FIX #10-12: Minor Updates
**Status:** ⚠️ NEEDS UPDATE

1. **Standardize timestamps**
   - [ ] All files should say "2026-05-15"
   - [ ] Consistent format: "2026-05-15T05:43:43Z"

2. **Test all code examples**
   - [ ] Mark tested examples with: `// ✅ Tested`
   - [ ] Mark untested with: `// ⚠️ Example only`

3. **Add visual diagrams**
   - [ ] Architecture diagram
   - [ ] Data flow diagram
   - [ ] User journey diagrams

---

## ✅ VERIFICATION CHECKLIST

Before marking as "PRODUCTION READY", verify:

**Critical Fixes (Must do):**
- [ ] TypeScript examples compile without errors
- [ ] Prisma schema is valid
- [ ] All 42 API endpoints documented
- [ ] Naming conventions document created
- [ ] Environment variables documented

**Important Fixes (Should do):**
- [ ] Duplicate content consolidated
- [ ] PRODUCTION_REVIEW file handled
- [ ] Setup guide created and tested
- [ ] All internal links work

**Polish (Nice to have):**
- [ ] Timestamps consistent
- [ ] Code examples marked as tested/untested
- [ ] Visual diagrams added

---

## 📊 COMPLETION TRACKING

| Fix # | Title | Status | Time | Assignee |
|-------|-------|--------|------|----------|
| 1 | TypeScript Syntax Errors | ⏳ TODO | 1.5 hr | Developer |
| 2 | Invalid Prisma Directives | ⏳ TODO | 0.5 hr | Developer |
| 3 | Missing API Endpoints | ⏳ TODO | 2 hr | Developer |
| 4 | Naming Conventions Doc | ⏳ TODO | 1 hr | Developer |
| 5 | Environment Variables | ⏳ TODO | 1 hr | DevOps |
| 6 | CWV Consolidation | ⏳ TODO | 1 hr | Designer |
| 7 | PRODUCTION_REVIEW file | ⏳ TODO | 0.5 hr | Project Lead |
| 8 | Setup Guide | ⏳ TODO | 1.5 hr | Developer |
| 9 | Link Verification | ⏳ TODO | 0.5 hr | QA |
| 10 | Code Examples Status | ⏳ TODO | 1 hr | Developer |
| 11 | Timestamps | ⏳ TODO | 0.5 hr | QA |
| 12 | Diagrams | ⏳ TODO | 2 hr | Designer |

**Total Time:** 12 hours  
**Deadline for Production:** 2026-05-20

---

## 🎯 SUCCESS CRITERIA

After all fixes:
- ✅ No syntax errors in code examples
- ✅ All 42 API endpoints documented
- ✅ Database schema compiles
- ✅ Naming conventions consistent
- ✅ No duplicate content
- ✅ Setup takes < 15 minutes
- ✅ All links working
- ✅ Production ready ✅

---

**READY TO IMPLEMENT? Start with Fix #1-5 (CRITICAL)**
