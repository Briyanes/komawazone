# 🎯 Implementation Guide - Phase by Phase

## Table of Contents
1. [Phase 1: Setup & Design System](#phase-1-setup--design-system)
2. [Phase 2: Database & Auth](#phase-2-database--auth)
3. [Phase 3: Components & Search](#phase-3-components--search)
4. [Phase 4: Reader](#phase-4-reader)
5. [Phase 5: Auth Complete](#phase-5-auth-complete)
6. [Phase 6: Personalization](#phase-6-personalization)
7. [Phase 7: Admin Dashboard](#phase-7-admin-dashboard)
8. [Phase 8: Performance & Deploy](#phase-8-performance--deploy)

---

## Phase 1: Setup & Design System

### Step 1.1: Initialize Next.js 15+

```bash
npx create-next-app@latest manga-zone --typescript --tailwind --app
cd manga-zone

# Install additional dependencies
npm install \
  @supabase/supabase-js \
  @supabase/auth-helpers-nextjs \
  @tanstack/react-query \
  zustand \
  zod \
  react-hook-form \
  @hookform/resolvers \
  lucide-react \
  clsx \
  tailwind-merge \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-tabs \
  @radix-ui/react-toggle \
  next-themes \
  @sentry/nextjs \
  dompurify
```

### Step 1.2: Setup Folder Structure

```bash
# Create directories
mkdir -p config theme lib hooks types styles components/{layout,reader,manga,auth,profile,ads,admin}
```

### Step 1.3: Create Design Tokens

Create `config/design-tokens.ts`:

```typescript
export const colors = {
  light: {
    primary: '#FF6B35',
    primaryHover: '#E85A28',
    primaryActive: '#D64B1E',
    secondary: '#7B68EE',
    surface: {
      primary: '#FFFFFF',
      secondary: '#F5F5F7',
      tertiary: '#F0F0F5',
      inverse: '#1A1A1A'
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#666666',
      tertiary: '#999999',
      inverse: '#FFFFFF'
    },
    border: {
      light: '#E5E5E7',
      medium: '#D0D0D5',
      dark: '#A9A9B3'
    },
    semantic: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6'
    }
  },
  dark: {
    primary: '#FF6B35',
    primaryHover: '#FF7A4D',
    primaryActive: '#E85A28',
    secondary: '#8B7AFF',
    surface: {
      primary: '#1A1A1A',
      secondary: '#2D2D2D',
      tertiary: '#3A3A3A',
      inverse: '#FFFFFF'
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#CCCCCC',
      tertiary: '#999999',
      inverse: '#1A1A1A'
    },
    border: {
      light: '#3A3A3A',
      medium: '#4A4A4A',
      dark: '#5A5A5A'
    },
    semantic: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#60A5FA'
    }
  }
}

export const typography = {
  heading: {
    h1: { size: '3.2rem', weight: 700, lineHeight: 1.2 },
    h2: { size: '2.4rem', weight: 700, lineHeight: 1.3 },
    h3: { size: '1.8rem', weight: 600, lineHeight: 1.4 }
  },
  body: {
    lg: { size: '1.125rem', weight: 400, lineHeight: 1.6 },
    md: { size: '1rem', weight: 400, lineHeight: 1.6 },
    sm: { size: '0.875rem', weight: 400, lineHeight: 1.5 }
  }
}

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '2.5rem',
  '3xl': '3rem'
}
```

### Step 1.4: Setup Theme Provider

Create `theme/ThemeProvider.tsx`:

```typescript
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // Load theme from localStorage or system preference
    const saved = localStorage.getItem('theme') as Theme | null
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(saved || (preferred ? 'dark' : 'light'))
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return

    // Apply theme to DOM
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme, isMounted])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  if (!isMounted) return null

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
```

### Step 1.5: Configure Tailwind with Dark Mode

Update `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        surface: 'var(--color-surface)',
        text: 'var(--color-text)',
      },
      screens: {
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
      },
    },
  },
  plugins: [],
}

export default config
```

### Step 1.6: Setup Storybook

```bash
npx storybook@latest init --builder=webpack
```

Create `.storybook/main.ts` for Next.js 15 support.

### Step 1.7: Setup Root Layout

Create `app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import { ThemeProvider } from '@/theme/ThemeProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Manga Zone - Read Manga Online',
  description: 'Discover and read your favorite manga and manhwa',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### ✅ Phase 1 Complete When:
- ✅ Project runs on `localhost:3000`
- ✅ Theme toggle works (light/dark)
- ✅ Responsive grid system tested
- ✅ Storybook accessible on `localhost:6006`

---

## Phase 2: Database & Auth

### Step 2.1: Setup Supabase Project

1. Go to supabase.com
2. Create new project
3. Wait for setup (~2 min)
4. Get API keys from Settings

### Step 2.2: Create Database Tables

Use Supabase SQL editor to run:

```sql
-- Users table (extends Supabase auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  avatar_url TEXT,
  theme_preference TEXT DEFAULT 'light',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Manga table
CREATE TABLE public.manga (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  cover_image_url TEXT,
  status TEXT DEFAULT 'ongoing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chapters
CREATE TABLE public.chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  chapter_num NUMERIC NOT NULL,
  title TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chapter images
CREATE TABLE public.chapter_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  page_num INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reading progress
CREATE TABLE public.reading_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  last_chapter_id UUID REFERENCES public.chapters(id),
  last_page INTEGER DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, manga_id)
);

-- Bookmarks
CREATE TABLE public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, manga_id)
);

-- Likes
CREATE TABLE public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, manga_id)
);

-- Ad Providers
CREATE TABLE public.ad_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  api_key TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ad Zones
CREATE TABLE public.ad_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name TEXT NOT NULL,
  description TEXT,
  location TEXT NOT NULL,
  page_type TEXT NOT NULL,
  size_constraint TEXT,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ad Campaigns
CREATE TABLE public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.ad_providers(id),
  zone_id UUID NOT NULL REFERENCES public.ad_zones(id),
  ad_code TEXT,
  title TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  rotation_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ad Analytics
CREATE TABLE public.ad_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id),
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5, 4) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comments
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_manga_slug ON public.manga(slug);
CREATE INDEX idx_chapters_manga_id ON public.chapters(manga_id);
CREATE INDEX idx_chapter_images_chapter_id ON public.chapter_images(chapter_id);
CREATE INDEX idx_reading_progress_user_id ON public.reading_progress(user_id);
CREATE INDEX idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX idx_likes_user_id ON public.likes(user_id);
CREATE INDEX idx_ad_campaigns_zone_id ON public.ad_campaigns(zone_id);
CREATE INDEX idx_comments_chapter_id ON public.comments(chapter_id);
```

### Step 2.3: Configure RLS Policies

In Supabase dashboard, enable RLS on all tables and add policies:

```sql
-- Users can only read/update their own profile
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Reading progress: Users can only read/update their own
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their reading progress"
  ON public.reading_progress
  USING (auth.uid() = user_id);

-- Similar policies for bookmarks, likes, etc.
-- Public can read manga/chapters
ALTER TABLE public.manga ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read manga"
  ON public.manga FOR SELECT
  USING (true);
```

### Step 2.4: Setup Supabase Client

Create `lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// For server-side operations
export const supabaseServer = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

### ✅ Phase 2 Complete When:
- ✅ All tables created in Supabase
- ✅ RLS policies configured
- ✅ API keys working
- ✅ Can query from Next.js

---

## Phase 3: Components & Search

*(Detailed implementation continues...)*

### Step 3.1: Create Base Components

Start with layout components first, then UI components.

### Step 3.2: Implement Search

- Search input with debounce
- Autocomplete suggestions
- Genre browsing page

### Step 3.3: Build Ad System

- AdZone component
- AdRenderer for different types
- Ad management logic

### ✅ Phase 3 Complete When:
- ✅ 30+ components built
- ✅ Search working with autocomplete
- ✅ Ad system rendering correctly

---

## Continuing Phases...

*Each phase builds on previous ones. Follow the detailed steps above and continue with phases 4-8.*

### Key Checkpoints:
- **End of Phase 4:** Users can read manga
- **End of Phase 5:** Full auth system
- **End of Phase 6:** Personal dashboard
- **End of Phase 7:** Admin can manage content
- **End of Phase 8:** Production ready

---

## 💡 Pro Tips

1. **Test Early & Often:** Test responsive design on real devices
2. **Use Git Branches:** Create branch for each phase
3. **Follow Design Tokens:** Don't hardcode colors/sizes
4. **Type Everything:** Use TypeScript strictly
5. **Commit Often:** Small, meaningful commits
6. **Document Complex Logic:** Add comments for tricky parts

---

## 🆘 Troubleshooting

### Supabase Connection Issues
```bash
# Test connection
curl -X GET "https://[project].supabase.co/rest/v1/manga?select=*&limit=1" \
  -H "apikey: [your-anon-key]"
```

### Theme Not Applying
- Check `[data-theme="dark"]` is on `<html>`
- Verify CSS variables are defined
- Clear browser cache

### Database Queries Slow
- Check indexes are created
- Use Supabase query explorer to debug
- Check RLS policies aren't blocking queries

---

**Ready to start? Begin with Phase 1! 🚀**
