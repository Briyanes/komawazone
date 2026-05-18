# ERROR_HANDLING.md
## Tier-1 Developer Specification: Error Handling & Monitoring Strategy

**Document ID:** TIER1-DEV-004  
**Created:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ COMPLETE  
**Priority:** CRITICAL (Phase 1 - Foundation)

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Error Classification](#error-classification)
3. [Error Response Format](#error-response-format)
4. [Global Error Handler](#global-error-handler)
5. [Client-Side Error Boundaries](#client-side-error-boundaries)
6. [Sentry Integration](#sentry-integration)
7. [Error Logging Strategy](#error-logging-strategy)
8. [Error Recovery Patterns](#error-recovery-patterns)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Error Budget & SLA](#error-budget--sla)

---

## 1. EXECUTIVE SUMMARY

### Error Handling Philosophy
- **Fail Safely:** Never expose sensitive data
- **User Friendly:** Clear messages, actionable help
- **Observable:** All errors logged for analysis
- **Resilient:** Auto-recovery where possible
- **Secure:** Prevent information leakage

### Strategy Layers
```
┌─────────────────────────────────────┐
│ Client-Side (Browser)               │
│ - Error boundaries                  │
│ - Try-catch wrappers                │
│ - User notifications                │
└─────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────┐
│ API Layer (Express/Next.js)         │
│ - Request validation                │
│ - Global error handler              │
│ - Error standardization             │
└─────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────┐
│ Monitoring (Sentry)                 │
│ - Error aggregation                 │
│ - Alerts & notifications            │
│ - Performance tracking              │
└─────────────────────────────────────┘
```

### Coverage Targets
- **Error Detection:** 100% (all errors caught)
- **Error Logging:** 99% (critical errors logged)
- **Mean Time to Resolution:** <2 hours (alert to fix)
- **Customer Impact:** <0.1% of users affected

---

## 2. ERROR CLASSIFICATION

### Error Types & HTTP Status

| Type | HTTP | Cause | User Message |
|------|------|-------|--------------|
| Validation | 400 | Invalid input | "Please check your input" |
| Auth | 401 | Missing token | "Please log in again" |
| Permission | 403 | Insufficient access | "You don't have access" |
| Not Found | 404 | Resource missing | "Item not found" |
| Conflict | 409 | Resource exists | "Already exists" |
| Rate Limit | 429 | Too many requests | "Too many requests, retry later" |
| Server Error | 500 | Internal error | "Something went wrong" |
| Unavailable | 503 | Service down | "Service temporarily down" |

### Error Severity Levels

**CRITICAL** (P0)
- Database connection lost
- Authentication service down
- Data corruption detected
- Payment processing failure
- Active user data loss
- **Response:** Page-wide error banner + immediate team alert

**HIGH** (P1)
- API endpoint returning 5xx
- File upload failures (systematic)
- Third-party service timeout (Sentry, Supabase)
- Large percentage of requests failing (>10%)
- **Response:** Error notification + alert after 5 consecutive failures

**MEDIUM** (P2)
- Individual request failures (<1%)
- Optional feature malfunction
- Non-critical third-party service degradation
- Performance degradation detected
- **Response:** Log + monitor, alert if trend detected

**LOW** (P3)
- Cosmetic UI issues
- Deprecation warnings
- Analytics tracking failures
- Non-essential feature errors
- **Response:** Log only, no alert

---

## 3. ERROR RESPONSE FORMAT

### Standardized Error Response

**Success Response (200-299)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "manga-1",
    "title": "Attack on Titan"
  },
  "meta": {
    "timestamp": "2026-05-15T05:32:39.505Z",
    "requestId": "req-abc123"
  }
}
```

**Error Response (4xx-5xx)**
```json
{
  "status": "error",
  "code": 400,
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [
      {
        "field": "email",
        "message": "String must contain at least 1 character(s)",
        "code": "too_small"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-05-15T05:32:39.505Z",
    "requestId": "req-abc123"
  }
}
```

### Error Type Reference

```typescript
// Global error type enum
export enum ErrorType {
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_PASSWORD = 'INVALID_PASSWORD',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // Authentication
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Authorization
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Resources
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Server
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  FILE_UPLOAD_ERROR = 'FILE_UPLOAD_ERROR',
  
  // External Services
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  SUPABASE_ERROR = 'SUPABASE_ERROR',
  STRIPE_ERROR = 'STRIPE_ERROR',
}
```

### Custom Error Class

**File: `src/lib/errors.ts`**

```typescript
export class AppError extends Error {
  constructor(
    public code: number,
    public type: ErrorType,
    message: string,
    public details?: any,
    public severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      status: 'error',
      code: this.code,
      error: {
        type: this.type,
        message: this.message,
        details: this.details,
      },
    };
  }
}

// Convenience error constructors
export const errors = {
  // 400 - Validation
  validationError: (message: string, details?: any) =>
    new AppError(400, ErrorType.VALIDATION_ERROR, message, details, 'MEDIUM'),
  
  invalidEmail: () =>
    new AppError(400, ErrorType.INVALID_EMAIL, 'Invalid email format'),
  
  invalidPassword: () =>
    new AppError(400, ErrorType.INVALID_PASSWORD, 
      'Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
  
  // 401 - Auth
  unauthorized: (message = 'Authentication required') =>
    new AppError(401, ErrorType.UNAUTHORIZED, message),
  
  tokenExpired: () =>
    new AppError(401, ErrorType.TOKEN_EXPIRED, 'Session expired. Please log in again.'),
  
  // 403 - Permission
  forbidden: (message = 'You do not have permission to access this resource') =>
    new AppError(403, ErrorType.FORBIDDEN, message),
  
  // 404 - Not Found
  notFound: (resource: string) =>
    new AppError(404, ErrorType.NOT_FOUND, `${resource} not found`),
  
  // 409 - Conflict
  conflict: (message: string) =>
    new AppError(409, ErrorType.CONFLICT, message, undefined, 'MEDIUM'),
  
  alreadyExists: (resource: string) =>
    new AppError(409, ErrorType.ALREADY_EXISTS, `${resource} already exists`),
  
  // 429 - Rate Limit
  rateLimitExceeded: () =>
    new AppError(429, ErrorType.RATE_LIMIT_EXCEEDED, 
      'Too many requests. Please try again later.'),
  
  // 500 - Server
  internalError: (message = 'Something went wrong') =>
    new AppError(500, ErrorType.INTERNAL_ERROR, message, undefined, 'CRITICAL'),
  
  databaseError: (originalError?: Error) =>
    new AppError(500, ErrorType.DATABASE_ERROR, 
      'Database operation failed', 
      { original: originalError?.message }, 
      'CRITICAL'),
  
  fileUploadError: (message: string) =>
    new AppError(500, ErrorType.FILE_UPLOAD_ERROR, message),
  
  // 503 - Service Unavailable
  serviceUnavailable: () =>
    new AppError(503, ErrorType.SERVICE_UNAVAILABLE, 
      'Service temporarily unavailable. Please try again later.', 
      undefined, 
      'CRITICAL'),
};
```

---

## 4. GLOBAL ERROR HANDLER

### Express Error Middleware

**File: `src/middleware/errorHandler.ts`**

```typescript
import { NextFunction, Request, Response } from 'express';
import { AppError, errors } from '@/lib/errors';
import * as Sentry from "@sentry/nextjs";

export class ErrorHandler {
  static handle(
    error: Error | AppError,
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // Attach request info for logging
    const requestId = req.id || 'unknown';
    const userId = (req as any).user?.id;

    // Log error details
    ErrorHandler.log(error, {
      requestId,
      userId,
      method: req.method,
      path: req.path,
      ip: req.ip,
    });

    // Convert to AppError if needed
    let appError: AppError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof SyntaxError) {
      appError = errors.validationError('Invalid request body');
    } else {
      appError = errors.internalError('An unexpected error occurred');
    }

    // Capture in Sentry (but don't send 4xx client errors)
    if (appError.code >= 500) {
      Sentry.captureException(error, {
        tags: {
          errorType: appError.type,
          severity: appError.severity,
        },
        extra: {
          requestId,
          userId,
          path: req.path,
        },
      });
    }

    // Send response
    res.status(appError.code).json({
      status: 'error',
      code: appError.code,
      error: {
        type: appError.type,
        message: appError.message,
        details: appError.details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }

  private static log(
    error: Error,
    context: Record<string, any>
  ) {
    const level = error instanceof AppError && error.code >= 500 
      ? 'error' 
      : 'warn';

    console.log(JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
    }));
  }
}
```

### Register Global Error Handler

**File: `src/pages/api/[...].ts` (Next.js) or `src/app.ts` (Express)**

```typescript
import { errorHandler } from '@/middleware/errorHandler';

// ... routes ...

// Error handling middleware (MUST be last)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  ErrorHandler.handle(err, req, res, next);
});
```

### Async Error Wrapper

Wrap async route handlers to catch errors:

**File: `src/lib/asyncHandler.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
```

**Usage:**

```typescript
// ✅ GOOD: Errors caught and passed to error handler
router.post('/auth/login', asyncHandler(async (req, res) => {
  const user = await loginUser(req.body);
  res.json(user);
}));

// ❌ BAD: Error not caught
router.post('/auth/login', async (req, res) => {
  const user = await loginUser(req.body); // If this throws, error handler never called
  res.json(user);
});
```

---

## 5. CLIENT-SIDE ERROR BOUNDARIES

### React Error Boundary

**File: `src/components/ErrorBoundary.tsx`**

```typescript
import React, { ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps> {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to Sentry
    Sentry.captureException(error, {
      tags: { context: 'React Error Boundary' },
      extra: errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state?.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded">
            <h2 className="text-red-800 font-bold">Something went wrong</h2>
            <p className="text-red-700 text-sm mt-2">
              Please refresh the page or contact support if the problem persists.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded"
            >
              Refresh Page
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// Wrap app in error boundary
export function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
```

### Try-Catch Wrapper Hook

**File: `src/hooks/useAsyncError.ts`**

```typescript
import { useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';

export function useAsyncError() {
  return useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (error) {
        // Log to Sentry
        Sentry.captureException(error, {
          tags: { context: 'useAsyncError' },
        });

        // Show user-friendly notification
        showErrorNotification(
          error instanceof Error ? error.message : 'Something went wrong'
        );

        return null;
      }
    },
    []
  );
}

// Usage
function MangaDetails() {
  const asyncError = useAsyncError();
  const [manga, setManga] = useState(null);

  useEffect(() => {
    asyncError(async () => {
      const data = await fetchManga(id);
      setManga(data);
    });
  }, [id]);

  return <div>{manga?.title}</div>;
}
```

### Error Notification Toast

**File: `src/components/ErrorNotification.tsx`**

```typescript
import { useEffect, useState } from 'react';

interface ErrorNotificationProps {
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function ErrorNotification({
  message,
  duration = 5000,
  action,
}: ErrorNotificationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 max-w-sm"
    >
      <span>{message}</span>
      {action && (
        <button
          onClick={() => {
            action.onClick();
            setVisible(false);
          }}
          className="underline hover:opacity-80"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={() => setVisible(false)}
        className="ml-auto hover:opacity-80"
      >
        ✕
      </button>
    </div>
  );
}

// Global error notification context
export const useErrorNotification = () => {
  const [error, setError] = useState<ErrorNotificationProps | null>(null);

  return {
    show: (config: ErrorNotificationProps) => {
      setError(config);
      setTimeout(() => setError(null), config.duration ?? 5000);
    },
    notification: error,
  };
};
```

---

## 6. SENTRY INTEGRATION

### Setup Sentry

**File: `src/sentry.server.config.ts`**

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.OnUncaughtException(),
    new Sentry.Integrations.OnUnhandledRejection(),
  ],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  serverName: 'mangazone-api',
  release: process.env.NEXT_PUBLIC_APP_VERSION,
});
```

**File: `src/sentry.client.config.ts`**

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  release: process.env.NEXT_PUBLIC_APP_VERSION,
});
```

### Capture Errors Manually

```typescript
// Capture exception
Sentry.captureException(error, {
  tags: { section: 'manga-detail' },
  extra: { mangaId: '123' },
});

// Capture message
Sentry.captureMessage('User reached end of chapter', 'info');

// Add breadcrumb
Sentry.addBreadcrumb({
  category: 'user-action',
  message: 'Clicked read chapter',
  data: { chapterId: '456' },
});
```

### Environment Configuration

**File: `.env.local`**

```
# Sentry
SENTRY_DSN=https://[key]@sentry.io/[project]
NEXT_PUBLIC_SENTRY_DSN=https://[key]@sentry.io/[project]
SENTRY_AUTH_TOKEN=sntrys_[token]
```

---

## 7. ERROR LOGGING STRATEGY

### Structured Logging

**File: `src/lib/logger.ts`**

```typescript
interface LogContext {
  requestId?: string;
  userId?: string;
  action?: string;
  [key: string]: any;
}

export const logger = {
  info: (message: string, context?: LogContext) => {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      message,
      ...context,
    }));
  },

  warn: (message: string, context?: LogContext) => {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      message,
      ...context,
    }));
  },

  error: (message: string, error?: Error, context?: LogContext) => {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      },
      ...context,
    }));
  },

  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(JSON.stringify({
        level: 'debug',
        timestamp: new Date().toISOString(),
        message,
        ...context,
      }));
    }
  },
};
```

### Log Aggregation (Vercel)

Vercel automatically aggregates logs. View at:
```
https://vercel.com/dashboard/project/[PROJECT]/logs
```

### Request Logging Middleware

**File: `src/middleware/requestLogger.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '@/lib/logger';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const start = Date.now();
  const requestId = req.id;

  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info(`${req.method} ${req.path}`, {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).user?.id,
    });

    // Alert on slow requests
    if (duration > 5000) {
      logger.warn(`Slow request detected: ${req.method} ${req.path}`, {
        requestId,
        duration: `${duration}ms`,
      });
    }
  });

  next();
}
```

---

## 8. ERROR RECOVERY PATTERNS

### Retry Logic

**File: `src/lib/retry.ts`**

```typescript
interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    shouldRetry = (error) => error instanceof NetworkError,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Usage
const data = await withRetry(
  () => fetchManga(id),
  {
    maxAttempts: 3,
    delayMs: 500,
    shouldRetry: (err) => err instanceof NetworkError,
  }
);
```

### Graceful Degradation

```typescript
// If ads fail to load, show content without ads
async function loadPage() {
  const [manga, ads] = await Promise.allSettled([
    fetchManga(id),
    fetchAds(placement),
  ]);

  return {
    manga: manga.status === 'fulfilled' ? manga.value : null,
    ads: ads.status === 'fulfilled' ? ads.value : [], // Empty array if fails
  };
}
```

### Fallback Data

```typescript
// If real data unavailable, use cached version
async function getMangaData(id: string) {
  try {
    return await fetchMangaLive(id);
  } catch (error) {
    logger.warn('Failed to fetch live manga data, using cache', { id });
    return cache.get(`manga:${id}`);
  }
}
```

---

## 9. MONITORING & ALERTING

### Critical Error Alerts

**File: `.github/workflows/sentry-alerts.yml`**

```yaml
name: Sentry Alerts

on:
  workflow_dispatch:

jobs:
  check-errors:
    runs-on: ubuntu-latest
    steps:
      - name: Check Sentry for critical errors
        run: |
          # Query Sentry API for errors in last 24h
          ERRORS=$(curl -H "Authorization: Bearer ${{ secrets.SENTRY_AUTH_TOKEN }}" \
            "https://sentry.io/api/0/projects/[ORG]/[PROJECT]/issues/?query=is:unresolved&level=error" \
            | jq '.[] | select(.level=="error") | length')

          if [ "$ERRORS" -gt 5 ]; then
            echo "🚨 Critical: $ERRORS errors found"
            # Send alert to Slack
            curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
              -H 'Content-Type: application/json' \
              -d "{\"text\":\"🚨 Manga Zone: $ERRORS critical errors in last 24h\"}"
          fi
```

### Performance Monitoring

```typescript
// Track API response times
import { performance } from 'perf_hooks';

async function trackPerformance<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const mark = `${name}-start`;
  performance.mark(mark);

  try {
    return await fn();
  } finally {
    const measure = `${name}-duration`;
    performance.mark(`${name}-end`);
    performance.measure(measure, mark, `${name}-end`);

    const duration = performance.getEntriesByName(measure)[0].duration;

    // Log if slow
    if (duration > 1000) {
      logger.warn(`Slow operation: ${name}`, { duration });
    }
  }
}
```

### Health Check Endpoint

**File: `src/pages/api/health.ts`**

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check external services
    const [supabaseOk] = await Promise.allSettled([
      fetch('https://supabase.com/status'),
    ]);

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      services: {
        supabase: supabaseOk.status === 'fulfilled' ? 'ok' : 'degraded',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

---

## 10. ERROR BUDGET & SLA

### Error Budget Definition

```
Total Errors Allowed Per Month = (1 - SLA%) × Total Requests

Example:
- SLA Target: 99.9% (three 9s)
- Monthly Requests: 10,000,000
- Error Budget: (1 - 0.999) × 10,000,000 = 10,000 errors

This means: Can have up to 10,000 errors before breaching SLA
```

### Service Level Indicators (SLIs)

| SLI | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.9% | Uptime / Total time |
| Error Rate | <0.1% | Errors / Total requests |
| Latency (p99) | <1s | Response time for 99th percentile |
| Error Response Time | <5min | Time to identify & alert on error |

### Error Budget Tracking

**File: `src/lib/errorBudget.ts`**

```typescript
const ERROR_BUDGET_THRESHOLD = 0.001; // 0.1%

async function trackErrorBudget() {
  const metrics = await getMetricsForDay();
  
  const errorRate = metrics.errors / metrics.totalRequests;

  if (errorRate > ERROR_BUDGET_THRESHOLD) {
    // Alert: Error budget exceeded
    alertOncall('Error budget exceeded', {
      errorRate: `${(errorRate * 100).toFixed(2)}%`,
      budget: `${(ERROR_BUDGET_THRESHOLD * 100)}%`,
      errors: metrics.errors,
    });
  }
}
```

---

## IMPLEMENTATION CHECKLIST

### Global Error Handler
- [ ] Create AppError custom class
- [ ] Create error factory functions (errors.validation(), etc.)
- [ ] Implement Express global error middleware
- [ ] Wrap async route handlers with asyncHandler()
- [ ] Test error handling in routes

### Client-Side Errors
- [ ] Implement ErrorBoundary component
- [ ] Wrap App with ErrorBoundary
- [ ] Create useAsyncError hook
- [ ] Implement ErrorNotification toast
- [ ] Add error boundaries to critical sections

### Sentry Integration
- [ ] Setup Sentry project
- [ ] Configure server-side integration
- [ ] Configure client-side integration
- [ ] Test error capture in dev environment
- [ ] Configure alert rules in Sentry

### Logging
- [ ] Implement structured logger
- [ ] Add request logging middleware
- [ ] Add timing logs for performance tracking
- [ ] Configure log aggregation (Vercel)
- [ ] Test log output in dev

### Recovery
- [ ] Implement retry logic with backoff
- [ ] Add graceful degradation patterns
- [ ] Implement fallback data strategies
- [ ] Test recovery mechanisms

### Monitoring
- [ ] Create health check endpoint
- [ ] Setup performance monitoring
- [ ] Configure SLO alerts
- [ ] Create error budget dashboard
- [ ] Setup oncall rotation

### Testing
- [ ] Unit tests for error classes
- [ ] Integration tests for error flows
- [ ] E2E tests for error UI
- [ ] Load tests for error rate under stress
- [ ] Manual testing of error scenarios

---

## SUMMARY

This error handling strategy provides:

✅ **Visibility:** All errors captured and logged centrally  
✅ **Reliability:** Retry logic and graceful degradation  
✅ **User Experience:** Clear error messages and recovery paths  
✅ **Developer Experience:** Structured error classes and patterns  
✅ **Monitoring:** Real-time alerts and performance tracking  
✅ **Compliance:** Secure error handling, no data leakage  

**Implementation Time**: 2-3 weeks for full setup  
**Ongoing Maintenance**: 2-3 hours per week monitoring alerts

---

**Next File:** TYPESCRIPT_SETUP.md (Developer File #5 - FINAL)
