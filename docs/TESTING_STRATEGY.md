# TESTING_STRATEGY.md
## Tier-1 Developer Specification: Comprehensive Testing Framework

**Document ID:** TIER1-DEV-001  
**Created:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ COMPLETE  
**Priority:** CRITICAL (Phase 1 - Foundation)

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Testing Philosophy](#testing-philosophy)
3. [Testing Stack](#testing-stack)
4. [Unit Testing Strategy](#unit-testing-strategy)
5. [Integration Testing Strategy](#integration-testing-strategy)
6. [E2E Testing Strategy](#e2e-testing-strategy)
7. [Performance Testing](#performance-testing)
8. [Coverage Targets](#coverage-targets)
9. [Critical User Flows](#critical-user-flows)
10. [CI/CD Integration](#cicd-integration)
11. [Test Data Management](#test-data-management)
12. [Running Tests](#running-tests)

---

## 1. EXECUTIVE SUMMARY

### Goals
- **Reliability:** Catch bugs before production (80% critical path coverage)
- **Confidence:** Deploy with zero downtime
- **Maintainability:** Tests as documentation for developers
- **Speed:** Fast feedback loop (<10s unit tests, <60s integration tests)

### Stack Overview
| Layer | Tool | Coverage Target | Run Time |
|-------|------|-----------------|----------|
| Unit | Jest + React Testing Library | 80% | <10s |
| Integration | Jest + Supertest | 70% | <30s |
| E2E | Playwright | 100% critical flows | <60s |
| Performance | Lighthouse CI + Web Vitals | Core Web Vitals | Manual |

### Coverage Breakdown
```
┌─────────────────────────────────┐
│ Total Coverage Target: 82%      │
├─────────────────────────────────┤
│ Unit Tests: 70% of codebase    │ ← Controllers, hooks, utils
│ Integration: 50% of API routes │ ← Auth, manga CRUD, user actions
│ E2E: 100% critical flows       │ ← Login, read, search, bookmark
│ Performance: 5 Core Web Vitals │ ← LCP, CLS, FID/INP, TTFB, FCP
└─────────────────────────────────┘
```

---

## 2. TESTING PHILOSOPHY

### Principle: Test User Behavior, Not Implementation

**DON'T:** Test internal state or component implementation details
```typescript
// ❌ BAD: Testing internal state
it('should set loading to true when fetching', () => {
  const { getByTestId } = render(<MangaList />);
  expect(getByTestId('loading-state')).toBe(true);
});
```

**DO:** Test user-visible outcomes
```typescript
// ✅ GOOD: Testing user experience
it('should display loading spinner while fetching manga', async () => {
  const { getByRole } = render(<MangaList />);
  expect(getByRole('status', { hidden: false })).toBeInTheDocument();
  await waitFor(() => {
    expect(getByRole('listitem')).toBeInTheDocument();
  });
});
```

### Testing Pyramid (Investment)
```
        / \
       /E2E\         5% investment
      /-----\        (100% critical flows)
     / Integration \ 20% investment
    /---------------\ (70% API routes)
   /   Unit Tests     \ 75% investment
  /---------------------\ (80% code coverage)
```

### The Three Types of Tests

1. **Unit Tests (Controllers, Hooks, Utilities)**
   - Test individual functions in isolation
   - Use mocks for external dependencies
   - Run on file save (watch mode)
   - Fastest feedback loop

2. **Integration Tests (API Routes, Services)**
   - Test how components work together
   - Use test database (isolated)
   - Test auth flows, CRUD operations
   - Run before commit

3. **E2E Tests (Critical User Journeys)**
   - Test full flow: UI → API → Database
   - Real browser automation
   - Test on actual Vercel preview deployments
   - Run before production deployment

---

## 3. TESTING STACK

### Dependencies to Install

```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@testing-library/user-event": "^14.5.0",
    "jest-mock-extended": "^3.0.0",
    "ts-jest": "^29.1.0",
    "@playwright/test": "^1.40.0",
    "supertest": "^6.3.0",
    "@types/supertest": "^2.0.12",
    "lighthouse": "^11.0.0"
  }
}
```

### Tool Purposes

**Jest** - JavaScript test runner
- Fast, parallel test execution
- Built-in coverage reporting
- Watch mode for development
- Works with TypeScript via ts-jest

**React Testing Library** - Component testing
- Tests components like users do (query by role, label, placeholder)
- Encourages accessible component design
- Prevents testing implementation details
- Pairs perfectly with Jest

**Playwright** - E2E browser automation
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile device emulation (iPhone 12, Pixel 5, iPad Pro)
- Visual regression testing
- Network request mocking

**Supertest** - HTTP assertion library
- Test Express/Next.js API routes
- Assert response status, headers, body
- Pairs with Jest for API testing

**Lighthouse CI** - Performance monitoring
- Automated performance testing
- Core Web Vitals tracking
- Integrates with GitHub Actions

---

## 4. UNIT TESTING STRATEGY

### File Structure
```
src/
├── hooks/
│   ├── useMangaSearch.ts
│   └── useMangaSearch.test.ts        ← Unit test
├── utils/
│   ├── formatDate.ts
│   └── formatDate.test.ts            ← Unit test
├── lib/
│   ├── supabaseClient.ts
│   └── supabaseClient.test.ts        ← Unit test
└── components/
    ├── MangaCard.tsx
    └── MangaCard.test.tsx            ← Component test
```

### Setup: jest.config.js

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.tsx',
    '!src/pages/_app.tsx',
    '!src/pages/_document.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/hooks/': {
      lines: 85,
      functions: 85,
    },
    './src/utils/': {
      lines: 90,
      functions: 90,
    },
  },
};
```

### Setup: setupTests.tsx

```tsx
import '@testing-library/jest-dom';
import React from 'react';

// Mock next/navigation (App Router)
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      prefetch: jest.fn(),
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  useParams() {
    return {};
  },
}));

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement('img', props),
}));

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};
```

### Example: Hook Unit Test

**File: `src/hooks/useMangaSearch.test.ts`**

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMangaSearch } from './useMangaSearch';
import * as supabaseClient from '@/lib/supabaseClient';

jest.mock('@/lib/supabaseClient');

describe('useMangaSearch', () => {
  const mockSearch = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    (supabaseClient.searchManga as jest.Mock).mockResolvedValue([
      { id: '1', title: 'Attack on Titan' },
      { id: '2', title: 'Demon Slayer' },
    ]);
  });

  it('should return empty results initially', () => {
    const { result } = renderHook(() => useMangaSearch());
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should search manga when query changes', async () => {
    const { result } = renderHook(() => useMangaSearch());

    act(() => {
      result.current.search('Attack');
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0].title).toBe('Attack on Titan');
  });

  it('should debounce search input', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useMangaSearch());

    act(() => {
      result.current.search('A');
      result.current.search('At');
      result.current.search('Att');
    });

    expect(supabaseClient.searchManga).not.toHaveBeenCalled();

    act(() => {
      jest.runAllTimers();
    });

    expect(supabaseClient.searchManga).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('should handle search errors gracefully', async () => {
    (supabaseClient.searchManga as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useMangaSearch());

    act(() => {
      result.current.search('Test');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });
  });
});
```

### Example: Component Unit Test

**File: `src/components/MangaCard.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MangaCard } from './MangaCard';

describe('MangaCard', () => {
  const mockManga = {
    id: '1',
    title: 'Attack on Titan',
    coverUrl: '/manga/aot.jpg',
    rating: 9.2,
    status: 'Ongoing',
  };

  it('should render manga card with title and rating', () => {
    render(<MangaCard manga={mockManga} />);
    
    expect(screen.getByText('Attack on Titan')).toBeInTheDocument();
    expect(screen.getByText(/9\.2/)).toBeInTheDocument();
  });

  it('should display cover image', () => {
    render(<MangaCard manga={mockManga} />);
    
    const image = screen.getByRole('img', { hidden: true });
    expect(image).toHaveAttribute('src', '/manga/aot.jpg');
  });

  it('should call onBookmark when bookmark button clicked', async () => {
    const user = userEvent.setup();
    const handleBookmark = jest.fn();
    
    render(<MangaCard manga={mockManga} onBookmark={handleBookmark} />);
    
    const bookmarkBtn = screen.getByRole('button', { name: /bookmark/i });
    await user.click(bookmarkBtn);
    
    expect(handleBookmark).toHaveBeenCalledWith(mockManga.id);
  });

  it('should show loading state when favoriting', async () => {
    const user = userEvent.setup();
    render(<MangaCard manga={mockManga} favoriteLoading={true} />);
    
    const favoriteBtn = screen.getByRole('button', { name: /favorite/i });
    expect(favoriteBtn).toBeDisabled();
    expect(screen.getByTestId('favorite-spinner')).toBeInTheDocument();
  });

  it('should display error when load fails', () => {
    render(<MangaCard manga={mockManga} error="Failed to load" />);
    
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

### Example: Utility Function Test

**File: `src/utils/formatDate.test.ts`**

```typescript
import { formatDate, formatRelativeTime } from './formatDate';

describe('formatDate', () => {
  it('should format date as MM/DD/YYYY', () => {
    const result = formatDate(new Date('2026-05-15'));
    expect(result).toBe('05/15/2026');
  });

  it('should handle locale-specific formatting', () => {
    const result = formatDate(new Date('2026-05-15'), 'id-ID');
    expect(result).toBe('15/05/2026');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should show "just now" for times < 1 minute ago', () => {
    const now = new Date('2026-05-15T11:59:30Z');
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('should show minutes for times < 1 hour ago', () => {
    const time = new Date('2026-05-15T11:45:00Z');
    expect(formatRelativeTime(time)).toBe('15 minutes ago');
  });

  it('should show days for times > 1 day ago', () => {
    const time = new Date('2026-05-10T12:00:00Z');
    expect(formatRelativeTime(time)).toBe('5 days ago');
  });
});
```

---

## 5. INTEGRATION TESTING STRATEGY

### What to Test
- API route handlers (POST /api/auth/login, GET /api/manga/:id)
- Database operations (create, read, update, delete)
- Authentication flows (login, logout, token refresh)
- User actions (bookmark, like, rate)

### File Structure
```
tests/
├── api/
│   ├── auth.test.ts               ← Auth API tests
│   ├── manga.test.ts              ← Manga CRUD tests
│   └── user.test.ts               ← User action tests
├── fixtures/
│   ├── users.json                 ← Test user data
│   ├── manga.json                 ← Test manga data
│   └── seed.ts                    ← Database seeding
└── utils/
    └── testHelpers.ts             ← Common test utilities
```

### Setup: Test Database

**File: `tests/fixtures/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTestDatabase() {
  // Clear existing data
  await prisma.bookmark.deleteMany({});
  await prisma.like.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.chapter.deleteMany({});
  await prisma.manga.deleteMany({});

  // Seed test data
  const testUser = await prisma.user.create({
    data: {
      id: 'test-user-1',
      email: 'test@example.com',
      username: 'testuser',
      passwordHash: 'hashed_password',
      role: 'USER',
    },
  });

  const testManga = await prisma.manga.create({
    data: {
      id: 'manga-1',
      title: 'Attack on Titan',
      description: 'A story of survival',
      coverUrl: '/covers/aot.jpg',
      status: 'ONGOING',
      rating: 9.2,
      chapters: {
        create: [
          { number: 1, title: 'The Fall of Shiganshina' },
          { number: 2, title: 'The End of the World' },
        ],
      },
    },
  });

  return { testUser, testManga };
}

export { seedTestDatabase };
```

### Setup: Test Helpers

**File: `tests/utils/testHelpers.ts`**

```typescript
import request from 'supertest';
// NOTE: Next.js 15 App Router uses Route Handlers, not Express-style app.
// Integration tests should use Next.js test server or MSW (Mock Service Worker)
// to intercept /api/v1/* requests. Example using MSW:
// import { server } from '@/tests/mocks/server';
// beforeAll(() => server.listen());
// afterEach(() => server.resetHandlers());
// afterAll(() => server.close());

export class TestClient {
  private token: string | null = null;
  private baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  async authenticate(email = 'test@example.com', password = 'password') {
    const response = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    this.token = data.data?.accessToken ?? null;
    return { body: data, status: response.status };
  }

  async get(path: string) {
    return fetch(`${this.baseUrl}${path}`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
  }

  async post(path: string, data?: unknown) {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }
    return req;
  }

  put(path: string, data?: any) {
    const req = request(app).put(path).send(data);
    if (this.token) req.set('Authorization', `Bearer ${this.token}`);
    return req;
  }

  delete(path: string) {
    const req = request(app).delete(path);
    if (this.token) req.set('Authorization', `Bearer ${this.token}`);
    return req;
  }
}

export const createTestClient = () => new TestClient();
```

### Example: Auth API Test

**File: `tests/api/auth.test.ts`**

```typescript
import { seedTestDatabase } from '../fixtures/seed';
import { createTestClient } from '../utils/testHelpers';

describe('POST /api/auth/login', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    await seedTestDatabase();
    client = createTestClient();
  });

  it('should return 401 with invalid credentials', async () => {
    const response = await client.post('/api/auth/login', {
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  it('should return token with valid credentials', async () => {
    const response = await client.post('/api/auth/login', {
      email: 'test@example.com',
      password: 'password',
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body.token).toMatch(/^eyJ/); // JWT format
    expect(response.body.user.email).toBe('test@example.com');
  });

  it('should set secure httpOnly cookie', async () => {
    const response = await client.post('/api/auth/login', {
      email: 'test@example.com',
      password: 'password',
    });

    expect(response.headers['set-cookie']).toBeDefined();
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
  });
});

describe('POST /api/auth/logout', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    await seedTestDatabase();
    client = createTestClient();
  });

  it('should clear auth cookie and return success', async () => {
    await client.authenticate();

    const response = await client.post('/api/auth/logout', {});

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toBeDefined();
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('Max-Age=0');
  });
});
```

### Example: Manga API Test

**File: `tests/api/manga.test.ts`**

```typescript
import { seedTestDatabase } from '../fixtures/seed';
import { createTestClient } from '../utils/testHelpers';

describe('GET /api/manga/:id', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    await seedTestDatabase();
    client = createTestClient();
  });

  it('should return manga with all details', async () => {
    const response = await client.get('/api/manga/manga-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'manga-1',
      title: 'Attack on Titan',
      description: 'A story of survival',
      coverUrl: '/covers/aot.jpg',
      status: 'ONGOING',
      rating: 9.2,
      chapters: expect.arrayContaining([
        expect.objectContaining({
          number: 1,
          title: 'The Fall of Shiganshina',
        }),
      ]),
    });
  });

  it('should return 404 for non-existent manga', async () => {
    const response = await client.get('/api/manga/non-existent');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Manga not found');
  });
});

describe('POST /api/manga/:id/bookmark', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    await seedTestDatabase();
    client = createTestClient();
    await client.authenticate();
  });

  it('should add bookmark for authenticated user', async () => {
    const response = await client.post('/api/manga/manga-1/bookmark', {
      chapterId: 'chapter-1',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      bookmarked: true,
      chapterId: 'chapter-1',
    });
  });

  it('should return 401 for unauthenticated user', async () => {
    const unauthClient = createTestClient();
    const response = await unauthClient.post('/api/manga/manga-1/bookmark', {
      chapterId: 'chapter-1',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('authentication');
  });
});
```

---

## 6. E2E TESTING STRATEGY

### What to Test
- Critical user journeys (login → search → read → bookmark)
- Cross-browser compatibility (Chrome, Firefox, Safari)
- Mobile responsiveness (iPhone, iPad, Android)
- Performance on slow networks (4G)
- Keyboard navigation and accessibility

### Setup: playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['github'],
  ],
  use: {
    baseURL: process.env.E2E_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### File Structure
```
tests/e2e/
├── critical-flows/
│   ├── auth.spec.ts              ← Login/logout flows
│   ├── manga-reading.spec.ts     ← Read, bookmark, search
│   ├── user-profile.spec.ts      ← Profile, settings
│   └── admin-dashboard.spec.ts   ← Admin functions
├── accessibility/
│   ├── keyboard-nav.spec.ts      ← Tab navigation
│   └── screen-reader.spec.ts     ← a11y testing
└── responsive/
    ├── mobile.spec.ts             ← Mobile flows
    └── tablet.spec.ts             ← Tablet flows
```

### Example: Auth E2E Test

**File: `tests/e2e/critical-flows/auth.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('user can sign up, log in, and access dashboard', async ({ page }) => {
    // Navigate to signup
    await page.goto('/');
    await page.getByRole('link', { name: /sign up/i }).click();
    await expect(page).toHaveURL('/auth/signup');

    // Fill signup form
    await page.getByLabel(/email/i).fill('newuser@example.com');
    await page.getByLabel(/username/i).fill('newuser');
    await page.getByLabel(/^password$/i).fill('SecurePass123!');
    await page.getByLabel(/confirm password/i).fill('SecurePass123!');

    // Submit and verify redirect
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible();
  });

  test('user can log in with valid credentials', async ({ page }) => {
    await page.goto('/auth/login');

    // Fill form
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('password');

    // Submit
    await page.getByRole('button', { name: /log in/i }).click();

    // Verify redirect to dashboard
    await expect(page).toHaveURL('/');
    await expect(page.getByText(/your reading list/i)).toBeVisible();
  });

  test('user sees error with invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /log in/i }).click();

    // Error message visible
    await expect(page.getByRole('alert')).toContainText(/invalid credentials/i);
  });

  test('user can log out', async ({ page, context }) => {
    // Pre-login by setting auth cookie
    await context.addCookies([
      {
        name: 'token',
        value: 'valid-jwt-token',
        url: 'http://localhost:3000',
      },
    ]);

    await page.goto('/');
    await page.getByRole('button', { name: /profile/i }).click();
    await page.getByRole('menuitem', { name: /log out/i }).click();

    // Should redirect to login
    await expect(page).toHaveURL('/auth/login');
  });
});
```

### Example: Manga Reading E2E Test

**File: `tests/e2e/critical-flows/manga-reading.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Manga Reading Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Pre-authenticate
    await context.addCookies([
      {
        name: 'token',
        value: 'valid-jwt-token',
        url: 'http://localhost:3000',
      },
    ]);
  });

  test('user can search and view manga', async ({ page }) => {
    await page.goto('/');

    // Use search
    await page.getByPlaceholder(/search manga/i).fill('Attack');
    await page.getByRole('button', { name: /search/i }).click();

    // Results appear
    await expect(page.getByText(/attack on titan/i)).toBeVisible();
    await page.getByText(/attack on titan/i).click();

    // Manga detail page loads
    await expect(page).toHaveURL(/\/manga\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /attack on titan/i })).toBeVisible();
  });

  test('user can read chapter and navigate pages', async ({ page }) => {
    await page.goto('/manga/manga-1/chapter/chapter-1');

    // Reader loads
    await expect(page.getByAltText(/page 1/i)).toBeVisible();

    // Navigate to next page
    await page.getByRole('button', { name: /next page/i }).click();
    await expect(page.getByAltText(/page 2/i)).toBeVisible();

    // Go back
    await page.getByRole('button', { name: /previous page/i }).click();
    await expect(page.getByAltText(/page 1/i)).toBeVisible();
  });

  test('user can bookmark chapter', async ({ page }) => {
    await page.goto('/manga/manga-1/chapter/chapter-1');

    // Click bookmark button
    const bookmarkBtn = page.getByRole('button', { name: /bookmark/i });
    await bookmarkBtn.click();

    // Loading state appears then success
    await expect(page.getByTestId('bookmark-spinner')).toBeVisible();
    await expect(bookmarkBtn).toContainText(/bookmarked/i);
  });

  test('user can like manga', async ({ page }) => {
    await page.goto('/manga/manga-1');

    const likeBtn = page.getByRole('button', { name: /like/i });
    const initialCount = await page.getByTestId('like-count').textContent();

    await likeBtn.click();
    await expect(page.getByTestId('like-count')).toContainText(String(parseInt(initialCount) + 1));
  });
});
```

### Example: Mobile Responsiveness E2E Test

**File: `tests/e2e/responsive/mobile.spec.ts`**

```typescript
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 12'] });

test.describe('Mobile Responsiveness', () => {
  test('manga reader works on mobile with touch controls', async ({ page }) => {
    await page.goto('/manga/manga-1/chapter/chapter-1');

    // Reader loads full screen
    const reader = page.getByTestId('manga-reader');
    const box = await reader.boundingBox();
    
    // Takes full viewport width
    expect(box.width).toBeCloseTo(page.viewportSize().width, { absolute: 5 });

    // Bottom nav visible for page navigation
    await expect(page.getByTestId('reader-controls')).toBeVisible();
  });

  test('bottom nav appears on tap', async ({ page }) => {
    await page.goto('/manga/manga-1/chapter/chapter-1');

    const controls = page.getByTestId('reader-controls');
    
    // Initially hidden
    await expect(controls).not.toBeVisible();

    // Tap to show
    await page.tap('text=/page 1/');
    await expect(controls).toBeVisible();

    // Auto-hide after 3 seconds
    await page.waitForTimeout(3500);
    await expect(controls).not.toBeVisible();
  });

  test('search dropdown closes on mobile after selection', async ({ page }) => {
    await page.goto('/');

    await page.getByPlaceholder(/search/i).fill('Attack');
    await page.getByText(/attack on titan/i).click();

    await expect(page).toHaveURL(/\/manga\/[^/]+$/);
  });
});
```

---

## 7. PERFORMANCE TESTING

### Core Web Vitals Targets

| Metric | Target | Tool |
|--------|--------|------|
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse, Web Vitals |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse, Web Vitals |
| FID (First Input Delay) | < 100ms | Web Vitals (deprecated → INP) |
| INP (Interaction to Next Paint) | < 200ms | Web Vitals |
| TTFB (Time to First Byte) | < 600ms | Lighthouse |
| FCP (First Contentful Paint) | < 1.8s | Lighthouse |

### Setup: Lighthouse CI

**File: `.github/workflows/lighthouse.yml`**

```yaml
name: Lighthouse CI

on: [push, pull_request]

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
      
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          configPath: './lighthouserc.json'
          uploadArtifacts: true
          temporaryPublicStorage: true
```

**File: `lighthouserc.json`**

```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 3,
      "url": ["http://localhost:3000", "http://localhost:3000/manga/manga-1"],
      "settings": {
        "chromeFlags": "--no-sandbox --disable-gpu",
        "skipAudits": ["metrics"]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "cumululative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "first-input-delay": ["error", { "maxNumericValue": 100 }],
        "speed-index": ["error", { "maxNumericValue": 3500 }]
      }
    }
  }
}
```

### Web Vitals Monitoring

**File: `src/lib/analytics.ts`**

```typescript
import { getCLS, getFCP, getFID, getLCP, getTTFB } from 'web-vitals';

export function setupWebVitals() {
  getCLS(reportMetric);
  getFCP(reportMetric);
  getFID(reportMetric);
  getLCP(reportMetric);
  getTTFB(reportMetric);
}

function reportMetric(metric: any) {
  if (process.env.NODE_ENV === 'production') {
    // Send to analytics service
    fetch('/api/analytics', {
      method: 'POST',
      body: JSON.stringify({
        name: metric.name,
        value: metric.value,
        id: metric.id,
        navigationType: metric.navigationType,
      }),
    });
  } else {
    console.log(`${metric.name}: ${Math.round(metric.value)}ms`);
  }
}
```

---

## 8. COVERAGE TARGETS

### By Module

```
src/
├── api/
│   ├── auth/              80% (login, logout, token refresh)
│   ├── manga/             75% (search, get, list, filter)
│   ├── user/              80% (profile, settings, history)
│   └── admin/             70% (create, edit, delete, stats)
├── components/
│   ├── Layout/            85% (navigation, responsive)
│   ├── Reader/            90% (page nav, controls, reader)
│   ├── Cards/             80% (manga cards, chapter cards)
│   └── Forms/             75% (login, signup, search)
├── hooks/
│   ├── useAuth/           90% (login state, token management)
│   ├── useMangaSearch/    85% (debounce, caching)
│   └── useLocalStorage/   95% (simple utility)
└── utils/
    ├── formatters/        95% (date, numbers)
    └── validators/        90% (email, password)
```

### Excluding from Coverage
```javascript
"!src/**/*.d.ts"           // Type definitions
"!src/**/*.stories.tsx"    // Storybook files
"!src/pages/_app.tsx"      // Framework boilerplate
"!src/pages/_document.tsx" // Framework boilerplate
"!src/config/*"            // Static config
```

---

## 9. CRITICAL USER FLOWS

### Flow 1: User Registration → Read Manga → Bookmark

```
┌─────────────────────────────────────────┐
│ 1. User clicks "Sign Up"                │
│    - Page: /auth/signup                 │
│    - Unit: Form validation              │
│    - E2E: Full signup flow              │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 2. User fills form & submits            │
│    - Integration: POST /api/auth/signup │
│    - Unit: Password hashing              │
│    - E2E: Form submission               │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 3. Redirect to dashboard                │
│    - Unit: Auth state management        │
│    - E2E: URL verification              │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 4. User searches manga                  │
│    - Unit: useMangaSearch hook          │
│    - Integration: GET /api/manga/search │
│    - E2E: Search input & results        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 5. User clicks manga & reads chapter    │
│    - Unit: useReaderState hook          │
│    - Integration: GET /api/manga/:id    │
│    - E2E: Reader navigation             │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 6. User bookmarks chapter               │
│    - Unit: useBookmark hook             │
│    - Integration: POST /api/bookmark    │
│    - E2E: Bookmark button click         │
└─────────────────────────────────────────┘
```

### Flow 2: Admin Creates Manga & Injects Ad

```
┌─────────────────────────────────────────┐
│ 1. Admin logs in                        │
│    - Unit: Auth validation              │
│    - Integration: Auth check            │
│    - E2E: Login page → dashboard        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 2. Admin navigates to manga management  │
│    - Unit: Route guard (admin-only)     │
│    - E2E: URL verification              │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 3. Admin creates new manga entry        │
│    - Integration: POST /api/admin/manga │
│    - Unit: Form validation              │
│    - E2E: Form submission               │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 4. Admin uploads cover image            │
│    - Integration: POST /api/upload      │
│    - Unit: File validation              │
│    - E2E: File input & preview          │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 5. Admin injects ad pixel code          │
│    - Integration: PUT /api/admin/settings│
│    - Unit: Ad code validation           │
│    - E2E: Code input & save             │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 6. Verify ad appears on user pages      │
│    - E2E: Load user page, check ad      │
└─────────────────────────────────────────┘
```

---

## 10. CI/CD INTEGRATION

### GitHub Actions Workflow

**File: `.github/workflows/test.yml`**

```yaml
name: Tests & Quality

on: [push, pull_request]

jobs:
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
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup database
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/manga_zone_test
      
      - name: Seed test data
        run: npm run db:seed
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/manga_zone_test
      
      - name: Lint code
        run: npm run lint
      
      - name: Type check
        run: npm run type-check
      
      - name: Unit & Integration Tests
        run: npm run test:coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/manga_zone_test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true
          flags: unittests
      
      - name: Build project
        run: npm run build
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/

  lighthouse:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npm run build
      - run: npm run lighthouse:ci
```

### npm Scripts

**File: `package.json` (test scripts)**

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand",
    "test:coverage": "jest --coverage --collectCoverageFrom='src/**/*.{ts,tsx}'",
    "test:unit": "jest --testPathPattern='.*\\.test\\.tsx?$'",
    "test:integration": "jest --testPathPattern='tests/api'",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "lighthouse:ci": "lhci autorun",
    "test:all": "npm run test:coverage && npm run test:e2e"
  }
}
```

---

## 11. TEST DATA MANAGEMENT

### Strategies

**Strategy 1: Fixtures (Static Test Data)**
```typescript
// ✅ Use for: Consistent test data, fast tests
const mockManga = {
  id: '1',
  title: 'Attack on Titan',
  rating: 9.2,
};
```

**Strategy 2: Factory Functions (Dynamic Data)**
```typescript
// ✅ Use for: Varied test data, customization
function createManga(overrides = {}) {
  return {
    id: uuid(),
    title: 'Test Manga',
    rating: 9.0,
    ...overrides,
  };
}
```

**Strategy 3: Database Seeding (Real Data)**
```typescript
// ✅ Use for: Integration & E2E tests, realistic scenarios
async function seedTestDatabase() {
  await prisma.manga.create({
    data: { title: 'Attack on Titan', ... }
  });
}
```

### Test Data Cleanup

```typescript
afterEach(async () => {
  // Clear data after each test
  await prisma.user.deleteMany({});
  await prisma.manga.deleteMany({});
});

afterAll(async () => {
  // Close database connection
  await prisma.$disconnect();
});
```

---

## 12. RUNNING TESTS

### Local Development

```bash
# Run all tests
npm run test:all

# Watch mode (auto-rerun on file changes)
npm run test:watch

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests
npm run test:e2e

# E2E with UI (interactive)
npm run test:e2e:ui

# Coverage report
npm run test:coverage

# View coverage in browser
npm run test:coverage && open coverage/lcov-report/index.html
```

### Before Commit

```bash
# Run full test suite
npm run test:coverage

# Check coverage meets thresholds
npm run test:coverage

# Run linting & type checking
npm run lint && npm run type-check

# Run E2E on critical flows
npm run test:e2e tests/e2e/critical-flows/auth.spec.ts
```

### Pre-Deployment (Staging)

```bash
# Full suite including performance
npm run test:all

# Build verification
npm run build

# Lighthouse audit
npm run lighthouse:ci

# Deploy to Vercel preview
git push origin feature-branch
```

---

## IMPLEMENTATION CHECKLIST

### Setup Phase
- [ ] Install all test dependencies (Jest, RTL, Playwright, Supertest)
- [ ] Create jest.config.js and setupTests.tsx
- [ ] Create playwright.config.ts
- [ ] Configure GitHub Actions workflow
- [ ] Set up test database with Prisma
- [ ] Create test fixtures and seed data

### Unit Tests
- [ ] Test all hooks (useAuth, useMangaSearch, etc.)
- [ ] Test utility functions (formatDate, validators)
- [ ] Test React components (MangaCard, MangaReader, etc.)
- [ ] Achieve 80% code coverage for src/hooks and src/utils
- [ ] Document component testing patterns

### Integration Tests
- [ ] Test all API routes (/api/auth/*, /api/manga/*)
- [ ] Test database operations (CRUD)
- [ ] Test error handling and edge cases
- [ ] Achieve 70% coverage for API routes
- [ ] Document API testing patterns

### E2E Tests
- [ ] Test critical user flow: signup → read → bookmark
- [ ] Test admin flow: login → create manga → inject ad
- [ ] Test mobile responsiveness
- [ ] Test keyboard navigation
- [ ] Test cross-browser compatibility
- [ ] Document E2E patterns

### Performance
- [ ] Set up Lighthouse CI
- [ ] Configure Web Vitals monitoring
- [ ] Document performance targets
- [ ] Set up performance alerts

### CI/CD
- [ ] Configure GitHub Actions workflows
- [ ] Set up code coverage tracking (Codecov)
- [ ] Enable branch protection rules
- [ ] Configure deployment gates

---

## SUMMARY

This testing strategy provides:

✅ **Quality Assurance**: 82% coverage catches bugs early  
✅ **Developer Confidence**: Fast feedback loop (<10s tests)  
✅ **Performance Monitoring**: Core Web Vitals tracked  
✅ **User-Centric Testing**: E2E tests validate real workflows  
✅ **Maintainability**: Clear patterns for future tests  
✅ **Automation**: CI/CD ensures quality at every commit  

**Investment**: 8-10 hours to set up (recovers value within first 2-3 weeks)  
**Benefit**: 50-80% fewer production bugs, faster feature delivery

---

**Next File:** API_DOCUMENTATION.md (Developer File #2)
