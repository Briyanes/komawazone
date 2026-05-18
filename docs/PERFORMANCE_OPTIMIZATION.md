# PERFORMANCE_OPTIMIZATION.md
## Tier-2 Developer Specification: Performance & Scalability Strategy

**Document ID:** TIER2-DEV-001  
**Created:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ COMPLETE  
**Priority:** HIGH (Phase 2 - Optimization)

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Performance Targets](#performance-targets)
3. [Image Optimization Strategy](#image-optimization-strategy)
4. [Caching Architecture](#caching-architecture)
5. [Database Query Optimization](#database-query-optimization)
6. [Frontend Performance](#frontend-performance)
7. [CDN & Delivery](#cdn--delivery)
8. [Load Testing & Scaling](#load-testing--scaling)
9. [Monitoring & Metrics](#monitoring--metrics)
10. [Performance Budget](#performance-budget)

---

## 1. EXECUTIVE SUMMARY

### Performance Goals (Core Web Vitals)
```
LCP (Largest Contentful Paint): < 2.5s
CLS (Cumulative Layout Shift): < 0.1
INP (Interaction to Next Paint): < 200ms
TTFB (Time to First Byte): < 600ms
FCP (First Contentful Paint): < 1.8s
```

### Target Metrics
- **First Load:** <3s on 4G
- **Subsequent Loads:** <1s (with cache)
- **Search Results:** <500ms p99
- **Reader Load:** <2s first page, <800ms subsequent pages
- **API Response:** <200ms p95

### Optimization Strategy Layers
```
Level 1: Image & Asset Optimization (40% improvement)
Level 2: Caching & CDN (30% improvement)
Level 3: Database Queries (15% improvement)
Level 4: Frontend Code Splitting (10% improvement)
Level 5: Advanced Techniques (5% improvement)
```

---

## 2. PERFORMANCE TARGETS

### By Page/Feature

| Page | FCP | LCP | CLS | INP | Target |
|------|-----|-----|-----|-----|--------|
| Home | 1.2s | 2.2s | 0.05 | 150ms | 3s budget |
| Manga Detail | 1.5s | 2.4s | 0.08 | 180ms | 3.5s budget |
| Reader Page | 0.8s | 1.8s | 0.03 | 120ms | 2.5s budget |
| Search Results | 1.0s | 2.0s | 0.07 | 160ms | 3s budget |
| Admin Dashboard | 1.3s | 2.3s | 0.10 | 200ms | 3.5s budget |

### Performance Budget

```
JavaScript:     < 150KB (gzipped)
CSS:            < 40KB (gzipped)
Images:         < 500KB per page (lazy-loaded)
Fonts:          < 100KB (subset + system fonts)
Total Budget:   < 1.2MB per page

Breakdown by Network:
- 4G (1.6 Mbps):   ~3s page load
- 3G (400 Kbps):   ~9s page load
- Slow 4G (100ms delay): +100ms baseline
```

---

## 3. IMAGE OPTIMIZATION STRATEGY

### Image Format Strategy

**Primary Format: WebP**
```
Advantages:
- 25-35% smaller than JPG/PNG
- Lossless & lossy compression
- Browser support: 95%+ (with fallback)
```

**Fallback: JPEG**
```
For older browsers
- Quality: 85 (balances size/quality)
- Progressive encoding enabled
```

**PNG Only For:**
- Graphics with transparency
- Icons (use SVG instead)
- Small UI elements

### Responsive Images

**Manga Cover Images:**
```html
<!-- Mobile: 300px wide (max) -->
<!-- Tablet: 400px wide (max) -->
<!-- Desktop: 600px wide (max) -->

<picture>
  <!-- WebP formats -->
  <source
    media="(max-width: 640px)"
    srcset="
      /images/manga/cover-300.webp 300w,
      /images/manga/cover-300@2x.webp 600w
    "
    type="image/webp"
  />
  
  <source
    media="(min-width: 641px) and (max-width: 1024px)"
    srcset="
      /images/manga/cover-400.webp 400w,
      /images/manga/cover-400@2x.webp 800w
    "
    type="image/webp"
  />
  
  <source
    media="(min-width: 1025px)"
    srcset="
      /images/manga/cover-600.webp 600w,
      /images/manga/cover-600@2x.webp 1200w
    "
    type="image/webp"
  />
  
  <!-- JPEG fallback -->
  <img
    src="/images/manga/cover-600.jpg"
    srcset="
      /images/manga/cover-600.jpg 600w,
      /images/manga/cover-600@2x.jpg 1200w
    "
    alt="Manga Cover"
    loading="lazy"
    width="600"
    height="900"
  />
</picture>
```

### Reader Page Images (Critical for Performance)

**Manga Pages:**
```
Mobile (540px width):    360KB total (100 pages × 3.6KB avg)
Tablet (900px width):    1.2MB total (100 pages × 12KB avg)
Desktop (1080px width):  1.5MB total (100 pages × 15KB avg)

Per-Page Optimization:
- JPEG quality: 80-85 (good visual quality)
- Progressive encoding: YES
- Strip metadata: YES
- Max dimension: 1080px width
- Target: < 150KB per page
```

**Image Compression Pipeline:**
```
1. Upload → 2. Detect format → 3. Resize to max-width
    ↓               ↓                    ↓
    ↓               ↓           4. Generate 3 sizes
    ↓               ↓              (mobile, tablet, desktop)
    ↓               ↓                    ↓
    ↓               ↓           5. Convert to WebP
    ↓               ↓                    ↓
    ↓               ↓           6. Optimize (mozjpeg/pngquant)
    ↓               ↓                    ↓
    ↓               ↓           7. Upload to CDN
    ↓               ↓                    ↓
    ↓               ↓           8. Return URLs
    └─→ Database stores URLs ←─────────┘
```

### Image Processing Library (Sharp)

**File: `src/lib/imageProcessing.ts`**

```typescript
import sharp from 'sharp';
import { cloudinary } from '@/lib/cloudinary';

export async function optimizeImage(
  inputPath: string,
  imageType: 'cover' | 'page' | 'avatar'
) {
  const sizes = {
    cover: [300, 400, 600],
    page: [540, 900, 1080],
    avatar: [48, 64, 128],
  };

  const targetSizes = sizes[imageType];
  const urls: Record<number, string> = {};

  for (const size of targetSizes) {
    // Resize to target width
    const resized = await sharp(inputPath)
      .rotate() // Auto-rotate based on EXIF
      .resize(size, size * 1.5, { fit: 'cover', withoutEnlargement: true })
      .toBuffer();

    // Convert to WebP
    const webp = await sharp(resized).webp({ quality: 80 }).toBuffer();

    // Upload to CDN
    const url = await cloudinary.upload(webp, {
      folder: `manga-zone/${imageType}`,
      public_id: `${imageType}-${size}`,
      resource_type: 'image',
    });

    urls[size] = url;
  }

  return urls;
}
```

---

## 4. CACHING ARCHITECTURE

### Multi-Layer Caching

```
┌─────────────────────────────────┐
│ Browser Cache (1st hit)         │ ← Service Worker
│ (Long-lived: 30 days for images)│
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│ CDN Cache (2nd hit)             │ ← Cloudflare/Vercel
│ (Medium-lived: 1 hour for HTML) │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│ Server Cache (3rd hit)          │ ← Redis
│ (Short-lived: 5-30 mins)        │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│ Database (Cache miss)           │ ← Supabase PostgreSQL
│ (Always fresh but slowest)      │
└─────────────────────────────────┘
```

### HTTP Caching Headers

**Static Assets (Images, CSS, JS)**
```
Cache-Control: public, max-age=31536000, immutable
# 1 year cache (immutable because filename includes hash)
```

**HTML Pages**
```
Cache-Control: public, max-age=3600, s-maxage=3600
# 1 hour browser cache + 1 hour CDN cache
# s-maxage for shared cache (CDN)
```

**API Responses**
```
Cache-Control: private, max-age=300, stale-while-revalidate=86400
# 5 min cache + serve stale for 24h if origin unreachable
```

**Never Cache:**
```
Cache-Control: no-store, no-cache, must-revalidate
# Authentication tokens, user preferences, dynamic content
```

### Redis Caching Strategy

**File: `src/lib/cache.ts`**

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // For cache invalidation
}

export const cache = {
  // Get cached value
  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  },

  // Set cached value
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const ttl = options.ttl ?? 300; // Default 5 mins
    await redis.setex(
      key,
      ttl,
      JSON.stringify(value)
    );

    // Tag for invalidation
    if (options.tags?.length) {
      for (const tag of options.tags) {
        await redis.sadd(`tag:${tag}`, key);
      }
    }
  },

  // Delete cached value
  async delete(key: string): Promise<void> {
    await redis.del(key);
  },

  // Invalidate by tag (e.g., invalidate all manga:* when manga updates)
  async invalidateTag(tag: string): Promise<void> {
    const keys = await redis.smembers(`tag:${tag}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.del(`tag:${tag}`);
  },

  // Get or fetch pattern
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try cache first
    const cached = await cache.get<T>(key);
    if (cached) return cached;

    // Cache miss: fetch fresh data
    const data = await fetcher();
    await cache.set(key, data, options);
    return data;
  },
};

// Usage examples
export async function getMangaWithCache(mangaId: string) {
  return cache.getOrFetch(
    `manga:${mangaId}`,
    () => prisma.manga.findUnique({ where: { id: mangaId } }),
    {
      ttl: 3600, // 1 hour
      tags: ['manga', `manga:${mangaId}`],
    }
  );
}

export async function invalidateMangaCache(mangaId: string) {
  await cache.invalidateTag(`manga:${mangaId}`);
}
```

### Service Worker Caching

**File: `public/sw.js`**

```javascript
const CACHE_VERSION = 'v1';
const CACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/fonts/playfair.woff2',
  '/fonts/inter.woff2',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_ASSETS).then((cache) => {
      return cache.addAll(CACHE_ASSETS);
    })
  );
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests: network-first with fallback
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached response if network fails
          return caches.match(request);
        })
    );
  }

  // Static assets: cache-first
  else {
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request);
      })
    );
  }
});
```

---

## 5. DATABASE QUERY OPTIMIZATION

### Query Optimization Patterns

**❌ N+1 Problem**
```typescript
// Runs 101 queries (1 manga + 100 chapters)
const manga = await prisma.manga.findUnique({ where: { id } });
const chapters = await prisma.chapter.findMany({
  where: { mangaId: manga.id },
});
```

**✅ Eager Loading (Single Query)**
```typescript
// Runs 1 query with all relations loaded
const manga = await prisma.manga.findUnique({
  where: { id },
  include: {
    chapters: { take: 20, orderBy: { number: 'asc' } },
    genres: true,
    authors: true,
  },
});
```

**Index Strategy**
```sql
-- Create indexes for frequently queried fields
CREATE INDEX idx_manga_status ON manga(status);
CREATE INDEX idx_manga_created_at ON manga(created_at DESC);
CREATE INDEX idx_chapter_manga_id ON chapter(manga_id);
CREATE INDEX idx_reading_progress_user_id ON reading_progress(user_id, last_read_at DESC);

-- Full-text search index
CREATE INDEX idx_manga_title_description ON manga 
  USING GIN(to_tsvector('english', title || ' ' || description));
```

### Pagination Strategy

**Cursor-Based Pagination (Better for large datasets)**
```typescript
async function getPaginatedManga(
  cursor?: string,
  limit = 20
) {
  return prisma.manga.findMany({
    take: limit + 1, // Fetch one extra to check if more exist
    ...(cursor && {
      skip: 1, // Skip the cursor itself
      cursor: { id: cursor },
    }),
    orderBy: { createdAt: 'desc' },
  });
}

// Usage
let cursor: string | undefined;
let hasMore = true;

while (hasMore) {
  const items = await getPaginatedManga(cursor, 20);
  
  if (items.length > 20) {
    hasMore = true;
    cursor = items[19].id;
    items.pop(); // Remove the extra item
  } else {
    hasMore = false;
  }
  
  console.log(items); // Process batch
}
```

### Query Result Caching

```typescript
async function getMangaWithCache(mangaId: string) {
  const cacheKey = `manga:${mangaId}`;
  
  // Check Redis cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Query database
  const manga = await prisma.manga.findUnique({
    where: { id: mangaId },
    include: { chapters: true, genres: true },
  });

  // Cache for 1 hour
  if (manga) {
    await redis.setex(cacheKey, 3600, JSON.stringify(manga));
  }

  return manga;
}
```

---

## 6. FRONTEND PERFORMANCE

### Code Splitting Strategy

**Dynamic Imports for Route-Based Splitting**
```typescript
// pages/_app.tsx
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Lazy load route components
const HomePage = dynamic(() => import('./home'), {
  loading: () => <div>Loading...</div>,
});

const MangaDetailPage = dynamic(() => import('./manga/[id]'), {
  loading: () => <div>Loading...</div>,
});

const ReaderPage = dynamic(() => import('./reader/[id]'), {
  loading: () => <div>Loading...</div>,
});

const AdminPage = dynamic(() => import('./admin'), {
  loading: () => <div>Loading...</div>,
  ssr: false, // Don't server-side render admin
});
```

### Bundle Analysis

```bash
# Analyze bundle size
npm run build -- --profile
npm install --save-dev @next/bundle-analyzer

# Generate report
npm run analyze
```

**File: `next.config.js`**
```javascript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // ... other config
});
```

### Font Optimization

**Subset Only Required Characters**
```css
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 700;
  font-display: swap; /* Avoid FOUT */
  src: url('/fonts/playfair-700-subset.woff2') format('woff2');
  unicode-range: U+0020-007E; /* ASCII only */
}
```

### Critical CSS

```html
<!-- Inline critical CSS for above-fold content -->
<style>
  /* Only styles needed for first paint */
  body { font-family: system-ui; }
  .header { background: #fff; }
</style>

<!-- Defer non-critical CSS -->
<link
  rel="preload"
  href="/styles/non-critical.css"
  as="style"
  onload="this.onload=null;this.rel='stylesheet'"
/>
```

---

## 7. CDN & DELIVERY

### Cloudflare Configuration

**File: `wrangler.toml` (Cloudflare Workers)**

```toml
name = "manga-zone"
type = "webpack"
route = "*.mangazone.id/*"
zone_id = "YOUR_ZONE_ID"

[env.production]
route = "*.mangazone.id/*"

[env.staging]
route = "staging.mangazone.id/*"

# Cache rules
[triggers]
crons = ["0 0 * * *"] # Purge cache daily
```

### Cache Purge Strategy

```typescript
// Purge specific URLs when content changes
export async function purgeCDNCache(urls: string[]) {
  return fetch('https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/purge_cache', {
    method: 'POST',
    headers: {
      'X-Auth-Email': process.env.CLOUDFLARE_EMAIL,
      'X-Auth-Key': process.env.CLOUDFLARE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: urls }),
  });
}

// Usage: When admin updates manga
export async function updateManga(mangaId: string, data: any) {
  const updated = await prisma.manga.update({
    where: { id: mangaId },
    data,
  });

  // Purge CDN
  await purgeCDNCache([
    `/manga/${mangaId}`,
    `/api/manga/${mangaId}`,
  ]);

  return updated;
}
```

---

## 8. LOAD TESTING & SCALING

### Load Test Scenarios

**Scenario 1: Normal Traffic (100 users)**
```bash
k6 run tests/load/normal-traffic.js
  --vus 100
  --duration 5m
  --ramp-up 30s
  --ramp-down 30s
```

**Scenario 2: Peak Traffic (1000 users)**
```bash
k6 run tests/load/peak-traffic.js
  --vus 1000
  --duration 10m
  --ramp-up 1m
  --ramp-down 1m
```

**Scenario 3: Reader Load (manga pages)**
```bash
k6 run tests/load/reader-stress.js
  --vus 500
  --duration 5m
  # Simulates 500 users reading manga simultaneously
```

### k6 Load Test Script

**File: `tests/load/normal-traffic.js`**

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp up
    { duration: '5m', target: 100 },    // Stay at 100
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function () {
  // Home page
  const homeRes = http.get('https://mangazone.id/');
  check(homeRes, { 'home status 200': (r) => r.status === 200 });

  sleep(2);

  // Search manga
  const searchRes = http.get('https://mangazone.id/api/manga/search?q=attack');
  check(searchRes, { 'search status 200': (r) => r.status === 200 });

  sleep(1);

  // Get manga detail
  const mangaRes = http.get('https://mangazone.id/api/manga/manga-1');
  check(mangaRes, { 'manga status 200': (r) => r.status === 200 });

  sleep(3);
}
```

### Scaling Strategy

**Horizontal Scaling (Multiple Servers)**
```
Load Balancer (Vercel)
    ↓
┌─────────────────────────────┐
│ API Server 1 (Node.js)      │
│ API Server 2 (Node.js)      │
│ API Server 3 (Node.js)      │
└─────────────────────────────┘
    ↓
Database (Supabase - Auto-scaling)
```

**Database Scaling**
```
At 1000 req/s:
- Enable read replicas for read-heavy queries
- Use connection pooling (PgBouncer)
- Archive old reading history

At 5000 req/s:
- Implement database sharding by manga_id
- Use materialized views for aggregates
- Increase cache TTL for hot data
```

---

## 9. MONITORING & METRICS

### Key Performance Indicators (KPIs)

**User-Centric Metrics**
```
LCP: < 2.5s (75th percentile)
CLS: < 0.1 (75th percentile)
INP: < 200ms (75th percentile)
```

**Business Metrics**
```
Page Load Time (p95): < 3s
API Response Time (p95): < 200ms
Search Time (p99): < 500ms
Error Rate: < 0.1%
Uptime: > 99.9%
```

**System Metrics**
```
CPU Usage: < 70%
Memory Usage: < 80%
Database Connections: < 80% of max
Cache Hit Rate: > 80%
CDN Hit Rate: > 90%
```

### Monitoring Tools

**Vercel Analytics** (Built-in)
```
Dashboard: https://vercel.com/dashboard/project/[PROJECT]/analytics
Metrics tracked:
- Core Web Vitals
- API response times
- Error rates
- Function execution times
```

**Sentry Performance Monitoring**
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
  ],
});

// Custom tracing
const transaction = Sentry.startTransaction({
  op: "db.query",
  name: "Fetch manga with chapters",
});

const span = transaction.startChild({
  op: "db.query",
  description: "SELECT * FROM manga WHERE id = ?",
});

// ... query code ...

span.finish();
transaction.finish();
```

---

## 10. PERFORMANCE BUDGET

### JavaScript Budget

```
Target:    150KB (gzipped)
Warning:   140KB
Critical:  160KB

Current breakdown:
- React:              35KB
- Next.js Runtime:    20KB
- App Code:           60KB
- UI Components:      25KB
- Utilities:          15KB
Total:                155KB
```

### CSS Budget

```
Target:    40KB (gzipped)
Warning:   35KB
Critical:  50KB

Breakdown:
- Tailwind (purged):  25KB
- Component styles:   10KB
- Global styles:      5KB
Total:                40KB
```

### Image Budget

```
Total per page:   500KB (lazy-loaded)

Homepage:
- Hero banner:    80KB (WebP, responsive)
- Manga grid:     300KB (20 covers × 15KB)
- Other images:   120KB

Reader Page:
- First page:     150KB (WebP, 1080px)
- Preload next 5: 750KB (lazy-loaded)
```

### Monitor Budget Violations

**File: `.github/workflows/performance-budget.yml`**

```yaml
name: Performance Budget

on: [pull_request]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npm run build
      
      - name: Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          configPath: './lighthouserc.json'
          
      - name: Bundle Analysis
        run: npm run analyze
        
      - name: Check budgets
        run: npm run check:budgets
```

---

## IMPLEMENTATION CHECKLIST

### Image Optimization
- [ ] Set up Sharp for image processing
- [ ] Create responsive image component
- [ ] Implement WebP with JPEG fallback
- [ ] Set up Cloudinary for image hosting
- [ ] Create image optimization API route
- [ ] Test images on 3G/4G networks

### Caching
- [ ] Set up Redis instance
- [ ] Implement cache helper functions
- [ ] Add HTTP cache headers
- [ ] Create Service Worker
- [ ] Test cache invalidation
- [ ] Monitor cache hit rates

### Database
- [ ] Add indexes for common queries
- [ ] Implement eager loading with include()
- [ ] Set up query caching
- [ ] Create cursor-based pagination
- [ ] Monitor slow queries (> 1s)

### Frontend
- [ ] Implement code splitting
- [ ] Analyze bundle with webpack-bundle-analyzer
- [ ] Optimize fonts (subset + preload)
- [ ] Implement critical CSS inlining
- [ ] Test on real 4G/3G networks

### CDN & Delivery
- [ ] Configure Cloudflare caching
- [ ] Set up cache purge on updates
- [ ] Monitor CDN hit rates
- [ ] Test failover to origin

### Testing & Monitoring
- [ ] Run k6 load tests (normal traffic)
- [ ] Run k6 peak traffic tests
- [ ] Set up monitoring dashboards
- [ ] Configure performance alerts
- [ ] Create runbooks for scaling

---

## SUMMARY

This performance strategy delivers:

✅ **Fast Load Times:** < 2.5s LCP on 4G  
✅ **Scalable Architecture:** Support 10,000+ concurrent users  
✅ **Optimized Images:** 25-35% size reduction with WebP  
✅ **Multi-Layer Caching:** 3+ levels for cache hits  
✅ **Monitored Performance:** Real-time metrics & alerts  

**Expected Improvement:** 60-70% faster page loads vs. unoptimized

---

**Next Tier-2 File:** SECURITY_COMPLIANCE.md
