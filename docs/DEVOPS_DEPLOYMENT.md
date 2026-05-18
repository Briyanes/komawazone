# DEVOPS_DEPLOYMENT.md
## Tier-2 Developer Specification: DevOps & Deployment Strategy

**Document ID:** TIER2-DEV-003  
**Created:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ COMPLETE  
**Priority:** HIGH (Phase 2 - Infrastructure)

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Deployment Pipeline](#deployment-pipeline)
3. [Environment Management](#environment-management)
4. [Database Migrations](#database-migrations-devops)
5. [Continuous Integration](#continuous-integration)
6. [Continuous Deployment](#continuous-deployment)
7. [Monitoring & Observability](#monitoring--observability)
8. [Incident Management](#incident-management)
9. [Backup & Disaster Recovery](#backup--disaster-recovery)
10. [Infrastructure as Code](#infrastructure-as-code)

---

## 1. EXECUTIVE SUMMARY

### Deployment Strategy

**Tech Stack**
```
Source Control:    GitHub (git)
CI/CD:            GitHub Actions
Hosting:          Vercel (Next.js optimized)
Database:         Supabase (PostgreSQL managed)
CDN:              Vercel + Cloudflare
Monitoring:       Vercel + Sentry + Datadog
Secrets:          Vercel Environment Variables
Infrastructure:   Managed services (no servers to manage)
```

### Deployment Environments

| Env | URL | Branch | Auto-Deploy | Approval |
|-----|-----|--------|-------------|----------|
| Dev | `dev.mangazone.id` | `develop` | Yes | None |
| Staging | `staging.mangazone.id` | `main` | Yes | None |
| Production | `mangazone.id` | `release/*` | Yes | Manual |

### Deployment Flow

```
┌──────────────┐
│ Push to Git  │ ← Developer commits code
└──────┬───────┘
       ↓
┌──────────────────┐
│ GitHub Actions   │ ← Automated tests & build
│ CI Pipeline      │
└──────┬───────────┘
       ↓
   Pass?
   /    \
  No    Yes
  │      ↓
  │  ┌───────────────┐
  │  │ Deploy to Dev │
  │  │ (automatic)   │
  │  └───────┬───────┘
  │          ↓
  │  ┌─────────────────────────┐
  │  │ Merge to main           │
  │  │ Deploy to Staging       │
  │  │ (after code review)     │
  │  └───────┬─────────────────┘
  │          ↓
  │  ┌──────────────────────────┐
  │  │ Tag release              │
  │  │ Deploy to Production     │
  │  │ (manual trigger)         │
  │  └──────────────────────────┘
  │
  └─ Reject & notify developer
```

---

## 2. DEPLOYMENT PIPELINE

### Git Workflow (GitHub Flow)

```
main (production-ready)
  ↑
  ├─ develop (integration branch)
  │   ↑
  │   ├─ feature/auth-mfa
  │   ├─ feature/manga-search
  │   ├─ fix/reader-scrolling
  │   └─ docs/update-readme
  │
  └─ release/v1.0.0 (stable release)
```

### Branch Protection Rules

**On `main` branch:**
```
✅ Require pull request reviews (2 reviewers)
✅ Require status checks to pass (tests, lint, type-check)
✅ Require branches to be up-to-date before merging
✅ Require code quality reviews (CodeClimate)
✅ Dismiss stale pull request approvals
✅ Restrict who can push to matching branches (maintainers only)
```

### Commit Message Convention (Conventional Commits)

```
feat: add user authentication with TOTP
      ↑
      ├─ type: feat, fix, docs, style, refactor, perf, test, chore
      └─ description: lowercase, imperative, no period

Examples:
feat(auth): implement JWT token refresh
fix(reader): prevent infinite scroll on last page
docs(api): update endpoint documentation
chore(deps): upgrade React to 18.3
test(manga): add unit tests for search filter
refactor(cache): improve Redis key naming

Breaking changes add footer:
BREAKING CHANGE: changed API response format
```

---

## 3. ENVIRONMENT MANAGEMENT

### Environment Variables

**File: `.env.example` (committed to Git)**
```
# Public (next.js automatically prefixes with NEXT_PUBLIC_)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_APP_VERSION=1.0.0

# Private (server-side only)
DATABASE_URL=
JWT_SECRET=
SENTRY_AUTH_TOKEN=
ENCRYPTION_KEY=
REDIS_URL=
CLOUDINARY_API_SECRET=
```

**Vercel Environment Variables** (stored in Vercel dashboard)
```
Development:
  DATABASE_URL = postgresql://user:pass@db-dev.supabase.co/postgres
  NODE_ENV = development
  JWT_SECRET = [dev-secret]

Staging:
  DATABASE_URL = postgresql://user:pass@db-staging.supabase.co/postgres
  NODE_ENV = production
  JWT_SECRET = [staging-secret]

Production:
  DATABASE_URL = postgresql://user:pass@db-prod.supabase.co/postgres
  NODE_ENV = production
  JWT_SECRET = [prod-secret]
```

### Secret Rotation

```bash
# Monthly rotation schedule
1. Generate new secret
2. Deploy app with both old & new secrets
3. App uses new secret but accepts old for validation
4. After 30 days: Remove old secret
5. Monitor for any errors

Example: JWT_SECRET rotation
JWT_SECRET_CURRENT = new_secret_xyz
JWT_SECRET_PREVIOUS = old_secret_abc

// Code accepts both during transition
const secret = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET_PREVIOUS;
```

---

## 4. DATABASE MIGRATIONS (DevOps)

### Migration Strategy During Deployment

**Safe Zero-Downtime Migrations**

```sql
-- ✅ SAFE: Adding nullable column
ALTER TABLE manga ADD COLUMN source_url VARCHAR;

-- ✅ SAFE: Adding column with default
ALTER TABLE manga ADD COLUMN views INT DEFAULT 0;

-- ❌ RISKY: Removing column (breaks code if still referenced)
ALTER TABLE manga DROP COLUMN source_url;

-- ❌ RISKY: Renaming column (breaks code)
ALTER TABLE manga RENAME COLUMN view_count TO views;

-- ❌ RISKY: Changing column type (may fail for existing data)
ALTER TABLE manga ALTER COLUMN rating TYPE INTEGER;
```

### Safe Deployment Process

```
1. Create migration with backwards-compatible changes
2. Deploy migration to staging
3. Test thoroughly
4. Deploy code that uses new schema (still compatible with old)
5. Wait 1 week
6. Deploy code that requires new schema
7. Remove old schema if needed (with new migration)
```

### Rollback Strategy

**Automatic rollback on error:**
```bash
# If deployment fails tests in Vercel:
1. Vercel automatically reverts to previous version
2. Notifies team of failure
3. Previous deployment remains live
```

**Manual rollback (if needed):**
```typescript
// Use Prisma migrate resolve
npx prisma migrate resolve --rolled-back <migration-name>

// Or revert to previous database backup
// Supabase: Use backup restore (12h window)
```

---

## 5. CONTINUOUS INTEGRATION

### GitHub Actions Workflow

**File: `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main, develop, 'feature/**']
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: '18'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - run: npm ci
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: manga_zone_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/manga_zone_test
      
      - run: npm run test:coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/manga_zone_test
      
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
      
      - run: npm run test:e2e

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - run: npm install -g snyk
      - run: snyk auth ${{ secrets.SNYK_TOKEN }}
      - run: snyk test --severity-threshold=high
      - run: snyk code test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      
      - uses: actions/upload-artifact@v3
        with:
          name: build
          path: .next
```

### Status Checks Required

```
✅ Lint: ESLint rules
✅ Type Check: TypeScript compilation
✅ Unit Tests: Jest coverage > 80%
✅ E2E Tests: Playwright critical flows
✅ Security: Snyk vulnerability scan
✅ Build: Next.js build succeeds
✅ Code Review: Approved by 2 reviewers (on main)
```

---

## 6. CONTINUOUS DEPLOYMENT

### Vercel Integration

**File: `vercel.json`**

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "outputDirectory": ".next",
  "env": {
    "NODE_ENV": "production"
  },
  "git": {
    "deploymentEnabled": {
      "main": true,
      "develop": true
    }
  },
  "preview": {
    "previewDeploymentURLPattern": "${{ deploymentId }}.preview.mangazone.id"
  }
}
```

### Deployment Preview

**For every PR:**
```
1. Vercel creates preview deployment
2. Preview URL: https://[pr-number]-[project].vercel.app
3. Includes all environment variables
4. Can test before merging
5. Auto-destroyed when PR closed
```

**Production Deployment**

```
Trigger: Push to `release/*` tag
Steps:
1. Run full CI pipeline
2. If all pass: Deploy to production
3. Blue-green deployment (no downtime)
4. Run health checks
5. Notify team of deployment
```

---

## 7. MONITORING & OBSERVABILITY

### Monitoring Stack

| Tool | Purpose | SLA |
|------|---------|-----|
| Vercel Analytics | Core Web Vitals, performance | Real-time |
| Sentry | Error tracking, performance | < 5 min alert |
| Datadog | Infrastructure metrics | < 1 min alert |
| Pingdom | Uptime monitoring | Real-time |
| LogRocket | Session replay | Real-time |

### Alerting Rules

**Critical (Paged immediately)**
```
- Uptime < 99% (4 hours)
- Error rate > 1%
- Response time p99 > 5s
- Database connection lost
```

**High (Slack in 5 min)**
```
- Error rate > 0.5%
- Response time p95 > 2s
- Deployment failed
- SSL certificate expiring in 7 days
```

**Medium (Slack within 1 hour)**
```
- Error rate > 0.1%
- Core Web Vitals degraded
- Backup failed
- Disk usage > 80%
```

### Datadog Dashboards

```
1. Overview: Status, errors, latency, rate of requests
2. Performance: LCP, CLS, INP, TTFB trends
3. Database: Query times, connection count, cache hit rate
4. Infrastructure: CPU, memory, disk, network
5. Users: Active users, new users, returning users
6. Business: Revenue (if applicable), feature usage
```

---

## 8. INCIDENT MANAGEMENT

### On-Call Rotation

```
Schedule: Weekly rotation (Monday-Sunday)
Escalation:
  Level 1: On-call engineer (15 min response)
  Level 2: Team lead (30 min response)
  Level 3: Engineering manager (1 hour response)

Tools: PagerDuty for scheduling & alerts
```

### Incident Runbook Example

**Scenario: High Error Rate**

```
1. DETECT (Automated)
   - Alert: Error rate > 1% for 5 minutes
   - Sentry: Error details
   - Notification: Slack + PagerDuty

2. RESPOND (0-5 min)
   - On-call acknowledges incident
   - Check: Error message & stack trace
   - Check: Recent deployments

3. ASSESS (5-15 min)
   - Is new code responsible?
   - Is database slow?
   - Is external service down?

4. MITIGATE (15-30 min)
   - If new code: Rollback deployment
   - If database: Check slow queries
   - If external: Route around it (graceful degradation)

5. RESTORE (30-60 min)
   - Verify error rate < 0.1%
   - Verify Core Web Vitals normal
   - Notify stakeholders

6. INVESTIGATE (After resolution)
   - Root cause analysis
   - Action items to prevent
   - Update runbooks
```

---

## 9. BACKUP & DISASTER RECOVERY

### Backup Strategy

**Database (Supabase)**
```
Frequency:    Daily automated backup
Retention:    30 days (7-day rollback window)
Location:     Geographically redundant
Test:         Restore tested monthly
RTO:          1 hour
RPO:          24 hours
```

**Code & Assets**
```
Source:       GitHub (permanent history)
Deployments:  Vercel (auto-rollback to previous)
Static files: CDN cache (automatic)
```

### Disaster Recovery Plan

**Scenario: Complete Data Loss**

```
Recovery Time Objective (RTO): 1 hour
Recovery Point Objective (RPO): 24 hours

1. DETECT (0-5 min)
   - Supabase alerts on data anomaly
   - Database query returns error
   
2. ASSESS (5-15 min)
   - Verify extent of loss
   - Check backup integrity
   - Get approval to restore
   
3. RESTORE (15-45 min)
   - Restore from latest backup
   - Verify data integrity
   - Run smoke tests
   
4. COMMUNICATE (Throughout)
   - Update status page
   - Notify affected users
   - Post-incident review
```

### Backup Testing

```bash
# Monthly backup test
1. Create test environment
2. Restore latest backup to test DB
3. Run integration tests
4. Verify data completeness
5. Document results
```

---

## 10. INFRASTRUCTURE AS CODE

### Vercel Configuration (IaC)

**File: `vercel.json` (version controlled)**

```json
{
  "projectSettings": {
    "framework": "nextjs",
    "nodeVersion": "18.x",
    "buildCommand": "npm run build",
    "outputDirectory": ".next"
  },
  "regions": ["iad1", "sin1", "nrt1"],
  "functions": {
    "api/**": {
      "memory": 1024,
      "maxDuration": 30
    }
  },
  "env": {
    "NODE_ENV": "production",
    "NEXT_PUBLIC_SUPABASE_URL": {
      "production": "https://your-project.supabase.co",
      "preview": "https://your-project.supabase.co"
    }
  }
}
```

### Database as Code (Prisma)

**File: `prisma/schema.prisma` (version controlled)**

```prisma
// Schema is documentation & migration history
// All changes committed to Git
// Migrations auto-generated from schema changes
```

### Monitoring as Code

**File: `.github/workflows/setup-monitoring.yml`**

```yaml
name: Setup Monitoring

on:
  workflow_dispatch

jobs:
  create-monitors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Create Datadog Monitors
        env:
          DATADOG_API_KEY: ${{ secrets.DATADOG_API_KEY }}
          DATADOG_APP_KEY: ${{ secrets.DATADOG_APP_KEY }}
        run: |
          # Create monitors from YAML definitions
          npx datadog-cli-tools create-monitors monitoring/datadog-monitors.yaml
```

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All CI checks passing
- [ ] Code reviewed by 2+ engineers
- [ ] Database migrations tested on staging
- [ ] No breaking changes to API
- [ ] Documentation updated
- [ ] Performance budgets met
- [ ] Security scan passed

### Deployment
- [ ] Tag release: `git tag v1.0.0`
- [ ] Push tag: `git push origin v1.0.0`
- [ ] Vercel automatically deploys
- [ ] Health checks passing
- [ ] Core Web Vitals normal
- [ ] Error rate < 0.1%
- [ ] No Sentry alerts

### Post-Deployment
- [ ] Monitor for 1 hour
- [ ] Collect user feedback
- [ ] Check error logs
- [ ] Verify analytics
- [ ] Update status page
- [ ] Celebrate with team! 🎉

---

## SUMMARY

This DevOps strategy provides:

✅ **Automated CI/CD:** Test, build, deploy automatically  
✅ **Zero-Downtime Deployments:** Blue-green deployment strategy  
✅ **Observability:** Real-time monitoring & alerting  
✅ **Disaster Recovery:** Automated backups & tested restore  
✅ **Infrastructure as Code:** Version-controlled everything  

**Deployment Frequency Target:** Multiple times per day  
**Mean Time to Recovery:** < 5 minutes  
**Uptime Target:** 99.95%

---

**TIER-2 SPECIFICATIONS COMPLETE!** ✅

All 3 Tier-2 files created:
1. ✅ PERFORMANCE_OPTIMIZATION.md
2. ✅ SECURITY_COMPLIANCE.md
3. ✅ DEVOPS_DEPLOYMENT.md
