# API_DOCUMENTATION.md
## Tier-1 Developer Specification: Complete API Reference

**Document ID:** TIER1-DEV-002  
**Created:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ COMPLETE  
**Priority:** CRITICAL (Phase 1 - Foundation)

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [API Overview](#api-overview)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Error Handling](#error-handling)
6. [Authentication Endpoints](#authentication-endpoints)
7. [Manga Endpoints](#manga-endpoints)
8. [Chapter Endpoints](#chapter-endpoints)
9. [User Endpoints](#user-endpoints)
10. [Bookmark Endpoints](#bookmark-endpoints)
11. [Like Endpoints](#like-endpoints)
12. [Admin Endpoints](#admin-endpoints)
13. [Ad Management Endpoints](#ad-management-endpoints)
14. [Analytics Endpoints](#analytics-endpoints)
15. [OpenAPI Specification](#openapi-specification)

---

## 1. EXECUTIVE SUMMARY

### API Architecture
- **Base URL:** `https://mangazone.id/api` (production), `http://localhost:3000/api` (development)
- **API Version:** `v1`
- **Protocol:** REST/HTTPS
- **Response Format:** JSON
- **Versioning Strategy:** URL-based (`/api/v1`, `/api/v2`) with 12-month deprecation window

### Statistics
- **Total Endpoints:** 42
- **Auth Required:** 28 (67%)
- **Admin Only:** 8 (19%)
- **Public:** 6 (14%)
- **Response Times Target:** <200ms p95
- **Uptime SLA:** 99.9%

### Key Features
- JWT-based authentication with refresh tokens
- Role-based access control (USER, ADMIN)
- Comprehensive error handling with error codes
- Rate limiting: 1000 req/hour per user
- Request/response validation with Zod
- Automatic request logging and monitoring

---

## 2. API OVERVIEW

### Base Structure
```
https://mangazone.id/api/v1/endpoint-path
                     ↑         ↑
                  version    resource
```

### Response Format (Success)
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "manga-1",
    "title": "Attack on Titan",
    ...
  },
  "meta": {
    "timestamp": "2026-05-15T05:28:19.802Z",
    "requestId": "req-12345"
  }
}
```

### Response Format (Error)
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
        "message": "String must contain at least 1 character(s)"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-05-15T05:28:19.802Z",
    "requestId": "req-12345"
  }
}
```

### Common Headers

| Header | Required | Example | Purpose |
|--------|----------|---------|---------|
| `Content-Type` | Yes | `application/json` | Request format |
| `Authorization` | Conditional | `Bearer eyJhbGci...` | JWT token |
| `X-Request-ID` | No | `req-abc123` | Correlation ID for logging |
| `X-API-Version` | No | `v1` | Explicit API version |

---

## 3. AUTHENTICATION

### JWT Structure
```
Header: {
  "alg": "HS256",
  "typ": "JWT"
}

Payload: {
  "sub": "user-123",
  "email": "user@example.com",
  "role": "USER",
  "iat": 1715768899,
  "exp": 1715855299    // 24 hours
}

Signature: HMACSHA256(header + payload, SECRET_KEY)
```

### Token Usage
```bash
curl -H "Authorization: Bearer eyJhbGci..." \
  https://mangazone.id/api/v1/user/me
```

### Refresh Token Flow
```
┌──────────────┐
│ User login   │
└──────────────┘
        ↓
┌──────────────────────────────────────┐
│ Return: accessToken (24h) +          │
│         refreshToken (7d) in httpOnly│
│         cookie                       │
└──────────────────────────────────────┘
        ↓
┌──────────────────────────────────────┐
│ Client uses accessToken for requests │
└──────────────────────────────────────┘
        ↓
│ Token expires in 24h
        ↓
┌──────────────────────────────────────┐
│ Client calls POST /auth/refresh      │
│ (refreshToken sent via cookie)       │
└──────────────────────────────────────┘
        ↓
┌──────────────────────────────────────┐
│ Return new accessToken (24h)         │
└──────────────────────────────────────┘
```

### Token Validation
```typescript
// At API route start
const token = request.headers.authorization?.replace('Bearer ', '');

// Verify JWT
const decoded = jwt.verify(token, process.env.JWT_SECRET);

// Check expiration
if (decoded.exp * 1000 < Date.now()) {
  throw new UnauthorizedError('Token expired');
}

// Attach to request
request.user = decoded;
```

---

## 4. RATE LIMITING

### Limits by Role

| Role | Requests/Hour | Burst | Applies To |
|------|---------------|-------|-----------|
| Public | 100 | 10 | Search, list endpoints |
| USER | 1000 | 100 | All endpoints |
| ADMIN | 5000 | 500 | All endpoints |

### Rate Limit Headers
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1715772519
```

### Rate Limit Exceeded Response
```json
{
  "status": "error",
  "code": 429,
  "error": {
    "type": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 3600
  }
}
```

### Implementation
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => {
    if (req.user?.role === 'ADMIN') return 5000;
    if (req.user?.role === 'USER') return 1000;
    return 100; // Public
  },
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});

app.use('/api/v1', limiter);
```

---

## 5. ERROR HANDLING

### Error Code Reference

| Code | HTTP | Type | Meaning |
|------|------|------|---------|
| 400 | 400 | `VALIDATION_ERROR` | Invalid request data |
| 401 | 401 | `UNAUTHORIZED` | Missing/invalid auth token |
| 403 | 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | 404 | `NOT_FOUND` | Resource not found |
| 409 | 409 | `CONFLICT` | Resource already exists |
| 429 | 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | 500 | `INTERNAL_ERROR` | Server error |
| 503 | 503 | `SERVICE_UNAVAILABLE` | Temporary outage |

### Error Response Format
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
        "message": "Invalid email format"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-05-15T05:28:19.802Z",
    "requestId": "req-abc123"
  }
}
```

### Common Errors

**Expired Token**
```json
{
  "status": "error",
  "code": 401,
  "error": {
    "type": "UNAUTHORIZED",
    "message": "Token has expired",
    "retryAfter": 3600
  }
}
```

**Insufficient Permissions**
```json
{
  "status": "error",
  "code": 403,
  "error": {
    "type": "FORBIDDEN",
    "message": "Only admins can access this endpoint"
  }
}
```

**Resource Not Found**
```json
{
  "status": "error",
  "code": 404,
  "error": {
    "type": "NOT_FOUND",
    "message": "Manga not found",
    "resourceId": "manga-999",
    "resourceType": "Manga"
  }
}
```

---

## 6. AUTHENTICATION ENDPOINTS

### POST /auth/signup
Create new user account

**Request**
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!"
}
```

**Validation Rules**
- Email: Valid RFC 5322 format, unique in database
- Username: 3-20 characters, alphanumeric + underscore, unique
- Password: Min 8 chars, uppercase, lowercase, number, special char

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "id": "user-123",
    "email": "user@example.com",
    "username": "username",
    "role": "USER",
    "createdAt": "2026-05-15T05:28:19.802Z"
  },
  "meta": {
    "timestamp": "2026-05-15T05:28:19.802Z",
    "requestId": "req-123"
  }
}
```

**Cookies Set**
```
Set-Cookie: refreshToken=eyJhbGci...; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
Set-Cookie: accessToken=eyJhbGci...; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
```

**Errors**
- 400: Email already registered
- 400: Username already taken
- 400: Validation failed (password requirements)

---

### POST /auth/login
Authenticate user and return tokens

**Request**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "rememberMe": false
}
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "username": "username",
      "role": "USER",
      "avatar": "https://..."
    },
    "accessToken": "eyJhbGci...",
    "refreshTokenExpiry": 1716373299
  }
}
```

**Errors**
- 401: Invalid credentials
- 400: Account not verified (optional email verification)
- 429: Too many failed login attempts (lock account 30 min)

---

### POST /auth/logout
Clear authentication tokens

**Request**
```bash
Authorization: Bearer eyJhbGci...
Content-Length: 0
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Logged out successfully"
  }
}
```

**Cookies Cleared**
```
Set-Cookie: refreshToken=; Max-Age=0
Set-Cookie: accessToken=; Max-Age=0
```

**Errors**
- 401: Not authenticated

---

### POST /auth/refresh
Refresh expired access token

**Request**
```bash
Authorization: Bearer <expired-access-token>
Content-Length: 0
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshTokenExpiry": 1716373299
  }
}
```

**Errors**
- 401: Invalid or expired refresh token
- 401: Token blacklisted (user logged out from all devices)

---

### POST /auth/forgot-password
Request password reset email

**Request**
```json
{
  "email": "user@example.com"
}
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Password reset email sent",
    "expiresIn": 3600
  }
}
```

**Note:** Intentionally same response for security (doesn't reveal if email exists)

**Errors**
- 429: Too many requests (max 5 per hour)

---

### POST /auth/reset-password
Reset password with token from email

**Request**
```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePass123!",
  "confirmPassword": "NewSecurePass123!"
}
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Password reset successfully"
  }
}
```

**Errors**
- 400: Invalid or expired token
- 400: Password validation failed

---

## 7. MANGA ENDPOINTS

### GET /manga
List all manga with pagination and filters

**Query Parameters**
```
?page=1
&limit=20
&sort=newest|trending|rating
&status=ONGOING|COMPLETED|HIATUS
&genre=action,romance
&search=attack
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "id": "manga-1",
      "title": "Attack on Titan",
      "slug": "attack-on-titan",
      "description": "A story of survival...",
      "coverUrl": "https://...",
      "status": "COMPLETED",
      "rating": 9.2,
      "ratingCount": 50000,
      "views": 5000000,
      "chapterCount": 139,
      "latestChapterNumber": 139,
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-05-15T00:00:00Z"
    }
  ],
  "meta": {
    "timestamp": "2026-05-15T05:28:19.802Z",
    "requestId": "req-123",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 500,
      "pages": 25
    }
  }
}
```

**Filters Applied**
- Mobile: 10 items per page, newest first
- Desktop: 20 items per page, trending first

**Errors**
- 400: Invalid query parameters

---

### GET /manga/:id
Get single manga details

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "manga-1",
    "title": "Attack on Titan",
    "slug": "attack-on-titan",
    "description": "A story of survival...",
    "coverUrl": "https://...",
    "bannerUrl": "https://...",
    "status": "COMPLETED",
    "rating": 9.2,
    "ratingCount": 50000,
    "views": 5000000,
    "lastRead": {
      "chapterNumber": 50,
      "percentage": 75,
      "timestamp": "2026-05-14T10:30:00Z"
    },
    "isBookmarked": true,
    "isLiked": true,
    "chapters": [
      {
        "id": "chapter-1",
        "number": 1,
        "title": "The Fall of Shiganshina",
        "releaseDate": "2026-05-01T00:00:00Z",
        "views": 100000,
        "rating": 9.5
      }
    ],
    "relatedManga": [
      {
        "id": "manga-2",
        "title": "Jujutsu Kaisen",
        "coverUrl": "https://..."
      }
    ]
  }
}
```

**Auth Required:** No (but user-specific data returned if authenticated)

**Errors**
- 404: Manga not found

---

### GET /manga/search
Search manga by title, author, or description

**Query Parameters**
```
?q=attack
&type=manga|author|character
&limit=20
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "id": "manga-1",
      "title": "Attack on Titan",
      "coverUrl": "https://...",
      "rating": 9.2
    }
  ],
  "meta": {
    "query": "attack",
    "resultCount": 5,
    "searchTime": "45ms"
  }
}
```

**Implementation**
- Elasticsearch for full-text search
- Debounce: 300ms on client
- Results cached for 1 hour

**Errors**
- 400: Query too short (min 2 chars)
- 400: Query too long (max 100 chars)

---

## 8. CHAPTER ENDPOINTS

### GET /manga/:mangaId/chapters
List chapters for manga

**Query Parameters**
```
?page=1
&limit=20
&sort=newest|oldest
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "id": "chapter-1",
      "number": 1,
      "title": "The Fall of Shiganshina",
      "releaseDate": "2026-05-01T00:00:00Z",
      "views": 100000,
      "rating": 9.5,
      "pageCount": 40,
      "isRead": true,
      "readPercentage": 100,
      "lastReadAt": "2026-05-14T10:30:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 139,
      "pages": 7
    }
  }
}
```

**Auth Required:** No (isRead only shown if authenticated)

**Errors**
- 404: Manga not found

---

### GET /manga/:mangaId/chapters/:chapterId
Get chapter pages

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "chapter-1",
    "number": 1,
    "title": "The Fall of Shiganshina",
    "mangaId": "manga-1",
    "mangaTitle": "Attack on Titan",
    "pageCount": 40,
    "pages": [
      {
        "number": 1,
        "imageUrl": "https://..../chapter-1/page-1.webp",
        "width": 1080,
        "height": 1440
      }
    ],
    "navigation": {
      "prevChapter": {
        "id": "chapter-0",
        "number": 0,
        "title": "Prologue"
      },
      "nextChapter": {
        "id": "chapter-2",
        "number": 2,
        "title": "The End of the World"
      }
    }
  }
}
```

**Optimization**
- Images served from CDN with WebP format
- Responsive image sizing (mobile: 540px, desktop: 1080px)
- Image compression: <200KB per page

**Errors**
- 404: Chapter not found

---

## 9. USER ENDPOINTS

### GET /user/me
Get authenticated user profile

**Auth Required:** Yes

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "user-123",
    "email": "user@example.com",
    "username": "username",
    "avatar": "https://...",
    "bio": "Manga enthusiast",
    "role": "USER",
    "joinedAt": "2026-01-01T00:00:00Z",
    "preferences": {
      "theme": "dark",
      "language": "id",
      "nsfw": false,
      "notifications": true
    }
  }
}
```

**Errors**
- 401: Not authenticated

---

### GET /user/history
Get user's reading history

**Auth Required:** Yes

**Query Parameters**
```
?limit=20
&page=1
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "mangaId": "manga-1",
      "mangaTitle": "Attack on Titan",
      "coverUrl": "https://...",
      "chapterId": "chapter-50",
      "chapterNumber": 50,
      "chapterTitle": "...",
      "readPercentage": 75,
      "lastReadAt": "2026-05-14T10:30:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100
    }
  }
}
```

**Errors**
- 401: Not authenticated

---

### PUT /user/profile
Update user profile

**Auth Required:** Yes

**Request**
```json
{
  "username": "newusername",
  "avatar": "data:image/png;base64,...",
  "bio": "Updated bio"
}
```

**Validation**
- Username: 3-20 chars, unique (excluding current user)
- Avatar: Max 5MB, PNG/JPG/WebP
- Bio: Max 500 chars

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "user-123",
    "username": "newusername",
    "avatar": "https://...",
    "bio": "Updated bio"
  }
}
```

**Errors**
- 400: Username already taken
- 400: Invalid image format
- 413: Avatar file too large

---

### PUT /user/preferences
Update user preferences

**Auth Required:** Yes

**Request**
```json
{
  "theme": "dark",
  "language": "id",
  "nsfw": false,
  "notifications": true,
  "emailNotifications": true
}
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "preferences": {
      "theme": "dark",
      "language": "id",
      "nsfw": false,
      "notifications": true,
      "emailNotifications": true
    }
  }
}
```

---

### DELETE /user/account
Delete user account permanently

**Auth Required:** Yes

**Request Body (Required Confirmation)**
```json
{
  "password": "currentPassword",
  "confirmDelete": "DELETE"
}
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Account deleted successfully",
    "dataRetention": "All data will be permanently deleted within 30 days"
  }
}
```

**Actions on Delete**
- Anonymize user profile
- Archive reading history
- Delete personal data after 30 days (GDPR compliance)
- All bookmarks/likes transferred to anonymous account

**Errors**
- 400: Wrong password
- 400: Confirmation not provided

---

## 10. BOOKMARK ENDPOINTS

### POST /manga/:mangaId/bookmark
Add chapter to bookmarks

**Auth Required:** Yes

**Request**
```json
{
  "chapterId": "chapter-50",
  "chapterNumber": 50
}
```

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "id": "bookmark-123",
    "mangaId": "manga-1",
    "chapterId": "chapter-50",
    "chapterNumber": 50,
    "createdAt": "2026-05-15T05:28:19.802Z"
  }
}
```

**Errors**
- 401: Not authenticated
- 404: Manga not found
- 409: Already bookmarked

---

### DELETE /manga/:mangaId/bookmark
Remove chapter from bookmarks

**Auth Required:** Yes

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Bookmark removed"
  }
}
```

**Errors**
- 401: Not authenticated
- 404: Bookmark not found

---

### GET /bookmarks
Get user's bookmarks

**Auth Required:** Yes

**Query Parameters**
```
?page=1
&limit=20
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "id": "bookmark-123",
      "manga": {
        "id": "manga-1",
        "title": "Attack on Titan",
        "coverUrl": "https://..."
      },
      "chapter": {
        "id": "chapter-50",
        "number": 50,
        "title": "..."
      },
      "bookmarkedAt": "2026-05-15T05:28:19.802Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50
    }
  }
}
```

---

## 11. LIKE ENDPOINTS

### POST /manga/:mangaId/like
Like manga

**Auth Required:** Yes

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "id": "like-123",
    "mangaId": "manga-1",
    "userId": "user-123",
    "createdAt": "2026-05-15T05:28:19.802Z"
  }
}
```

**Errors**
- 401: Not authenticated
- 404: Manga not found
- 409: Already liked

---

### DELETE /manga/:mangaId/like
Remove like

**Auth Required:** Yes

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Like removed"
  }
}
```

---

### GET /likes
Get user's liked manga

**Auth Required:** Yes

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "id": "manga-1",
      "title": "Attack on Titan",
      "coverUrl": "https://...",
      "rating": 9.2,
      "likedAt": "2026-05-15T05:28:19.802Z"
    }
  ]
}
```

---

## 12. ADMIN ENDPOINTS

### POST /admin/manga
Create new manga

**Auth Required:** Yes (ADMIN only)

**Request**
```json
{
  "title": "New Manga",
  "description": "Description",
  "cover": "data:image/png;base64,...",
  "status": "ONGOING",
  "genres": ["action", "adventure"],
  "authors": ["Author Name"]
}
```

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "id": "manga-new",
    "title": "New Manga",
    "slug": "new-manga"
  }
}
```

**Errors**
- 403: Not admin
- 400: Title already exists

---

### PUT /admin/manga/:mangaId
Update manga details

**Auth Required:** Yes (ADMIN only)

**Request**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "status": "COMPLETED",
  "cover": "data:image/png;base64,..."
}
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "manga-1",
    "title": "Updated Title"
  }
}
```

---

### DELETE /admin/manga/:mangaId
Delete manga

**Auth Required:** Yes (ADMIN only)

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Manga deleted"
  }
}
```

**Cascade Delete:** Chapters, bookmarks, likes also deleted

---

### POST /admin/manga/:mangaId/chapter
Create new chapter

**Auth Required:** Yes (ADMIN only)

**Request**
```json
{
  "number": 1,
  "title": "Chapter Title",
  "pages": [
    {
      "number": 1,
      "image": "data:image/png;base64,..."
    }
  ]
}
```

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "id": "chapter-1",
    "number": 1,
    "title": "Chapter Title",
    "pageCount": 40
  }
}
```

---

### DELETE /admin/manga/:mangaId/chapter/:chapterId
Delete chapter

**Auth Required:** Yes (ADMIN only)

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Chapter deleted"
  }
}
```

---

### GET /admin/stats
Get admin dashboard statistics

**Auth Required:** Yes (ADMIN only)

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "totals": {
      "users": 5000,
      "manga": 500,
      "chapters": 10000,
      "views": 1000000
    },
    "trends": {
      "newUsersThisWeek": 150,
      "newMangaThisMonth": 25,
      "totalViewsThisMonth": 500000
    },
    "topManga": [
      {
        "id": "manga-1",
        "title": "Attack on Titan",
        "views": 500000
      }
    ]
  }
}
```

---

## 13. AD MANAGEMENT ENDPOINTS

### GET /admin/ads
Get all ad configurations

**Auth Required:** Yes (ADMIN only)

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "id": "ad-1",
      "name": "Home Banner",
      "type": "banner",
      "placement": "home_top",
      "pixelCode": "<script>...</script>",
      "isActive": true,
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ]
}
```

---

### POST /admin/ads
Create new ad configuration

**Auth Required:** Yes (ADMIN only)

**Request**
```json
{
  "name": "Home Banner",
  "type": "banner|pixel|custom",
  "placement": "home_top|home_bottom|reader_top|reader_bottom|sidebar",
  "pixelCode": "<script>...</script>",
  "htmlContent": "<div>...</div>",
  "isActive": true
}
```

**Placement Options**
- `home_top`: Top of home page
- `home_bottom`: Bottom of home page
- `reader_top`: Above manga reader
- `reader_bottom`: Below manga reader
- `sidebar`: Right sidebar (desktop only)
- `search_results`: In search results

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "id": "ad-1",
    "name": "Home Banner"
  }
}
```

**Validation**
- Pixel code sanitization (prevent XSS)
- HTML sanitization (whitelist safe tags)
- Max 10KB per ad

---

### PUT /admin/ads/:adId
Update ad configuration

**Auth Required:** Yes (ADMIN only)

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "ad-1",
    "name": "Updated Name"
  }
}
```

---

### DELETE /admin/ads/:adId
Delete ad configuration

**Auth Required:** Yes (ADMIN only)

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "message": "Ad deleted"
  }
}
```

---

### GET /ads/active
Get active ads for current page (PUBLIC)

**Query Parameters**
```
?placements=home_top,reader_bottom
&device=mobile|tablet|desktop
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "home_top": {
      "id": "ad-1",
      "type": "banner",
      "htmlContent": "<div>...</div>",
      "pixelCode": "<script>...</script>"
    },
    "reader_bottom": {
      "id": "ad-2",
      "type": "pixel",
      "pixelCode": "<script>...</script>"
    }
  }
}
```

---

## 14. ANALYTICS ENDPOINTS

### POST /analytics/pageview
Track page views

**Auth Required:** No

**Request**
```json
{
  "mangaId": "manga-1",
  "chapterId": "chapter-50",
  "url": "/manga/manga-1/chapter/chapter-50",
  "referrer": "https://..."
}
```

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "tracked": true
  }
}
```

---

### POST /analytics/reading
Track reading progress

**Auth Required:** Yes (but works anonymously with tracking ID)

**Request**
```json
{
  "mangaId": "manga-1",
  "chapterId": "chapter-50",
  "pageNumber": 30,
  "totalPages": 40,
  "readPercentage": 75,
  "timeSpent": 300 // seconds
}
```

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "tracked": true
  }
}
```

---

### POST /api/analytics
Track web vitals

**Auth Required:** No

**Request**
```json
{
  "name": "LCP",
  "value": 1500,
  "id": "v3-123",
  "navigationType": "navigate"
}
```

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "tracked": true
  }
}
```

---

## 15. GDPR / PRIVACY ENDPOINTS

### GET /user/data-export
Export all user data (GDPR right to portability)

**Auth Required:** Yes

**Rate Limit:** 1 request per 24 hours

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "exportId": "export-uuid",
    "downloadUrl": "https://storage.supabase.co/...",
    "expiresAt": "2025-12-31T23:59:59Z",
    "generatedAt": "2025-12-30T12:00:00Z",
    "includes": ["profile", "reading_progress", "bookmarks", "likes", "comments"]
  }
}
```

**Error (429)**
```json
{
  "status": "error",
  "code": 429,
  "error": {
    "message": "Data export already requested within last 24 hours",
    "code": "EXPORT_RATE_LIMITED",
    "nextAvailableAt": "2025-12-31T12:00:00Z"
  }
}
```

---

### DELETE /user/data
Delete all personal user data (GDPR right to erasure)

**Auth Required:** Yes

**Request**
```json
{
  "confirmEmail": "user@email.com",
  "reason": "no_longer_needed"
}
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "deleted": true,
    "deletedAt": "2025-12-30T12:00:00Z",
    "itemsDeleted": {
      "readingHistory": 45,
      "bookmarks": 12,
      "likes": 30,
      "comments": 7
    }
  }
}
```

---

### POST /user/consent
Record user consent for data processing

**Auth Required:** Yes

**Request**
```json
{
  "type": "analytics",
  "granted": true,
  "version": "1.0"
}
```

Consent types: `analytics`, `marketing`, `personalization`, `third_party_ads`

**Response (201)**
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "consentId": "consent-uuid",
    "type": "analytics",
    "granted": true,
    "recordedAt": "2025-12-30T12:00:00Z"
  }
}
```

---

### DELETE /user/consent
Withdraw user consent

**Auth Required:** Yes

**Request**
```json
{
  "type": "analytics"
}
```

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "type": "analytics",
    "withdrawn": true,
    "withdrawnAt": "2025-12-30T12:00:00Z"
  }
}
```

---

## 16. UTILITY ENDPOINTS

### GET /health
Health check for uptime monitoring and load balancers

**Auth Required:** No

**Response (200)**
```json
{
  "status": "ok",
  "timestamp": "2025-12-30T12:00:00Z",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "storage": "ok",
    "auth": "ok"
  },
  "uptime": 86400
}
```

**Response (503 — degraded)**
```json
{
  "status": "degraded",
  "timestamp": "2025-12-30T12:00:00Z",
  "services": {
    "database": "ok",
    "storage": "error",
    "auth": "ok"
  }
}
```

---

### PUT /user/avatar
Upload / replace user profile avatar image

**Auth Required:** Yes

**Content-Type:** `multipart/form-data`

**Request**
```
avatar: <File> (JPEG/PNG/WebP, max 2MB, min 100×100px)
```

**Validation Rules:**
- Accepted types: `image/jpeg`, `image/png`, `image/webp`
- Max size: 2 MB
- Min dimensions: 100×100px
- Auto-resized to 200×200px on server

**Response (200)**
```json
{
  "status": "success",
  "code": 200,
  "data": {
    "avatarUrl": "https://cdn.mangazone.id/avatars/user-uuid.webp",
    "updatedAt": "2025-12-30T12:00:00Z"
  }
}
```

**Error (422)**
```json
{
  "status": "error",
  "code": 422,
  "error": {
    "message": "File exceeds maximum size of 2MB",
    "code": "FILE_TOO_LARGE"
  }
}
```

---

## 17. OPENAPI SPECIFICATION

Complete OpenAPI 3.1 spec for use in Swagger UI, Postman, etc.

**File: `openapi.json`**

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Manga Zone API",
    "description": "Complete API for manga reading platform",
    "version": "1.0.0",
    "contact": {
      "name": "Support",
      "email": "support@mangazone.id"
    }
  },
  "servers": [
    {
      "url": "https://mangazone.id/api/v1",
      "description": "Production"
    },
    {
      "url": "http://localhost:3000/api/v1",
      "description": "Development"
    }
  ],
  "paths": {
    "/auth/signup": {
      "post": {
        "summary": "Create new user account",
        "tags": ["Authentication"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "email": { "type": "string", "format": "email" },
                  "username": { "type": "string", "minLength": 3, "maxLength": 20 },
                  "password": { "type": "string", "minLength": 8 },
                  "confirmPassword": { "type": "string" }
                },
                "required": ["email", "username", "password", "confirmPassword"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "User created successfully"
          },
          "400": {
            "description": "Validation error"
          }
        }
      }
    },
    "/manga": {
      "get": {
        "summary": "List all manga",
        "tags": ["Manga"],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": { "type": "integer", "default": 1 }
          },
          {
            "name": "limit",
            "in": "query",
            "schema": { "type": "integer", "default": 20 }
          }
        ],
        "responses": {
          "200": {
            "description": "Manga list retrieved"
          }
        }
      }
    },
    "/manga/{id}": {
      "get": {
        "summary": "Get manga details",
        "tags": ["Manga"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Manga details"
          },
          "404": {
            "description": "Manga not found"
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    },
    "schemas": {
      "Manga": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "status": { "type": "string", "enum": ["ONGOING", "COMPLETED", "HIATUS"] },
          "rating": { "type": "number" }
        }
      },
      "User": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "email": { "type": "string", "format": "email" },
          "username": { "type": "string" },
          "role": { "type": "string", "enum": ["USER", "ADMIN"] }
        }
      }
    }
  }
}
```

---

## IMPLEMENTATION CHECKLIST

### Setup Phase
- [ ] Configure Express middleware for validation (Zod)
- [ ] Setup JWT authentication middleware
- [ ] Configure rate limiting middleware
- [ ] Setup global error handler
- [ ] Configure CORS with allowed origins

### Authentication APIs (5 endpoints)
- [ ] POST /auth/signup
- [ ] POST /auth/login
- [ ] POST /auth/logout
- [ ] POST /auth/refresh
- [ ] POST /auth/forgot-password
- [ ] POST /auth/reset-password

### Manga APIs (3 endpoints)
- [ ] GET /manga
- [ ] GET /manga/:id
- [ ] GET /manga/search

### Chapter APIs (2 endpoints)
- [ ] GET /manga/:mangaId/chapters
- [ ] GET /manga/:mangaId/chapters/:chapterId

### User APIs (4 endpoints)
- [ ] GET /user/me
- [ ] GET /user/history
- [ ] PUT /user/profile
- [ ] PUT /user/preferences
- [ ] DELETE /user/account

### Bookmark APIs (3 endpoints)
- [ ] POST /manga/:mangaId/bookmark
- [ ] DELETE /manga/:mangaId/bookmark
- [ ] GET /bookmarks

### Like APIs (3 endpoints)
- [ ] POST /manga/:mangaId/like
- [ ] DELETE /manga/:mangaId/like
- [ ] GET /likes

### Admin APIs (6 endpoints)
- [ ] POST /admin/manga
- [ ] PUT /admin/manga/:mangaId
- [ ] DELETE /admin/manga/:mangaId
- [ ] POST /admin/manga/:mangaId/chapter
- [ ] DELETE /admin/manga/:mangaId/chapter/:chapterId
- [ ] GET /admin/stats

### Ad Management APIs (4 endpoints)
- [ ] GET /admin/ads
- [ ] POST /admin/ads
- [ ] PUT /admin/ads/:adId
- [ ] DELETE /admin/ads/:adId
- [ ] GET /ads/active

### Analytics APIs (3 endpoints)
- [ ] POST /analytics/pageview
- [ ] POST /analytics/reading
- [ ] POST /api/analytics (Web Vitals)

### GDPR / Privacy APIs (4 endpoints)
- [ ] GET /user/data-export
- [ ] DELETE /user/data
- [ ] POST /user/consent
- [ ] DELETE /user/consent

### Utility APIs (2 endpoints)
- [ ] GET /health
- [ ] PUT /user/avatar

### Documentation
- [ ] Generate OpenAPI JSON spec
- [ ] Setup Swagger UI at /api/docs
- [ ] Generate API docs from code
- [ ] Create Postman collection

### Testing
- [ ] Integration tests for all endpoints (from TESTING_STRATEGY.md)
- [ ] Error handling tests
- [ ] Rate limiting tests
- [ ] Auth token validation tests

---

## SUMMARY

This API specification provides:

✅ **Complete Endpoint Coverage**: 42+ endpoints documented with examples (GDPR, health, avatar added)  
✅ **Security**: JWT authentication, role-based access control, rate limiting  
✅ **Developer Experience**: Clear error handling, consistent response format  
✅ **Scalability**: Pagination, caching, CDN for images  
✅ **Monitoring**: Request tracking, analytics, Web Vitals  
✅ **No-Code Ad Injection**: Flexible ad placement system  

**Implementation Time**: 4-5 weeks for all endpoints  
**Testing Coverage**: Integration tests required (from TESTING_STRATEGY.md)

---

**Next File:** DATABASE_MIGRATIONS.md (Developer File #3)
