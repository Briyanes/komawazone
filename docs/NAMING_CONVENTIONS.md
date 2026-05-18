# NAMING_CONVENTIONS.md
## Manga Zone — Unified Naming Conventions

**Document ID:** NAMING-001  
**Status:** AUTHORITATIVE — all other files defer to this  
**Scope:** Figma components, TypeScript code, database, file system, API routes, CSS classes

---

## 1. FIGMA COMPONENT NAMING

### Format
```
Category/ComponentName/Variant/Size/State
```

### Rules
- Use **forward slashes** as separators (enables nested groups in Figma)
- **PascalCase** for each segment
- Max 4 levels deep: `Category/Name/Variant/State`
- State is always the **last** segment

### Examples
```
✅ Correct:
  Atoms/Button/Primary/Medium/Default
  Atoms/Button/Primary/Medium/Hover
  Atoms/Button/Primary/Medium/Disabled
  Atoms/Button/Secondary/Large/Loading
  Molecules/MangaCard/Default/Default
  Molecules/MangaCard/Default/Hover
  Molecules/MangaCard/Skeleton/Default
  Organisms/Header/Desktop/Default
  Organisms/Header/Mobile/Default
  Templates/ReaderPage/Mobile/Default
  Templates/HomePage/Desktop/Default

❌ Incorrect (do NOT use):
  button-primary          (kebab-case — use PascalCase)
  Button Primary Medium   (spaces — use slashes)
  btn/primary             (abbreviation — spell it out)
  Atoms/Button/Primary    (missing State at end — add Default)
```

### Categories
| Category | What it contains |
|----------|-----------------|
| `Atoms` | Single-purpose primitives: Button, Input, Badge, Avatar, Icon |
| `Molecules` | 2–3 atoms combined: MangaCard, SearchBar, FormField |
| `Organisms` | Complex components: Header, Sidebar, ChapterReader |
| `Templates` | Full page layouts: HomePage, ReaderPage, AdminDashboard |
| `Tokens` | Design tokens: Colors, Typography, Spacing, Shadows |

### States (always last segment)
`Default` | `Hover` | `Focus` | `Active` | `Disabled` | `Loading` | `Error` | `Success`

---

## 2. TYPESCRIPT / REACT NAMING

### Files
| Type | Convention | Example |
|------|-----------|---------|
| React component | PascalCase `.tsx` | `MangaCard.tsx` |
| Hook | camelCase `use` prefix `.ts` | `useReadingProgress.ts` |
| Utility function | camelCase `.ts` | `formatDate.ts` |
| Type/Interface file | PascalCase `.ts` | `AdTypes.ts` |
| Config file | camelCase `.ts` | `supabaseClient.ts` |
| Constants | UPPER_SNAKE_CASE `.ts` | `AD_ZONES.ts` |
| Test file | same as source + `.test` | `MangaCard.test.tsx` |
| Story file | same as source + `.stories` | `MangaCard.stories.tsx` |

### Variables & Functions
```typescript
// ✅ Variables — camelCase
const mangaTitle = 'Naruto'
const isLoading = true
const adZoneId = 'home_top'

// ✅ Functions — camelCase verb
function fetchMangaById(id: string) { ... }
const handleButtonClick = () => { ... }
async function updateReadingProgress(...) { ... }

// ✅ React components — PascalCase
export function MangaCard({ manga }: MangaCardProps) { ... }
export const AdZone = ({ zoneId }: AdZoneProps) => { ... }

// ✅ Interfaces — PascalCase, prefix I optional (prefer no I)
interface MangaCardProps { ... }      // preferred
interface IUserProfile { ... }       // acceptable

// ✅ Types — PascalCase
type AdZoneId = 'home_top' | 'reader_top' | 'sidebar_right'
type ApiResponse<T> = { data: T; error: string | null }

// ✅ Enums — PascalCase
enum MangaStatus { ONGOING, COMPLETED, HIATUS, DROPPED }

// ✅ Constants — UPPER_SNAKE_CASE
const MAX_UPLOAD_SIZE_MB = 2
const DEFAULT_PAGE_SIZE = 20
export const AD_ZONES = ['home_top', 'reader_top'] as const
```

### Hooks
```typescript
// ✅ Always prefix with "use", describe what it manages
useAuth()               // authentication state
useManga(slug)          // single manga data
useMangaList()          // list of manga
useReadingProgress()    // reading progress tracking
useAdZone(zoneId)       // ad campaigns for a zone
useBookmarks()          // user bookmarks
useTheme()              // theme state (light/dark)
```

---

## 3. DATABASE (SUPABASE / PRISMA)

### Tables
```sql
-- ✅ snake_case, plural
users
manga               -- exception: singular (not "mangas")
chapters
chapter_images
reading_progress
bookmarks
likes
comments
ad_providers
ad_zones
ad_campaigns
ad_analytics
user_roles
consent_records
```

### Columns
```sql
-- ✅ snake_case
id                  -- always UUID primary key
user_id             -- foreign key: <table_singular>_id
manga_id
created_at          -- timestamps always include _at
updated_at
deleted_at
is_active           -- booleans prefix with is_ or has_
has_verified_email
```

### Indexes
```sql
-- Format: idx_<table>_<column(s)>
idx_manga_slug
idx_chapters_manga_id
idx_reading_progress_user_manga
idx_ad_campaigns_zone_active
```

### Prisma Models
```typescript
// PascalCase singular — Prisma auto-maps to snake_case table
model User { ... }          // → table: users (via @@map)
model Manga { ... }         // → table: manga
model AdCampaign { ... }    // → table: ad_campaigns
```

---

## 4. API ROUTES (NEXT.JS APP ROUTER)

### URL Format
```
/api/v1/{resource}/{id}/{sub-resource}
```

```
✅ Correct:
  GET    /api/v1/manga
  GET    /api/v1/manga/:slug
  POST   /api/v1/manga
  PUT    /api/v1/manga/:slug
  DELETE /api/v1/manga/:slug
  GET    /api/v1/manga/:slug/chapters
  POST   /api/v1/manga/:slug/bookmark
  DELETE /api/v1/manga/:slug/bookmark
  GET    /api/v1/user/me
  PUT    /api/v1/user/avatar
  GET    /api/v1/admin/ads
  GET    /api/v1/health

❌ Incorrect:
  /api/getManga         (verb in URL — use HTTP method)
  /api/manga_list       (snake_case — use kebab-case)
  /api/mangaList        (camelCase — use kebab-case)
  /api/deleteUser/123   (verb in URL)
```

### File Structure (App Router)
```
app/api/v1/
├── manga/
│   ├── route.ts              → GET /manga, POST /manga
│   └── [slug]/
│       ├── route.ts          → GET, PUT, DELETE /manga/:slug
│       ├── chapters/
│       │   └── route.ts      → GET /manga/:slug/chapters
│       ├── bookmark/
│       │   └── route.ts      → POST, DELETE /manga/:slug/bookmark
│       └── like/
│           └── route.ts      → POST, DELETE /manga/:slug/like
├── user/
│   ├── me/route.ts
│   ├── avatar/route.ts
│   └── data-export/route.ts
├── admin/
│   ├── manga/route.ts
│   └── ads/route.ts
└── health/route.ts
```

---

## 5. CSS / TAILWIND

### Custom CSS Classes
```css
/* kebab-case for all custom classes */
.manga-card { ... }
.ad-zone { ... }
.chapter-reader { ... }
.bottom-sheet { ... }

/* BEM-style for complex components */
.manga-card__image { ... }
.manga-card__title { ... }
.manga-card--loading { ... }    /* modifier with double dash */
.manga-card--skeleton { ... }
```

### CSS Variables
```css
/* kebab-case, grouped by category */
--color-primary: #FF6B35;
--color-primary-hover: #E85A28;
--color-surface-primary: #FFFFFF;
--color-text-primary: #1A1A1A;
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--radius-sm: 4px;
--radius-md: 8px;
--spacing-sm: 0.5rem;
--spacing-md: 1rem;
--transition-fast: 150ms ease-in-out;
--transition-base: 250ms ease-in-out;
```

### Tailwind Class Order (enforced by prettier-plugin-tailwindcss)
```
Layout → Flexbox/Grid → Spacing → Sizing → Typography → Background → Border → Shadow → State → Animation
```

---

## 6. FILE & FOLDER NAMES

### Application Code
```
kebab-case for all files except React components
PascalCase for React component files only

src/
├── app/                        # Next.js pages (kebab-case dirs)
│   ├── manga/
│   │   └── [slug]/
│   ├── admin/
│   │   └── ads/
│   └── auth/
│       └── login/
├── components/                 # PascalCase component files
│   ├── MangaCard.tsx
│   ├── AdZone.tsx
│   └── ChapterReader.tsx
├── hooks/                      # camelCase hook files
│   ├── useAuth.ts
│   └── useManga.ts
├── lib/                        # camelCase utility files
│   ├── supabaseClient.ts
│   └── formatDate.ts
├── types/                      # PascalCase type files
│   ├── MangaTypes.ts
│   └── AdTypes.ts
└── config/                     # camelCase config files
    ├── designTokens.ts
    └── adZones.ts
```

### Documentation Files
```
UPPER_SNAKE_CASE.md for all docs/ files
docs/
├── README.md
├── INDEX.md
├── API_DOCUMENTATION.md
├── DATABASE_MIGRATIONS.md
├── NAMING_CONVENTIONS.md       ← this file
└── ...
```

---

## 7. GIT CONVENTIONS

### Branch Names
```
feat/manga-reader-gestures       # new feature
fix/ad-zone-layout-shift         # bug fix
chore/update-dependencies        # maintenance
docs/api-endpoint-specs          # documentation
refactor/auth-middleware          # refactoring
```

### Commit Messages (Conventional Commits)
```
feat: add swipe gesture support in chapter reader
fix: resolve CLS issue in AdZone component
docs: add missing GDPR endpoints to API spec
chore: upgrade Next.js to 15.2
refactor: extract ad filtering logic into hook
test: add integration tests for bookmark API
```

---

## CONFLICT RESOLUTION

When another document contradicts this file:
1. This file (`NAMING_CONVENTIONS.md`) wins
2. Update the other file to match
3. Note the correction in `COMPREHENSIVE_AUDIT_REPORT.md`

---

**Related Files:** DESIGN_SYSTEM.md (tokens), FIGMA_COMPONENT_LIBRARY_GUIDE.md (components), DATABASE_MIGRATIONS.md (schema)
