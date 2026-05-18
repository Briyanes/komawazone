# DATABASE_MIGRATIONS.md
## Tier-1 Developer Specification: Database Setup & Migration Strategy

**Document ID:** TIER1-DEV-003  
**Created:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ COMPLETE  
**Priority:** CRITICAL (Phase 1 - Foundation)

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Technology Stack](#technology-stack)
3. [Prisma Setup](#prisma-setup)
4. [Data Models](#data-models)
5. [Migration Workflow](#migration-workflow)
6. [Seed Data Strategy](#seed-data-strategy)
7. [Rollback Procedures](#rollback-procedures)
8. [Backup & Disaster Recovery](#backup--disaster-recovery)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting](#troubleshooting)

---

## 1. EXECUTIVE SUMMARY

### Database Choices
- **Primary Database:** PostgreSQL 15+
  - Reliability: 99.95% uptime
  - Scalability: 1M+ queries/day
  - ACID compliance for data integrity
  - JSON support for flexible data

- **ORM:** Prisma
  - Type-safe database access
  - Auto-generated migrations
  - Developer-friendly query builder
  - Built-in connection pooling

### Key Strategies
- **Migrations:** Git-tracked, version-controlled
- **Seeding:** Separate seed scripts per environment
- **Backups:** Automated daily, tested weekly
- **Rollback:** Point-in-time recovery with migration reversions

### Timeline
- Development: Local PostgreSQL (Docker)
- Testing: Isolated test database per PR
- Staging: Production-like replica
- Production: Supabase managed PostgreSQL

---

## 2. TECHNOLOGY STACK

### Database Setup

**Development**
```bash
# Docker container for local development
docker run --name manga-zone-db \
  -e POSTGRES_PASSWORD=dev_password \
  -e POSTGRES_DB=manga_zone_dev \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15
```

**Installation**
```bash
# Install Prisma CLI and dependencies
npm install @prisma/client prisma
npm install -D @types/node

# Install database drivers (if using raw SQL)
npm install pg
```

### Environment Configuration

**File: `.env.local` (Development)**
```
DATABASE_URL="postgresql://postgres:dev_password@localhost:5432/manga_zone_dev?schema=public"

# Connection pooling
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20

# Logging
DATABASE_LOG=true
DATABASE_LOG_LEVEL=info
```

**File: `.env.test` (Testing)**
```
DATABASE_URL="postgresql://postgres:test_password@localhost:5432/manga_zone_test?schema=test"
```

**File: `.env.production` (Production - Supabase)**
```
DATABASE_URL="postgresql://postgres:SECURE_PASSWORD@db.REGION.supabase.co:5432/postgres"

# Use connection pooler in transaction mode
DATABASE_POOL_MODE="transaction"
DATABASE_POOL_SIZE=25
```

---

## 3. PRISMA SETUP

### Initial Setup

**Step 1: Initialize Prisma**
```bash
npx prisma init
```

**Step 2: Create schema.prisma**

**File: `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============ USERS ============

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  username      String    @unique
  passwordHash  String
  avatar        String?
  bio           String?
  role          UserRole  @default(USER)
  
  // Relations
  bookmarks     Bookmark[]
  likes         Like[]
  readingHistory ReadingHistory[]
  settings      UserSettings?
  sessions      Session[]
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([email])
  @@index([username])
  @@map("users")
}

enum UserRole {
  USER
  ADMIN
  MODERATOR
}

model UserSettings {
  id            String    @id @default(cuid())
  userId        String    @unique
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  theme         Theme     @default(SYSTEM)
  language      String    @default("en")
  nsfw          Boolean   @default(false)
  notifications Boolean   @default(true)
  emailNotifications Boolean @default(false)

  @@map("user_settings")
}

enum Theme {
  LIGHT
  DARK
  SYSTEM
}

model Session {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  token         String    @unique
  refreshToken  String    @unique
  
  userAgent     String?
  ipAddress     String?
  
  expiresAt     DateTime
  createdAt     DateTime  @default(now())

  @@index([userId])
  @@index([token])
  @@map("sessions")
}

// ============ MANGA ============

model Manga {
  id            String    @id @default(cuid())
  title         String    @unique
  slug          String    @unique
  description   String    @db.Text
  
  coverUrl      String
  bannerUrl     String?
  
  status        MangaStatus @default(ONGOING)
  rating        Float     @default(0)
  ratingCount   Int       @default(0)
  views         Int       @default(0)
  
  // Relations
  chapters      Chapter[]
  bookmarks     Bookmark[]
  likes         Like[]
  readingProgress ReadingProgress[]
  genres        Genre[]          @relation("MangaGenre")
  authors       Author[]         @relation("MangaAuthor")
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([slug])
  @@index([status])
  @@index([createdAt])
  // NOTE: Full-text search is done via raw SQL GIN index (see migration below)
  // @@fulltext is NOT valid Prisma — use raw SQL instead
  @@map("manga")
}

enum MangaStatus {
  ONGOING
  COMPLETED
  HIATUS
  DROPPED
}

model Chapter {
  id            String    @id @default(cuid())
  mangaId       String
  manga         Manga     @relation(fields: [mangaId], references: [id], onDelete: Cascade)
  
  number        Int
  title         String
  description   String?   @db.Text
  releaseDate   DateTime
  
  views         Int       @default(0)
  rating        Float     @default(0)
  ratingCount   Int       @default(0)
  
  // Relations
  chapterImages ChapterImage[]
  bookmarks     Bookmark[]
  readingHistory ReadingHistory[]
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@unique([mangaId, number])
  @@index([mangaId])
  @@index([releaseDate])
  @@map("chapters")
}

// Renamed to ChapterImage in code, SQL table = chapter_images
model ChapterImage {
  id            String    @id @default(cuid())
  chapterId     String
  chapter       Chapter   @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  
  number        Int
  imageUrl      String
  
  width         Int       @default(1080)
  height        Int       @default(1440)
  
  createdAt     DateTime  @default(now())

  @@unique([chapterId, number])
  @@index([chapterId])
  @@map("chapter_images")
}

// ============ USER INTERACTIONS ============

model Bookmark {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  mangaId       String
  manga         Manga     @relation(fields: [mangaId], references: [id], onDelete: Cascade)
  
  chapterId     String
  chapter       Chapter   @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  
  createdAt     DateTime  @default(now())

  @@unique([userId, chapterId])
  @@index([userId])
  @@index([mangaId])
  @@map("bookmarks")
}

model Like {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  mangaId       String
  manga         Manga     @relation(fields: [mangaId], references: [id], onDelete: Cascade)
  
  createdAt     DateTime  @default(now())

  @@unique([userId, mangaId])
  @@index([userId])
  @@index([mangaId])
  @@map("likes")
}

model ReadingProgress {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  mangaId       String
  manga         Manga     @relation(fields: [mangaId], references: [id], onDelete: Cascade)
  
  chapterId     String
  chapter       Chapter   @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  
  pageNumber    Int       @default(0)
  readPercentage Int      @default(0)
  
  lastReadAt    DateTime  @updatedAt
  createdAt     DateTime  @default(now())

  @@unique([userId, chapterId])
  @@index([userId])
  @@index([mangaId])
  @@map("reading_progress")
}

// ============ CONTENT METADATA ============

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

// ============ AD SYSTEM (4-table schema — matches AD_MANAGEMENT.md) ============

model AdProvider {
  id          String    @id @default(cuid())
  name        String    // e.g. "Adsterra", "Custom"
  type        AdProviderType
  isActive    Boolean   @default(true)
  
  // Global pixel/script injected site-wide
  pixelCode   String?   @db.Text
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  zones       AdZone[]
  
  @@map("ad_providers")
}

model AdZone {
  id          String    @id @default(cuid())
  name        String    // e.g. "home_top", "reader_top"
  placement   AdPlacement
  description String?
  isActive    Boolean   @default(true)
  
  providerId  String
  provider    AdProvider @relation(fields: [providerId], references: [id])
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  campaigns   AdCampaign[]
  
  @@index([placement])
  @@index([isActive])
  @@map("ad_zones")
}

model AdCampaign {
  id          String    @id @default(cuid())
  name        String
  zoneId      String
  zone        AdZone    @relation(fields: [zoneId], references: [id])
  
  type        AdType
  htmlContent String?   @db.Text
  imageUrl    String?
  linkUrl     String?
  
  isActive    Boolean   @default(true)
  priority    Int       @default(0)
  
  startDate   DateTime?
  endDate     DateTime?
  
  // Targeting
  targetMobile  Boolean @default(true)
  targetDesktop Boolean @default(true)
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  analytics   AdAnalytics[]
  
  @@index([zoneId, isActive])
  @@index([priority])
  @@map("ad_campaigns")
}

model AdAnalytics {
  id          String    @id @default(cuid())
  campaignId  String
  campaign    AdCampaign @relation(fields: [campaignId], references: [id])
  
  event       AdEvent   // IMPRESSION, CLICK
  userId      String?
  ipHash      String?   // anonymized
  userAgent   String?
  
  createdAt   DateTime  @default(now())
  
  @@index([campaignId, event])
  @@index([createdAt])
  @@map("ad_analytics")
}

enum AdProviderType {
  ADSTERRA
  CUSTOM_HTML
  PIXEL_ONLY
  GOOGLE_ADSENSE
}

enum AdType {
  BANNER
  PIXEL
  CUSTOM_HTML
  NATIVE
}

enum AdPlacement {
  HOME_TOP
  HOME_BOTTOM
  READER_TOP
  READER_BOTTOM
  SIDEBAR
  SEARCH_RESULTS
  CHAPTER_BETWEEN_PAGES
}

enum AdEvent {
  IMPRESSION
  CLICK
}

model AuditLog {
  id            String    @id @default(cuid())
  userId        String?
  
  action        String
  resource      String
  resourceId    String
  changes       Json?
  
  ipAddress     String?
  userAgent     String?
  
  createdAt     DateTime  @default(now())

  @@index([userId])
  @@index([resource])
  @@index([createdAt])
  @@map("audit_logs")
}
```

### Step 3: Generate Prisma Client

```bash
npx prisma generate
```

This creates `node_modules/.prisma/client` with type-safe database access.

---

## 4. DATA MODELS

### Entity Relationship Diagram

```
┌──────────────┐
│    User      │
├──────────────┤
│ id (PK)      │
│ email        │
│ username     │
│ role         │
└──────────────┘
    │
    ├─→ Bookmark → Chapter → Manga
    ├─→ Like → Manga
    ├─→ ReadingHistory → Chapter → Manga
    └─→ UserSettings

┌──────────────┐
│    Manga     │
├──────────────┤
│ id (PK)      │
│ title        │
│ slug         │
│ status       │
│ rating       │
└──────────────┘
    │
    ├─→ Chapter → Page
    ├─→ Genre (M2M)
    ├─→ Author (M2M)
    └─→ Bookmark, Like, ReadingHistory (reverse)
```

### Key Relationships

**User → Bookmark → Chapter → Manga**
- User bookmarks a chapter (where they stopped reading)
- Enables "Continue Reading" feature

**User → Like → Manga**
- User likes manga
- Used for recommendations and statistics

**User → ReadingHistory → Chapter**
- Tracks reading progress (page number, percentage)
- Used for "Recently Read" and recommendations

---

## 5. MIGRATION WORKFLOW

### Creating Migrations

**Step 1: Modify schema.prisma**
```prisma
// Example: Add new field
model Manga {
  // ... existing fields
  sourceUrl    String?  // NEW FIELD
}
```

**Step 2: Create Migration**
```bash
npx prisma migrate dev --name add_source_url_to_manga
```

**Output:**
```
✔ Created migration for this model change in 45ms

Applying migration `20260515_add_source_url_to_manga`

The following migration(s) have been created and applied:

migrations/
  └─ 20260515053006_add_source_url_to_manga/
    └─ migration.sql
```

**Step 3: Generated SQL (auto-created)**
```sql
-- migrations/20260515053006_add_source_url_to_manga/migration.sql

-- AlterTable
ALTER TABLE "manga" ADD COLUMN "sourceUrl" TEXT;
```

**Step 4: Commit to Git**
```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add sourceUrl to manga model"
```

### Migration File Structure
```
prisma/
├── schema.prisma           ← Data model definition
└── migrations/
    ├── migration_lock.toml ← Ensures migration order
    ├── 20260515053006_init/
    │   ├── migration.sql   ← Auto-generated SQL
    │   └── metadata.json   ← Migration metadata
    ├── 20260515053100_add_source_url_to_manga/
    │   └── migration.sql
    └── 20260515053200_create_audit_logs/
        └── migration.sql
```

### Applying Migrations

**Local Development**
```bash
# Apply pending migrations
npx prisma migrate deploy

# Or use dev mode (auto-apply + generate types)
npx prisma migrate dev
```

**Staging/Production**
```bash
# Safe deployment (apply migrations, no reset)
npx prisma migrate deploy

# Check migration status
npx prisma migrate status
```

### Migration Naming Convention

Use descriptive names:
- ✅ `add_source_url_to_manga`
- ✅ `create_audit_logs_table`
- ✅ `add_index_on_user_email`
- ❌ `update` (too vague)
- ❌ `fix` (not descriptive)

---

## 6. SEED DATA STRATEGY

### Seed File Structure

**File: `prisma/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (only in dev)
  if (process.env.NODE_ENV === 'development') {
    await prisma.readingHistory.deleteMany({});
    await prisma.bookmark.deleteMany({});
    await prisma.like.deleteMany({});
    await prisma.page.deleteMany({});
    await prisma.chapter.deleteMany({});
    await prisma.manga.deleteMany({});
    await prisma.author.deleteMany({});
    await prisma.genre.deleteMany({});
    await prisma.user.deleteMany({});
  }

  // ====== USERS ======
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@mangazone.id',
      username: 'admin',
      passwordHash: await hashPassword('Admin123!'),
      role: 'ADMIN',
      settings: {
        create: {
          theme: 'DARK',
          language: 'en',
        },
      },
    },
  });

  const testUser = await prisma.user.create({
    data: {
      email: 'user@example.com',
      username: 'testuser',
      passwordHash: await hashPassword('User123!'),
      role: 'USER',
      bio: 'Manga enthusiast',
      settings: {
        create: {
          theme: 'SYSTEM',
        },
      },
    },
  });

  console.log(`✓ Created ${2} users`);

  // ====== GENRES ======
  const genres = await Promise.all([
    prisma.genre.create({
      data: { name: 'Action', slug: 'action', description: 'High-energy stories' },
    }),
    prisma.genre.create({
      data: { name: 'Romance', slug: 'romance', description: 'Love stories' },
    }),
    prisma.genre.create({
      data: { name: 'Adventure', slug: 'adventure', description: 'Exploration' },
    }),
    prisma.genre.create({
      data: { name: 'Fantasy', slug: 'fantasy', description: 'Magical worlds' },
    }),
  ]);

  console.log(`✓ Created ${genres.length} genres`);

  // ====== AUTHORS ======
  const authors = await Promise.all([
    prisma.author.create({
      data: { name: 'Hajime Isayama', slug: 'hajime-isayama' },
    }),
    prisma.author.create({
      data: { name: 'Eiichiro Oda', slug: 'eiichiro-oda' },
    }),
    prisma.author.create({
      data: { name: 'Akira Toriyama', slug: 'akira-toriyama' },
    }),
  ]);

  console.log(`✓ Created ${authors.length} authors`);

  // ====== MANGA ======
  const manga1 = await prisma.manga.create({
    data: {
      title: 'Attack on Titan',
      slug: 'attack-on-titan',
      description: 'A thrilling tale of human survival against giant humanoid creatures.',
      coverUrl: 'https://example.com/aot-cover.jpg',
      status: 'COMPLETED',
      rating: 9.2,
      ratingCount: 50000,
      views: 5000000,
      genres: {
        connect: [
          { id: genres[0].id }, // Action
          { id: genres[2].id }, // Adventure
        ],
      },
      authors: {
        connect: [{ id: authors[0].id }],
      },
    },
  });

  const manga2 = await prisma.manga.create({
    data: {
      title: 'One Piece',
      slug: 'one-piece',
      description: 'The greatest adventure on the seas.',
      coverUrl: 'https://example.com/op-cover.jpg',
      status: 'ONGOING',
      rating: 9.0,
      ratingCount: 100000,
      views: 10000000,
      genres: {
        connect: [
          { id: genres[0].id }, // Action
          { id: genres[2].id }, // Adventure
        ],
      },
      authors: {
        connect: [{ id: authors[1].id }],
      },
    },
  });

  console.log(`✓ Created ${2} manga titles`);

  // ====== CHAPTERS ======
  const chapter1 = await prisma.chapter.create({
    data: {
      mangaId: manga1.id,
      number: 1,
      title: 'The Fall of Shiganshina',
      description: 'The beginning of everything.',
      releaseDate: new Date('2026-01-01'),
      views: 100000,
      rating: 9.5,
      pages: {
        create: Array.from({ length: 40 }, (_, i) => ({
          number: i + 1,
          imageUrl: `https://example.com/aot/ch1/page-${i + 1}.webp`,
        })),
      },
    },
  });

  const chapter2 = await prisma.chapter.create({
    data: {
      mangaId: manga1.id,
      number: 2,
      title: 'The End of the World',
      releaseDate: new Date('2026-01-08'),
      views: 95000,
      pages: {
        create: Array.from({ length: 38 }, (_, i) => ({
          number: i + 1,
          imageUrl: `https://example.com/aot/ch2/page-${i + 1}.webp`,
        })),
      },
    },
  });

  console.log(`✓ Created ${2} chapters with pages`);

  // ====== USER INTERACTIONS ======
  await prisma.bookmark.create({
    data: {
      userId: testUser.id,
      mangaId: manga1.id,
      chapterId: chapter1.id,
    },
  });

  await prisma.like.create({
    data: {
      userId: testUser.id,
      mangaId: manga1.id,
    },
  });

  await prisma.readingHistory.create({
    data: {
      userId: testUser.id,
      mangaId: manga1.id,
      chapterId: chapter1.id,
      pageNumber: 15,
      readPercentage: 38,
    },
  });

  console.log('✓ Created user interactions');

  // ====== ADS ======
  await prisma.ad.create({
    data: {
      name: 'Home Banner Ad',
      type: 'BANNER',
      placement: 'HOME_TOP',
      htmlContent: '<div>Advertisement</div>',
      isActive: true,
      priority: 1,
    },
  });

  console.log('✓ Created ad configurations');

  console.log('✅ Database seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Configure Seed Script

**File: `package.json`**

```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  },
  "scripts": {
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset --force",
    "db:studio": "prisma studio"
  }
}
```

### Running Seeds

```bash
# Run seed script after migrations
npm run db:seed

# Reset database (delete all data, run migrations, seed)
npm run db:reset

# Interactive browser UI for database
npm run db:studio
```

---

## 7. ROLLBACK PROCEDURES

### Scenario 1: Rollback Recent Migration

**Problem:** Just deployed a migration that broke production

**Solution:**

```bash
# 1. Identify current migration
npx prisma migrate status

# Output:
# Following migrations have not yet been applied:
# migrations/
#   └─ 20260515053200_bad_migration

# 2. Revert by re-applying previous schema
npx prisma migrate resolve --rolled-back 20260515053200_bad_migration

# 3. OR manually run SQL to revert (if needed)
# postgresql@> SELECT * FROM "public"."_prisma_migrations" 
#              ORDER BY "finished_at" DESC LIMIT 5;

# 4. Test locally first
npm run db:reset

# 5. Once verified, deploy to production
npm run db:migrate:prod
```

### Scenario 2: Data Loss During Migration

**Problem:** Migration deleted data unexpectedly

**Solution:**

```sql
-- 1. Check migration logs
SELECT * FROM public._prisma_migrations 
ORDER BY finished_at DESC LIMIT 1;

-- 2. Restore from backup (see Backup & Disaster Recovery)
-- Connection goes to standby replica:
psql postgresql://user@replica-db.supabase.co/postgres

-- 3. Or rollback to point-in-time (Supabase)
-- https://supabase.com/docs/guides/platform/backups
```

### Scenario 3: Schema Out of Sync

**Problem:** Migration files don't match current schema

**Solution:**

```bash
# 1. Check for conflicts
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-url DATABASE_URL

# 2. Create corrective migration
npx prisma migrate dev --name fix_schema_sync

# 3. Review generated SQL before applying
cat prisma/migrations/[NEW_MIGRATION]/migration.sql

# 4. Apply and test
npm run db:reset
npm run test:integration
```

---

## 8. BACKUP & DISASTER RECOVERY

### Automated Backups (Supabase)

Supabase automatically backs up daily. View in dashboard:
```
https://app.supabase.com/project/[PROJECT_ID]/settings/backups
```

### Manual Backup

```bash
# Full database backup to local file
pg_dump postgresql://user:pass@db.supabase.co:5432/postgres \
  --compress \
  --format=custom \
  -f manga_zone_backup_$(date +%Y%m%d_%H%M%S).dump

# Backup only schema (no data)
pg_dump postgresql://user:pass@db.supabase.co:5432/postgres \
  --schema-only \
  -f schema_backup.sql

# Backup specific tables
pg_dump postgresql://user:pass@db.supabase.co:5432/postgres \
  -t users -t manga -t chapters \
  -f tables_backup.sql
```

### Restore from Backup

```bash
# Full restore (dangerous - use only in disaster)
pg_restore \
  --verbose \
  --clean \
  --no-acl \
  --no-owner \
  -d postgresql://user:pass@db.supabase.co:5432/postgres \
  manga_zone_backup_20260515_120000.dump

# Selective restore (safer)
psql postgresql://user:pass@db.supabase.co:5432/postgres < schema_backup.sql
```

### Point-in-Time Recovery (Supabase)

```bash
# 1. Request point-in-time recovery in Supabase dashboard
# Settings → Backups → Restore to date
# 2. Provides new connection string
# 3. Test connection and verify data
# 4. Update DATABASE_URL after verification
```

### Disaster Recovery Plan

```
If entire database is lost:

1. IMMEDIATE (Supabase auto-backup)
   - Supabase restores latest backup (within 24h)
   - Estimated time: 15-30 minutes

2. BACKUP STRATEGY
   - Daily automated backups (Supabase)
   - Weekly manual backups to S3
   - Point-in-time recovery window: 7 days

3. RTO/RPO TARGETS
   - Recovery Time Objective (RTO): 1 hour
   - Recovery Point Objective (RPO): 24 hours
```

### Database Health Checks

```bash
# Run weekly health checks
npm run db:health

# Sample health check script (db/health.ts)
const health = {
  users: await prisma.user.count(),
  manga: await prisma.manga.count(),
  chapters: await prisma.chapter.count(),
  pages: await prisma.page.count(),
};

console.log('✅ Database health:', health);
```

---

## 9. PERFORMANCE OPTIMIZATION

### Indexing Strategy

Already defined in schema:

```prisma
// User table
@@index([email])        // Frequently queried
@@index([username])     // Frequently searched

// Manga table
@@index([slug])         // URL lookups
@@index([status])       // Filter by status
@@index([createdAt])    // Sort by date
// NOTE: Full-text search uses raw SQL GIN index (not Prisma @@fulltext)
// Migration SQL: CREATE INDEX idx_manga_search ON manga USING GIN(to_tsvector('english', title || ' ' || description));

// Chapter table
@@unique([mangaId, number])  // Prevent duplicates
@@index([releaseDate])   // Sort by release

// User interactions
@@unique([userId, mangaId])     // Prevent duplicate likes
@@unique([userId, chapterId])   // Prevent duplicate bookmarks
```

### Query Optimization

**Before (N+1 problem):**
```typescript
// ❌ Runs 101 queries (1 manga + 100 chapters)
const manga = await prisma.manga.findUnique({
  where: { id: 'manga-1' },
});
const chapters = await prisma.chapter.findMany({
  where: { mangaId: manga.id },
});
```

**After (Optimized):**
```typescript
// ✅ Runs 1 query with relation loaded
const manga = await prisma.manga.findUnique({
  where: { id: 'manga-1' },
  include: {
    chapters: {
      orderBy: { number: 'asc' },
      take: 20, // Pagination
    },
  },
});
```

### Connection Pooling

**Development:**
```
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20
```

**Production (Supabase):**
```
# Use connection pooler in transaction mode
DATABASE_POOL_MODE=transaction
DATABASE_POOL_SIZE=25

# Direct connection for long-running queries
DATABASE_URL_DIRECT=postgresql://...
```

### Query Caching

```typescript
// Cache frequently queried data (30 seconds)
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 30 });

async function getMangaWithCache(id: string) {
  const cached = cache.get(`manga:${id}`);
  if (cached) return cached;
  
  const manga = await prisma.manga.findUnique({
    where: { id },
    include: { chapters: true },
  });
  
  cache.set(`manga:${id}`, manga);
  return manga;
}
```

---

## 10. TROUBLESHOOTING

### Issue: "Column does not exist"

**Cause:** Migration not applied locally

**Solution:**
```bash
npx prisma migrate deploy
npm run db:reset
```

### Issue: "Unique constraint violation"

**Cause:** Duplicate data in unique field

**Solution:**
```typescript
// Find duplicates
const duplicates = await prisma.user.findMany({
  where: { email: 'test@example.com' },
});

// Delete or update
await prisma.user.deleteMany({
  where: { id: { in: duplicates.slice(1).map(u => u.id) } },
});
```

### Issue: "Connection timeout"

**Cause:** Pool exhausted or database unreachable

**Solution:**
```bash
# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Increase pool size
DATABASE_POOL_MAX=50
```

### Issue: "Migration locked"

**Cause:** Another migration in progress

**Solution:**
```bash
# Check lock status
npx prisma migrate status

# Resolve stale lock (if safe)
npx prisma migrate resolve --rolled-back [MIGRATION_NAME]
```

---

## IMPLEMENTATION CHECKLIST

### Initial Setup
- [ ] Install Prisma and dependencies
- [ ] Configure PostgreSQL locally (Docker)
- [ ] Create .env files for all environments
- [ ] Run `npx prisma init`

### Schema Development
- [ ] Create prisma/schema.prisma with all models
- [ ] Add indexes and unique constraints
- [ ] Generate Prisma Client
- [ ] Test schema locally

### Migrations
- [ ] Create initial migration: `prisma migrate dev --name init`
- [ ] Test rollback procedures
- [ ] Document migration naming convention
- [ ] Set up CI/CD to apply migrations

### Seeding
- [ ] Create prisma/seed.ts with sample data
- [ ] Test seeding locally: `npm run db:seed`
- [ ] Create separate seed files for different environments
- [ ] Document seed data strategy

### Testing
- [ ] Set up test database with separate schema
- [ ] Create test fixtures
- [ ] Add database reset between tests
- [ ] Test migrations in CI/CD

### Backups
- [ ] Enable Supabase automated backups
- [ ] Configure weekly manual backups to S3
- [ ] Test restore procedure monthly
- [ ] Document RTO/RPO targets

### Performance
- [ ] Verify all indexes are in place
- [ ] Set up query logging in dev
- [ ] Configure connection pooling
- [ ] Load test with 1000+ concurrent users

---

## SUMMARY

This database strategy provides:

✅ **Type Safety:** Prisma generates TypeScript types  
✅ **Version Control:** Migrations tracked in Git  
✅ **Rollback Safety:** Can revert any migration  
✅ **Reproducibility:** Seed scripts for consistent data  
✅ **Disaster Recovery:** Automated backups + point-in-time restore  
✅ **Performance:** Optimized indexes and query patterns  

**Implementation Time**: 2-3 weeks to setup + optimize  
**Maintenance**: <1 hour per week ongoing

---

**Next File:** ERROR_HANDLING.md (Developer File #4)
