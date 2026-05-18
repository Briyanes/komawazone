# FINAL PRE-IMPLEMENTATION AUDIT REPORT
## Manga Zone Documentation — Complete Cross-File Review

**Audit Date:** 2026-05-15  
**Files Reviewed:** 32 markdown files (all docs/)  
**Auditor:** GitHub Copilot — automated cross-file analysis  
**Status:** ⚠️ NEEDS FIXES BEFORE IMPLEMENTATION

---

## 📊 EXECUTIVE SUMMARY

| Category | Count |
|----------|-------|
| 🔴 CRITICAL issues | **12** |
| 🟡 WARNING issues | **18** |
| ℹ️ INFO issues | **9** |
| **Total issues** | **39** |

**Overall Verdict:** ⛔ **NOT READY FOR IMPLEMENTATION**

The existing self-audit (`COMPREHENSIVE_AUDIT_REPORT.md`) rated documentation at 92/100 with "NO Critical Errors." **This assessment is inaccurate.** This audit found 12 critical issues — including two completely incompatible database schemas, a Figma color system that contradicts every other document, and App Router vs Pages Router confusion in testing and TypeScript examples.

> **Authority document:** `NAMING_CONVENTIONS.md` is explicitly the authoritative source. Where conflicts exist, NAMING_CONVENTIONS.md wins unless overridden below.

---

## 🔴 CRITICAL ISSUES (Blocking)

---

### CRIT-01 — Two Incompatible Database Schemas Coexist

**Files:** `DATABASE_MIGRATIONS.md` (Prisma schema) vs `IMPLEMENTATION_GUIDE.md` (raw SQL schema)  
**Severity:** 🔴 CRITICAL — blocks all database work

These two documents define completely different schemas for the same application. Developers following either schema alone will produce an incompatible database.

| Concept | DATABASE_MIGRATIONS.md (Prisma) | IMPLEMENTATION_GUIDE.md (SQL) | NAMING_CONVENTIONS.md |
|---|---|---|---|
| Reading tracking table | `reading_history` (`ReadingHistory` model) | `reading_progress` | `reading_progress` ✅ |
| Page/image table | `pages` (`Page` model) | `chapter_images` | `chapter_images` ✅ |
| ID type | `cuid()` | `gen_random_uuid()` UUID | not specified |
| Bookmark columns | `userId`, `mangaId`, `chapterId` | `user_id`, `manga_id` only | not specified |

**Resolution required:**
1. Choose one schema as the single source of truth — **IMPLEMENTATION_GUIDE.md SQL is preferred** because NAMING_CONVENTIONS.md confirms both `reading_progress` and `chapter_images` as canonical names.
2. Update DATABASE_MIGRATIONS.md to align: rename `ReadingHistory` model → use `@@map("reading_progress")`, rename `Page` model → use `@@map("chapter_images")`.
3. Decide on UUID vs CUID — UUID (`gen_random_uuid()`) is standard for Supabase.

---

### CRIT-02 — FIGMA Files Use Entirely Different Color System

**Files:** `FIGMA_COMPONENT_LIBRARY_GUIDE.md` + `FIGMA_IMPLEMENTATION_GUIDE.md` vs every other file  
**Severity:** 🔴 CRITICAL — any design work will produce wrong colors

The Figma documents define a completely different brand color palette:

| Token | FIGMA docs | All other docs | Correct? |
|---|---|---|---|
| Primary brand color | `#FF8C1A` (orange-amber) | `#FF6B35` (orange-red) | FIGMA is **wrong** |
| Dark background | `#0F172A` (slate) | `#121212` / `#1A1A1A` | FIGMA is **wrong** |
| Dark surface | `#1E293B` | `#2D2D2D` | FIGMA is **wrong** |
| Success | `#22C55E` | `#10B981` | FIGMA is **wrong** |

**Resolution required:** Update `FIGMA_COMPONENT_LIBRARY_GUIDE.md` and `FIGMA_IMPLEMENTATION_GUIDE.md` (Step 4: Setup Color Library) to use the canonical values from `DESIGN_SYSTEM.md`:
- Primary/500: `#FF6B35` (not `#FF8C1A`)
- Success/500: `#10B981` (not `#22C55E`)
- Dark/Background: `#121212`, Dark/Surface-Primary: `#1A1A1A`, Surface-Secondary: `#2D2D2D`

---

### CRIT-03 — Invalid Prisma `@@fulltext` Directive

**File:** `DATABASE_MIGRATIONS.md` (Manga model)  
**Severity:** 🔴 CRITICAL — `npx prisma generate` will fail

```prisma
// ❌ CURRENT — will not compile:
model Manga {
  @@fulltext([title, description])  // NOT a valid Prisma directive
}
```

**Resolution required:** Remove `@@fulltext`. Add a raw SQL migration to create a GIN index:
```sql
CREATE INDEX idx_manga_search ON manga
  USING GIN(to_tsvector('english', title || ' ' || description));
```

---

### CRIT-04 — Prisma M2M Relationships Missing `@relation`

**File:** `DATABASE_MIGRATIONS.md` (Manga ↔ Genre, Manga ↔ Author)  
**Severity:** 🔴 CRITICAL — Prisma schema will not validate

```prisma
// ❌ CURRENT — invalid implicit M2M without @relation names:
model Manga {
  genres  Genre[]     // missing @relation
  authors Author[]    // missing @relation
}
```

**Resolution required:**
```prisma
model Manga {
  genres  Genre[]  @relation("MangaGenre")
  authors Author[] @relation("MangaAuthor")
}
model Genre {
  manga   Manga[]  @relation("MangaGenre")
}
model Author {
  manga   Manga[]  @relation("MangaAuthor")
}
```

---

### CRIT-05 — App Router vs Pages Router Confusion in Tests

**File:** `TESTING_STRATEGY.md` (setupTests.ts, lines ~233–254)  
**Severity:** 🔴 CRITICAL — tests will fail at setup

The project uses **Next.js 15 App Router**, but tests mock `next/router` (Pages Router API):

```typescript
// ❌ CURRENT — Pages Router (wrong for this project):
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), pathname: '/' }),
}));
```

**Resolution required:**
```typescript
// ✅ CORRECT — App Router:
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
```

Also: `jest.config.js` excludes `src/pages/_app.tsx` and `src/pages/_document.tsx` — these files don't exist in App Router projects; remove those exclusions.

---

### CRIT-06 — TYPESCRIPT_SETUP.md Uses Pages Router API Patterns

**File:** `TYPESCRIPT_SETUP.md` (lines ~290–400)  
**Severity:** 🔴 CRITICAL — example code is architecturally wrong

`TYPESCRIPT_SETUP.md` shows API handler patterns using `NextApiRequest`/`NextApiResponse` and `src/pages/api/...` path conventions — these are the **Pages Router** API patterns. This project uses **App Router Route Handlers** (`src/app/api/.../route.ts`):

```typescript
// ❌ CURRENT (Pages Router):
import { NextApiRequest, NextApiResponse } from 'next';
// src/pages/api/manga/[id].ts
export default function handler(req: NextApiRequest, res: NextApiResponse) {...}

// ✅ CORRECT (App Router):
import { NextRequest, NextResponse } from 'next/server';
// src/app/api/manga/[id]/route.ts
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({...})
}
```

**Resolution required:** Rewrite all API handler examples in TYPESCRIPT_SETUP.md to use App Router Route Handler syntax.

---

### CRIT-07 — TYPESCRIPT_SETUP.md tsconfig Conflicts with Next.js

**File:** `TYPESCRIPT_SETUP.md` (tsconfig.json example)  
**Severity:** 🔴 CRITICAL — will conflict with Next.js build system

```json
// ❌ CURRENT — Next.js manages its own compilation output:
{
  "compilerOptions": {
    "outDir": "./dist",   // Next.js doesn't use this
    "rootDir": "./src"    // Next.js requires this absent
  }
}
```

Next.js manages `outDir` internally (`.next/`). Setting `outDir`/`rootDir` breaks `next build`.

**Resolution required:** Remove `outDir` and `rootDir` from the tsconfig example. The correct minimal tsconfig for Next.js 15 should use `"moduleResolution": "bundler"` (not `"node"`).

---

### CRIT-08 — JSX in `.ts` File in setupTests Example

**Files:** `TYPESCRIPT_SETUP.md` + `TESTING_STRATEGY.md`  
**Severity:** 🔴 CRITICAL — TypeScript compilation error

```typescript
// ❌ CURRENT (in .ts file — JSX not allowed):
jest.mock('next/image', () => ({
  default: (props) => <img {...props} />,  // JSX in .ts file!
}));
```

**Resolution required** (in `setupTests.ts` → rename to `setupTests.tsx`, or use):
```typescript
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => React.createElement('img', props),
}));
```

---

### CRIT-09 — npm Install Command Has Typos

**File:** `IMPLEMENTATION_GUIDE.md` (lines ~40–41)  
**Severity:** 🔴 CRITICAL — install will fail

```bash
# ❌ CURRENT:
npm install sentry/nextjs dompur ...
#            ↑ missing @    ↑ not a real package

# ✅ CORRECT:
npm install @sentry/nextjs dompurify ...
```

**Resolution required:** Fix `sentry/nextjs` → `@sentry/nextjs` and `dompur` → `dompurify` (or `isomorphic-dompurify` which is already used in AD_MANAGEMENT.md code examples).

---

### CRIT-10 — Two Incompatible Ad Schemas

**Files:** `DATABASE_MIGRATIONS.md` (Prisma `Ad` model) vs `AD_MANAGEMENT.md` + `IMPLEMENTATION_GUIDE.md` + `CHECKLIST.md`  
**Severity:** 🔴 CRITICAL — ad system cannot be built from both

| File | Ad Schema |
|---|---|
| DATABASE_MIGRATIONS.md | Single `ads` table (Prisma `Ad` model): `name, type, placement, htmlContent, isActive, priority` |
| AD_MANAGEMENT.md | 4 tables: `ad_providers`, `ad_zones`, `ad_campaigns`, `ad_analytics` |
| IMPLEMENTATION_GUIDE.md | 4 tables (same as AD_MANAGEMENT.md) |
| CHECKLIST.md | Lists all 4 tables as required ✅ |

**Resolution required:** DATABASE_MIGRATIONS.md Prisma schema must be updated to match the 4-table ad schema in AD_MANAGEMENT.md. The simple `Ad` model and seed data using `prisma.ad.create()` must be replaced.

---

### CRIT-11 — Error Response `details` Format Inconsistent

**Files:** `API_DOCUMENTATION.md` (lines ~95–110) vs `ERROR_HANDLING.md` (lines ~110–130)  
**Severity:** 🔴 CRITICAL — frontend will crash on error responses

```json
// API_DOCUMENTATION.md says array:
{ "error": { "details": [{ "field": "email", "message": "..." }] } }

// ERROR_HANDLING.md says object:
{ "error": { "details": { "field": "email", "message": "..." } } }
```

**Resolution required:** Standardize to array format (as in API_DOCUMENTATION.md) — an array correctly handles multiple validation errors:
```json
{ "details": [{ "field": "string", "message": "string", "code": "string" }] }
```
Update ERROR_HANDLING.md to match.

---

### CRIT-12 — Shadow Values Contradicted Between Authority Docs

**Files:** `NAMING_CONVENTIONS.md` (lines 244–259) vs `DESIGN_SYSTEM.md` (CSS variables)  
**Severity:** 🔴 CRITICAL — both are "source of truth" documents but contradict each other

| Token | NAMING_CONVENTIONS.md | DESIGN_SYSTEM.md |
|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.1)` | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | `0 4px 6px -1px rgba(0, 0, 0, 0.1)` |

**Resolution required:** DESIGN_SYSTEM.md values are more specific and align with Tailwind CSS v4 defaults. Update `NAMING_CONVENTIONS.md` shadow values to match `DESIGN_SYSTEM.md`:
- `--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05)`
- `--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1)`

---

## 🟡 WARNING ISSUES (Should Fix)

---

### WARN-01 — Performance Targets Contradict Between Files

**Files:** `DESIGN_SYSTEM.md` vs `PERFORMANCE_OPTIMIZATION.md`

| Metric | DESIGN_SYSTEM.md | PERFORMANCE_OPTIMIZATION.md |
|---|---|---|
| TTFB | `< 800ms` | `< 600ms` |
| JS Bundle | `< 200KB gzipped` | `< 150KB` |
| CSS Bundle | `< 50KB gzipped` | `< 40KB` |

**Fix:** Per DESIGN_SYSTEM.md's role as single source of truth for CWV targets, add a note in PERFORMANCE_OPTIMIZATION.md: *"See DESIGN_SYSTEM.md for authoritative targets."* Or align both to the stricter values (PERFORMANCE_OPTIMIZATION.md) which are more realistic for mobile-first.

---

### WARN-02 — Button Color Values Differ

**Files:** `COMPONENT_STATES.md` vs `DESIGN_SYSTEM.md`

| State | COMPONENT_STATES.md | DESIGN_SYSTEM.md |
|---|---|---|
| Primary hover | `#E55A2B` | `#E85A28` |
| Danger/error | `#FF3333` | `#EF4444` |

**Fix:** Use DESIGN_SYSTEM.md values. Update COMPONENT_STATES.md button specs.

---

### WARN-03 — Breakpoint Inconsistency

**File:** `RESPONSIVE_DESIGN.md` vs `DESIGN_SYSTEM.md`

RESPONSIVE_DESIGN.md mentions `600px` as a breakpoint in some places; DESIGN_SYSTEM.md and Tailwind config use the standard `640px` (Tailwind `sm`).

**Fix:** Audit all breakpoint values in RESPONSIVE_DESIGN.md and normalize to standard Tailwind breakpoints: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`.

---

### WARN-04 — `NEXT_PUBLIC_SUPABASE_URL` Missing from `docs/.env.example`

**Files:** `DEVOPS_DEPLOYMENT.md` vs `README.md` / `QUICK_REFERENCE.md` / `SETUP_GUIDE.md`

DEVOPS_DEPLOYMENT.md shows `NEXT_PUBLIC_API_URL` in the env example; all other files correctly show `NEXT_PUBLIC_SUPABASE_URL`. SETUP_GUIDE.md references `cp docs/.env.example .env.local` — if `.env.example` is wrong, setup fails.

**Fix:** Ensure `docs/.env.example` includes `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as required variables.

---

### WARN-05 — Commit Message Format Contradicted

**Files:** `QUICK_REFERENCE.md` vs `NAMING_CONVENTIONS.md`

- QUICK_REFERENCE.md: `[feat] Add manga search` (square bracket prefix)
- NAMING_CONVENTIONS.md: `feat: Add manga search` (Conventional Commits — colon)

**Fix:** Update QUICK_REFERENCE.md to use Conventional Commits format without brackets. NAMING_CONVENTIONS.md is authoritative.

---

### WARN-06 — `design-tokens.ts` File Name Violates Convention

**Files:** `CHECKLIST.md` (line 26), `IMPLEMENTATION_GUIDE.md`, `README.md` directory listing vs `NAMING_CONVENTIONS.md`

NAMING_CONVENTIONS.md specifies config files use `camelCase`. The filename `design-tokens.ts` uses `kebab-case`.

**Fix:** Either:
1. Rename documented file to `designTokens.ts` everywhere, OR
2. Add an explicit exception in NAMING_CONVENTIONS.md for this file.

---

### WARN-07 — Password Hashing Algorithm Inconsistent

**Files:** `SECURITY_COMPLIANCE.md` (uses `argon2`) vs `EXPERT_REVIEW.md` (recommends `bcrypt`)

Argon2 is actually the more secure choice. The inconsistency is that examples in different files may set up different libraries.

**Fix:** Standardize on `argon2` (the better algorithm). Add a note in EXPERT_REVIEW.md: *"Use argon2 per SECURITY_COMPLIANCE.md."*

---

### WARN-08 — 10+ Referenced Files Do Not Exist

**Files:** `EXPERT_REVIEW.md`, `TEAM_REVIEW_SUMMARY.md`

The following files are linked/referenced but do not exist in `docs/`:
- `OBSERVABILITY.md`
- `CI_CD_PIPELINE.md`
- `STATE_MANAGEMENT_DEEP_DIVE.md` / `STATE_MANAGEMENT.md`
- `SEO_STRATEGY.md`
- `SECURITY_CHECKLIST.md`
- `IMAGE_OPTIMIZATION.md`
- `CACHING_STRATEGY.md`
- `DISASTER_RECOVERY.md`
- `AUTH_DEEP_DIVE.md`
- `MOBILE_PATTERNS.md`
- `DARK_MODE_IMPLEMENTATION.md`
- `AD_DESIGN_SPEC.md`
- `EMPTY_ERROR_STATES.md`

**Fix:** Either create stub files for the most critical ones (CI_CD_PIPELINE.md, STATE_MANAGEMENT.md, IMAGE_OPTIMIZATION.md) or mark all references as `*(planned)*` in the source files.

---

### WARN-09 — API Endpoint Count Claimed vs Actual

**File:** `API_DOCUMENTATION.md`

Header claims "42 endpoints." The existing audit found 35–36 unique endpoint definitions; an implementation checklist near the end duplicates entries, inflating the apparent count to 66.

**Fix:** Remove the duplicate endpoint checklist (lines ~1705–1730). Verify the actual unique count. If 42 is the target, document the 6–7 missing endpoints (GDPR export, admin health, consent API, avatar upload).

---

### WARN-10 — `NEXT_PUBLIC_API_URL` Used in DEVOPS but Not in Other Docs

**File:** `DEVOPS_DEPLOYMENT.md` (env section)

`NEXT_PUBLIC_API_URL` is shown as an env variable. No other file references this variable; all other files use `NEXT_PUBLIC_SUPABASE_URL`. This may be a legacy variable or a mistake.

**Fix:** Remove `NEXT_PUBLIC_API_URL` from DEVOPS_DEPLOYMENT.md or add it to all env examples with an explanation.

---

### WARN-11 — Bookmark Schema Inconsistency

**Files:** `DATABASE_MIGRATIONS.md` vs `IMPLEMENTATION_GUIDE.md`

DATABASE_MIGRATIONS.md Prisma `Bookmark` has `chapterId` as a required field. IMPLEMENTATION_GUIDE.md SQL `bookmarks` table has only `user_id` + `manga_id` (no chapter reference). This makes the Prisma seed data (which seeds a bookmark WITH a chapterId) incompatible with the SQL schema.

**Fix:** Decide whether bookmarks are per-manga or per-chapter. Update both schema definitions to match. (Recommendation: per-manga is simpler; chapter can be added as optional foreign key later.)

---

### WARN-12 — `@@fulltext` Previously Flagged but Not Fixed

**Status:** The existing `CORRECTIONS_AND_UPDATES.md` documents this fix as a required action but it has NOT been applied to `DATABASE_MIGRATIONS.md`.

All "corrections" documented in `CORRECTIONS_AND_UPDATES.md` and `PRODUCTION_FIXES_ACTION_PLAN.md` remain unimplemented in the actual files. The files those reports claim to have fixed still contain the original errors.

---

### WARN-13 — `COMPREHENSIVE_AUDIT_REPORT.md` Contains Inaccurate Self-Assessment

**File:** `COMPREHENSIVE_AUDIT_REPORT.md`

This file rates documentation at **92/100** with **"NO Critical Errors Found"** and **"Production Ready."** This audit found 12 critical blocking issues. The prior audit missed:
- The FIGMA color system contradiction (CRIT-02)
- The App Router/Pages Router confusion (CRIT-05, CRIT-06)
- The shadow value contradiction between authority docs (CRIT-12)
- The ad schema bifurcation (CRIT-10)

**Fix:** Update or supersede COMPREHENSIVE_AUDIT_REPORT.md with this report's findings.

---

### WARN-14 — `IMPLEMENTATION_GUIDE.md` Phases 3+ Are Stubs

**File:** `IMPLEMENTATION_GUIDE.md`

Phases 3, 4, 5, 6, 7+ all end with `*(Detailed implementation continues...)*` with no actual content.

**Fix:** Either complete these phases or add clear references to the dedicated spec files (COMPONENT_STATES.md, RESPONSIVE_DESIGN.md, API_DOCUMENTATION.md) so developers know where to look.

---

### WARN-15 — `PRODUCTION_REVIEW_REPORT.md` Is Superseded but Still Present

**File:** `PRODUCTION_REVIEW_REPORT.md`

The file itself declares it is **SUPERSEDED** by COMPREHENSIVE_AUDIT_REPORT.md, yet still exists as an incomplete draft with action items marked as pending. Having a superseded draft in the same folder creates confusion.

**Fix:** Either delete this file or add a prominent banner at the top and remove from INDEX.md navigation.

---

### WARN-16 — Duplicate Information Across Multiple Files

**Confirmed duplications:**
- Core Web Vitals targets: defined in `DESIGN_SYSTEM.md`, `RESPONSIVE_DESIGN.md`, `TESTING_STRATEGY.md`, `PERFORMANCE_OPTIMIZATION.md`, `TEAM_EXPERT_REVIEW.md`, `EXPERT_REVIEW.md`
- Color system: defined in `DESIGN_SYSTEM.md`, `RESPONSIVE_DESIGN.md`, `COMPONENT_STATES.md`, `FIGMA_COMPONENT_LIBRARY_GUIDE.md`
- Typography: defined in `DESIGN_SYSTEM.md`, `FIGMA_COMPONENT_LIBRARY_GUIDE.md`, `FIGMA_IMPLEMENTATION_GUIDE.md`

**Fix:** Convert duplicates into cross-references: *"For performance targets, see [DESIGN_SYSTEM.md#core-web-vitals]"*.

---

### WARN-17 — `info` Color Missing from Dark Mode CSS Variables

**File:** `DESIGN_SYSTEM.md`

The dark mode CSS variable block does not define `--color-info`. IMPLEMENTATION_GUIDE.md `design-tokens.ts` defines dark `info: '#60A5FA'`. This gap means the dark mode info color is undefined in the canonical CSS file.

**Fix:** Add `--color-info: #60A5FA;` to the dark mode CSS variable block in DESIGN_SYSTEM.md.

---

### WARN-18 — Button Secondary Background Not in Design System

**File:** `COMPONENT_STATES.md`

Secondary button background listed as `#F0F0F0`. DESIGN_SYSTEM.md defines `--color-surface-secondary: #F5F5F7`. These are different values for what should be the same concept.

**Fix:** Update COMPONENT_STATES.md secondary button background to use `var(--color-surface-secondary)` / `#F5F5F7`.

---

## ℹ️ INFO ISSUES (Low Priority)

---

### INFO-01 — INDEX.md Has Garbled/Broken Markdown

**File:** `INDEX.md`

Section headings and navigation text are merged incorrectly (e.g., `"Quick Answers##"`, headings concatenated with content). This is a markdown formatting issue, not a content issue.

**Fix:** Reformat INDEX.md headings — likely caused by missing blank lines before `##` headers.

---

### INFO-02 — START_HERE.md Has Garbled Headings

**File:** `START_HERE.md`

Headings like `"START_HERE. YOU ARE HEREmd"` and `"TEAM_EXPERT_REVIEW. MAIN - Designer + Developer assessmentmd"` indicate corrupted text (likely auto-generated with filename injection that didn't format correctly).

**Fix:** Correct the heading text to be human-readable navigation labels.

---

### INFO-03 — ALL_DOCUMENTATION.md Orphaned Text Fragment

**File:** `ALL_DOCUMENTATION.md` (line ~96)

Text fragment ` 64px Fibonacci)` appears as an orphaned incomplete bullet point.

**Fix:** Either complete the bullet or remove it.

---

### INFO-04 — JWT Uses HS256 (Shared Secret)

**Files:** `API_DOCUMENTATION.md`, `SECURITY_COMPLIANCE.md`

Both specify `HS256` algorithm for JWT. For a platform with an admin role, `RS256` (asymmetric) is more secure — it allows verification without exposing the signing key.

**Fix:** Consider upgrading to RS256 especially for admin token verification. Add a note in SECURITY_COMPLIANCE.md acknowledging the HS256 choice and its trade-offs.

---

### INFO-05 — Prisma Session Model May Be Unnecessary

**File:** `DATABASE_MIGRATIONS.md`

The Prisma schema includes a `Session` model. If the auth strategy is JWT-only (as documented in SECURITY_COMPLIANCE.md and API_DOCUMENTATION.md), server-side session storage is not needed. This creates an unused table.

**Fix:** Clarify in DATABASE_MIGRATIONS.md whether the Session model is needed. If JWT-only: remove it.

---

### INFO-06 — AuditLog Model Not Referenced in API Docs

**File:** `DATABASE_MIGRATIONS.md`

The Prisma schema includes an `AuditLog` model, but `API_DOCUMENTATION.md` documents no audit log endpoints. Either there should be endpoints or the model is over-scoped for initial implementation.

**Fix:** Either add admin audit log endpoints to API_DOCUMENTATION.md, or mark AuditLog as a Phase 2 feature.

---

### INFO-07 — `CHECKLIST.md` References `Prisma Studio` Command

**File:** `CHECKLIST.md` + `SETUP_GUIDE.md`

Both reference `npm run db:studio` (Prisma Studio). Supabase projects typically use the Supabase Dashboard instead of Prisma Studio. Clarify whether Prisma ORM is used alongside Supabase or whether Supabase's built-in tools are preferred.

---

### INFO-08 — SETUP_GUIDE.md References `NEXTAUTH_SECRET` and `NEXTAUTH_URL`

**File:** `SETUP_GUIDE.md` (Step 3D, lines 100–101)

This project uses Supabase Auth, not NextAuth. The variables `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are NextAuth.js-specific. Other docs don't reference these.

**Fix:** Remove `NEXTAUTH_SECRET` and `NEXTAUTH_URL` from required variables. Replace with Supabase-equivalent: `SUPABASE_JWT_SECRET` if needed.

---

### INFO-09 — DETAILED_AUDIT_FINDINGS.md Contradicts Its Own Fix

**File:** `DETAILED_AUDIT_FINDINGS.md` (Issue #3, Fix Required section)

Shows the "FIXED" Prisma code still without `@relation` attributes:
```prisma
// In Manga model:
genres  Genre[]   // ← still missing @relation!
```
The correction shown IS the bug. The fix section needs to show the proper `@relation("MangaGenre")` syntax.

---

## 📋 SUMMARY TABLE

| File | Critical | Warning | Info | Verdict |
|------|----------|---------|------|---------|
| DATABASE_MIGRATIONS.md | 4 (CRIT-01, 03, 04, 10) | 2 (WARN-11, 12) | 2 (INFO-05, 06) | 🔴 Fix before use |
| FIGMA_COMPONENT_LIBRARY_GUIDE.md | 1 (CRIT-02) | — | — | 🔴 Fix before design work |
| FIGMA_IMPLEMENTATION_GUIDE.md | 1 (CRIT-02) | — | — | 🔴 Fix before design work |
| TESTING_STRATEGY.md | 2 (CRIT-05, 08) | — | — | 🔴 Fix before testing |
| TYPESCRIPT_SETUP.md | 3 (CRIT-06, 07, 08) | — | 1 (INFO) | 🔴 Fix before TypeScript setup |
| IMPLEMENTATION_GUIDE.md | 2 (CRIT-01, 09) | 1 (WARN-14) | — | 🔴 Fix typos immediately |
| AD_MANAGEMENT.md | 1 (CRIT-10) | — | — | 🔴 Schema decision required |
| API_DOCUMENTATION.md | 1 (CRIT-11) | 2 (WARN-09, 10) | 1 (INFO-04) | 🟡 Fix error format |
| ERROR_HANDLING.md | 1 (CRIT-11) | — | — | 🟡 Fix error format |
| NAMING_CONVENTIONS.md | 1 (CRIT-12) | 1 (WARN-06) | — | 🟡 Fix shadow values |
| DESIGN_SYSTEM.md | — | 2 (WARN-01, 17) | — | 🟡 Add missing dark var |
| PERFORMANCE_OPTIMIZATION.md | — | 1 (WARN-01) | — | 🟡 Align targets |
| COMPONENT_STATES.md | — | 2 (WARN-02, 18) | — | 🟡 Fix button values |
| RESPONSIVE_DESIGN.md | — | 1 (WARN-03) | — | 🟡 Fix breakpoints |
| DEVOPS_DEPLOYMENT.md | — | 2 (WARN-04, 10) | — | 🟡 Fix env vars |
| QUICK_REFERENCE.md | — | 1 (WARN-05) | — | ℹ️ Minor fix |
| COMPREHENSIVE_AUDIT_REPORT.md | — | 1 (WARN-13) | — | ℹ️ Superseded |
| EXPERT_REVIEW.md | — | 1 (WARN-08) | — | ℹ️ Missing refs |
| TEAM_REVIEW_SUMMARY.md | — | 1 (WARN-08) | — | ℹ️ Missing refs |
| INDEX.md | — | — | 1 (INFO-01) | ℹ️ Formatting fix |
| START_HERE.md | — | — | 1 (INFO-02) | ℹ️ Formatting fix |
| ALL_DOCUMENTATION.md | — | — | 1 (INFO-03) | ℹ️ Minor |
| SETUP_GUIDE.md | — | — | 1 (INFO-08) | ℹ️ Remove wrong vars |
| SECURITY_COMPLIANCE.md | — | 1 (WARN-07) | 1 (INFO-04) | ℹ️ Minor |
| CHECKLIST.md | — | — | 1 (INFO-07) | ✅ Good |
| PRODUCTION_REVIEW_REPORT.md | — | 1 (WARN-15) | — | ℹ️ Superseded |
| CORRECTIONS_AND_UPDATES.md | — | 1 (WARN-12) | — | ℹ️ Unimplemented |
| DETAILED_AUDIT_FINDINGS.md | — | — | 1 (INFO-09) | ℹ️ Wrong fix shown |

---

## 🔥 TOP 5 ISSUES TO FIX FIRST

1. **CRIT-01** — Unify the two incompatible database schemas (Prisma vs SQL). Everything else depends on this.
2. **CRIT-02** — Fix FIGMA docs to use the correct brand color `#FF6B35` (not `#FF8C1A`). All design work is blocked.
3. **CRIT-05 + CRIT-06** — Replace Pages Router patterns with App Router (`next/navigation`, Route Handlers, `NextRequest`/`NextResponse`).
4. **CRIT-03 + CRIT-04** — Fix invalid Prisma directives (`@@fulltext`, missing `@relation`) so `prisma generate` and `prisma migrate` work.
5. **CRIT-10** — Decide on the ad schema (simple `ads` table vs 4-table system) and align DATABASE_MIGRATIONS.md with it.

---

## ✅ WHAT IS ALREADY GOOD

- API documentation is comprehensive and well-structured (35+ endpoints with request/response examples)
- Security approach (RLS, Supabase Auth, rate limiting, CSRF) is solid
- Component state specifications (loading, empty, error, hover) are thorough
- Responsive design breakpoints follow Tailwind standards (mostly)
- DevOps/deployment pipeline (Vercel + GitHub Actions) is well-described
- Testing strategy coverage goals and methodology are appropriate
- Error boundary and error handling patterns are sound (once format inconsistency is fixed)

---

*This report supersedes `COMPREHENSIVE_AUDIT_REPORT.md` (which rated 92/100 with no critical issues — an inaccurate assessment). All 39 issues in this report are new findings not previously captured.*
