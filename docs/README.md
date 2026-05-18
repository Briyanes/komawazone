# 🎨 Manga Zone - Modern Manga/Manhwa Reading Platform

> A production-grade manga/manhwa reading platform built with Next.js 15+, Supabase, and Vercel. Features custom ad injection, user authentication, reading progress tracking, and comprehensive admin dashboard.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account (free tier OK)
- Vercel account (for deployment)

### Setup (5 minutes)

```bash
# Clone repository
git clone <repo-url>
cd manga-zone

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local

# Fill in your Supabase credentials
# NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-key]
# SUPABASE_SERVICE_ROLE_KEY=[your-key]

# Run development server
npm run dev

# Open http://localhost:3000
```

---

## 📋 Project Overview

**What is Manga Zone?**

A full-featured manga/manhwa reading platform where:
- 👥 Users can browse, search, and read manga
- 🔖 Users can bookmark, like, and track reading progress
- 💬 Users can comment and engage with community
- 🎨 Platform supports light/dark theme
- 📱 Mobile-first responsive design
- 📢 Admin can inject custom ads (no-code)
- 👤 User profiles with personalization
- 📊 Analytics dashboard

**Tech Stack:**
- **Frontend:** Next.js 15+, React 19+, Tailwind CSS, TypeScript
- **Backend:** Supabase (PostgreSQL, Auth, Storage)
- **Deployment:** Vercel (auto-deploy from GitHub)
- **Icons:** Lucide React
- **State:** React Query + React Context + Zustand
- **UI:** Radix UI + custom design system
- **Forms:** React Hook Form + Zod

---

## 📂 Project Structure

```
manga-zone/
├── app/                           # Next.js 15 App Router
│   ├── layout.tsx                 # Root layout with theme provider
│   ├── page.tsx                   # Homepage
│   ├── auth/                      # Auth pages (login, signup)
│   ├── manga/                     # Manga pages (list, detail, reader)
│   ├── profile/                   # User profile & settings
│   ├── admin/                     # Admin dashboard (protected)
│   └── api/                       # API routes
│
├── components/                    # React components
│   ├── layout/                    # Header, Footer, Navigation
│   ├── reader/                    # ChapterViewer, controls
│   ├── manga/                     # MangaCard, MangaGrid
│   ├── auth/                      # LoginForm, SignupForm
│   ├── profile/                   # UserProfile, settings
│   ├── ads/                       # AdRenderer, AdZone
│   └── admin/                     # Admin forms & components
│
├── config/                        # Configuration
│   ├── design-tokens.ts           # Colors, typography, spacing
│   ├── breakpoints.ts             # Responsive breakpoints
│   ├── ad-zones.ts                # Pre-defined ad zones
│   └── constants.ts               # App constants
│
├── theme/                         # Theme system
│   ├── colors.ts                  # Light/Dark color palettes
│   ├── typography.ts              # Font sizes, weights
│   └── ThemeProvider.tsx          # Context provider
│
├── lib/                           # Utilities
│   ├── supabase.ts                # Supabase client
│   ├── auth.ts                    # Auth helpers
│   ├── db.ts                      # Database queries
│   ├── ads.ts                     # Ad-related queries
│   ├── error-boundary.tsx         # Global error handling
│   └── sentry.ts                  # Error tracking
│
├── hooks/                         # Custom React hooks
│   ├── useAuth.ts                 # Auth hook
│   ├── useTheme.ts                # Theme toggle
│   ├── useReadingProgress.ts      # Reading tracking
│   ├── useBookmarks.ts            # Bookmarks
│   ├── useManga.ts                # Manga queries
│   └── useAds.ts                  # Ad management
│
├── types/                         # TypeScript types
│   ├── index.ts                   # Main types
│   ├── manga.ts                   # Manga types
│   ├── ads.ts                     # Ad types
│   └── api.ts                     # API types
│
├── styles/                        # Global styles
│   ├── globals.css                # Tailwind directives
│   ├── theme.css                  # CSS variables
│   └── animations.css             # Custom animations
│
├── middleware.ts                  # Auth & security middleware
├── tailwind.config.ts             # Tailwind configuration
├── tsconfig.json                  # TypeScript config
├── next.config.js                 # Next.js config
├── .env.example                   # Environment variables template
└── package.json                   # Dependencies
```

---

## 🎨 Design System

### Colors (Light Mode)
```
Primary:    #FF6B35 (Vibrant Orange - CTA)
Secondary:  #7B68EE (Purple - Accent)
Success:    #10B981 (Green)
Warning:    #F59E0B (Amber)
Error:      #EF4444 (Red)
Info:       #3B82F6 (Blue)

Text Primary:    #1A1A1A
Text Secondary:  #666666
Text Tertiary:   #999999

Surface Primary:   #FFFFFF
Surface Secondary: #F5F5F7
Surface Tertiary:  #F0F0F5

Border Light:  #E5E5E7
Border Dark:   #A9A9B3
```

### Responsive Breakpoints
```
Mobile:    < 640px   (max-width: 639px)
Tablet:    640px - 1024px
Desktop:   > 1024px

Tailwind:  sm: 640px | md: 768px | lg: 1024px | xl: 1280px
```

### Typography
```
Heading H1: 3.2rem, 700 weight, serif (manga vibe)
Heading H2: 2.4rem, 700 weight
Heading H3: 1.8rem, 600 weight

Body Large:   1.125rem, 400 weight
Body Medium:  1rem, 400 weight
Body Small:   0.875rem, 400 weight

Caption:  0.75rem, 500 weight, gray color
Label:    0.875rem, 600 weight
```

---

## 🔐 Authentication Flow

### Signup Process
```
1. User clicks "Sign Up"
2. Enter email & password (or OAuth)
3. Form validates (email format, password min 8 chars)
4. Submit to `/api/auth/signup`
5. Create user in Supabase Auth
6. Create user record in `users` table
7. Send verification email (optional)
8. Redirect to `/profile` (complete profile)
```

### Login Process
```
1. User enters email & password
2. Supabase Auth validates credentials
3. JWT token returned
4. Store in secure cookie (Supabase handles)
5. Auto-refresh token before expiry
6. Redirect to dashboard or last page
```

### OAuth (Google, Twitter, Discord)
```
1. User clicks "Login with [Provider]"
2. Redirect to OAuth consent screen
3. User approves
4. Callback to `/auth/oauth-callback`
5. Supabase creates/updates user
6. Redirect to dashboard
```

---

## 📖 Reading System

### Reading Progress Tracking
```
User starts reading → Page loads
    ↓
Auto-save (debounced, every 10 sec)
    ↓
Save to: reading_progress table
  - user_id
  - manga_id
  - last_chapter_id
  - last_page_number
  - updated_at
    ↓
"Continue Reading" button updated on homepage
```

### Chapter Navigation
**Desktop:**
- Left sidebar: Chapter list (scrollable)
- Center: Full-width image
- Right sidebar: Ads + Comments

**Mobile:**
- Swipe left/right for next/previous
- Tap bottom for controls
- Pull-up for chapter list

---

## 📢 Ad Management System (NO-CODE)

### For Admin

1. **Add Ad Provider**
   - Go to `/admin/ads/providers`
   - Click "+ Add Provider"
   - Select type: Adstera | Custom Banner | Pixel Script | Video
   - Enter credentials/code
   - Save

2. **Create Ad Campaign**
   - Go to `/admin/ads/campaigns`
   - Click "+ Create Campaign"
   - Select provider & zone
   - Paste ad code/image
   - Set dates & display conditions
   - Live preview (light/dark modes)
   - Publish → Live immediately

3. **View Analytics**
   - Go to `/admin/ads/analytics`
   - See impressions, clicks, CTR
   - Charts & trends
   - Per-campaign breakdown

### Ad Zones Available

```
home_top           → Homepage, above manga list
home_sidebar       → Homepage, right sidebar
manga_list_top     → Manga list page, top
reader_top         → Chapter reader, above images
reader_bottom      → Chapter reader, below images
sidebar_right      → Right sidebar during reading
profile_top        → Profile page, top
```

### Display Conditions

```
always            → Show to everyone
logged_in_only    → Only authenticated users
guest_only        → Only non-logged-in visitors
after_scrolls     → After user scrolls N times
time_based        → Show between specific hours
device_target     → Mobile/Tablet/Desktop only
```

---

## 🎯 Phase-by-Phase Implementation

### Phase 1: Setup & Design System (Days 1-3)
- ✅ Initialize Next.js 15+
- ✅ Setup Supabase
- ✅ Create design tokens
- ✅ Theme provider with dark mode
- ✅ Storybook setup
- → **Result:** Design system ready, can build components

### Phase 2: Database & Auth (Days 4-5)
- ✅ Create Supabase tables
- ✅ Configure RLS policies
- ✅ Email/Password auth
- ✅ OAuth integration (Google, Twitter, Discord)
- → **Result:** Users can sign up/login

### Phase 3: Components & Search (Days 6-10)
- ✅ All UI components
- ✅ Search with autocomplete
- ✅ Genre browsing
- ✅ Ad rendering system
- ✅ Onboarding flow
- → **Result:** Core UI ready, can browse manga

### Phase 4: Reader (Days 11-13)
- ✅ Chapter image viewer
- ✅ Reading progress tracking
- ✅ Bookmarks & likes
- ✅ Comments section
- ✅ Mobile gestures
- → **Result:** Can read manga + track progress

### Phase 5: Auth Complete (Days 14-15)
- ✅ User profiles
- ✅ Settings (theme, notifications, privacy)
- ✅ Account management
- → **Result:** Users can customize experience

### Phase 6: Personalization (Days 16-17)
- ✅ Reading history
- ✅ Continue reading
- ✅ Bookmarks management
- ✅ Likes gallery
- → **Result:** Personal dashboard complete

### Phase 7: Admin Dashboard (Days 18-21)
- ✅ Manga CRUD
- ✅ Chapter uploader (drag-drop)
- ✅ Ad management (no-code)
- ✅ User management
- ✅ Analytics dashboard
- → **Result:** Admin can manage everything

### Phase 8: Performance & Deploy (Days 22-25)
- ✅ Image optimization
- ✅ Database indexing
- ✅ ISR caching
- ✅ Code splitting
- ✅ GitHub → Vercel auto-deploy
- → **Result:** Production ready + fast

---

## 🚀 Deployment

### Environment Variables

Create `.env.local`:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]

# OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=[google-client-id]
NEXT_PUBLIC_TWITTER_CLIENT_ID=[twitter-client-id]
NEXT_PUBLIC_DISCORD_CLIENT_ID=[discord-client-id]

# Sentry (Error tracking)
NEXT_PUBLIC_SENTRY_DSN=[sentry-dsn]

# Domain
NEXT_PUBLIC_DOMAIN=app.mangazone.id

# Revalidation
REVALIDATE_SECRET=[random-secret-key]
```

### Deploy to Vercel

```bash
# 1. Push to GitHub
git add .
git commit -m "Initial commit"
git push origin main

# 2. Go to vercel.com
# 3. Import project from GitHub
# 4. Set environment variables
# 5. Deploy

# Auto-deploy: Every push to main → auto-deploys to production
```

### Custom Domain

```
1. Point DNS: mangazone.id → Vercel DNS
2. Add custom domain in Vercel dashboard
3. app.mangazone.id → Vercel project
4. mangazone.id → Redirect to app.mangazone.id (or bio-link page)
```

---

## 🧪 Testing Checklist

### Before Launch

- [ ] Mobile responsive (test on real devices)
- [ ] Dark mode working (all pages)
- [ ] Auth flows working (email, Google, Twitter, Discord)
- [ ] Reading progress saves
- [ ] Bookmarks/likes functional
- [ ] Search working with autocomplete
- [ ] Admin dashboard functional
- [ ] Ad campaigns display correctly
- [ ] Images load quickly
- [ ] No console errors
- [ ] Lighthouse score > 90
- [ ] Core Web Vitals passing (LCP < 2.5s)

---

## 📊 Key Metrics to Monitor

After launch, track these in Vercel analytics & Sentry:

```
Performance:
- LCP (Largest Contentful Paint): Target < 2.5s
- FID (First Input Delay): Target < 100ms
- CLS (Cumulative Layout Shift): Target < 0.1

User Metrics:
- Active users (daily/monthly)
- Page views
- Bounce rate
- Time on page

Technical:
- Error rate
- API response time
- Database query time
- Image load time
```

---

## 🔒 Security Checklist

- [ ] HTTPS enabled (Vercel handles)
- [ ] Environment variables never in code
- [ ] RLS policies configured
- [ ] API routes protected
- [ ] Input validation (Zod)
- [ ] HTML sanitization (DOMPurify)
- [ ] No console.log of sensitive data
- [ ] CORS configured
- [ ] Rate limiting on endpoints
- [ ] Secure headers set
- [ ] CSRF protection
- [ ] File upload validation

---

## 🐛 Common Issues & Solutions

### Issue: Images not loading
```
Solution:
1. Check Supabase Storage URL in environment
2. Verify image path is correct
3. Check RLS policies allow public read
4. Try next/image component
```

### Issue: Auth not working
```
Solution:
1. Check Supabase API keys are correct
2. Verify OAuth callbacks configured
3. Check auth middleware is enabled
4. Test with console logs
```

### Issue: Slow page load
```
Solution:
1. Check Core Web Vitals in Lighthouse
2. Optimize images (use next/image)
3. Enable ISR for static pages
4. Check database queries (indexes)
5. Enable Vercel Analytics
```

### Issue: Dark mode not saving
```
Solution:
1. Check theme provider is in layout
2. Verify localStorage is working
3. Check CSS variables are applied
4. Test in incognito (no cache issues)
```

---

## 📚 Additional Resources

- **Next.js Docs:** https://nextjs.org/docs
- **Supabase Docs:** https://supabase.com/docs
- **Tailwind CSS:** https://tailwindcss.com/docs
- **React Query:** https://tanstack.com/query/latest
- **Vercel Docs:** https://vercel.com/docs

---

## 👥 Contributing

1. Create feature branch: `git checkout -b feature/feature-name`
2. Commit: `git commit -m "Add feature"`
3. Push: `git push origin feature/feature-name`
4. Create Pull Request

---

## 📝 License

MIT License - feel free to use for personal/commercial projects

---

## 🙋 Support

Questions? Issues? 
- Check existing issues on GitHub
- Create new issue with detailed description
- Include screenshots if UI-related

---

**Happy coding! 🎨📚**
