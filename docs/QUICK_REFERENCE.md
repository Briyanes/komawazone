# 📋 Quick Reference Guide

## Essential Commands

```bash
# Development
npm run dev              # Start dev server on localhost:3000

# Building
npm run build            # Build for production
npm start                # Run production build locally

# Type checking
npm run type-check       # Check TypeScript errors

# Linting & formatting
npm run lint             # Run ESLint
npm run format           # Format code with Prettier

# Storybook
npm run storybook        # Start Storybook on localhost:6006

# Database
npx supabase gen types typescript --project-id xxx   # Generate types
```

---

## File Locations Quick Reference

| What | Where |
|------|-------|
| Colors & tokens | `config/design-tokens.ts` |
| Typography | `config/design-tokens.ts` |
| Theme provider | `theme/ThemeProvider.tsx` |
| Supabase client | `lib/supabase.ts` |
| Custom hooks | `hooks/useAuth.ts`, `hooks/useTheme.ts`, etc |
| API routes | `app/api/*/route.ts` |
| Components | `components/*/*.tsx` |
| Types | `types/*.ts` |
| Global styles | `styles/globals.css` |
| CSS variables | `styles/theme.css` |

---

## Common Tasks

### Adding a New Component

```bash
# 1. Create component file
touch components/[category]/ComponentName.tsx

# 2. Create Storybook story
touch components/[category]/ComponentName.stories.tsx

# 3. Export from index
# Add to components/index.ts or components/[category]/index.ts

# 4. Add tests (optional)
touch components/[category]/ComponentName.test.tsx
```

### Creating a New API Route

```bash
# Create route
touch app/api/[feature]/route.ts

# Template:
export async function GET(request: Request) {
  try {
    // Get query params
    const { searchParams } = new URL(request.url)
    
    // Get data from Supabase
    const { data, error } = await supabase
      .from('table')
      .select('*')
    
    if (error) throw error
    
    return Response.json({ data })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate with Zod
    const validated = MySchema.parse(body)
    
    // Insert to database
    const { data, error } = await supabase
      .from('table')
      .insert(validated)
    
    if (error) throw error
    
    return Response.json({ data }, { status: 201 })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
```

### Creating a Custom Hook

```typescript
// hooks/useMyFeature.ts
'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useMyFeature() {
  // Query data
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-feature'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('table')
        .select('*')
      
      if (error) throw error
      return data
    }
  })
  
  // Mutate data
  const { mutate: create, isPending } = useMutation({
    mutationFn: async (newData) => {
      const { data, error } = await supabase
        .from('table')
        .insert(newData)
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      // Revalidate queries
      queryClient.invalidateQueries({ queryKey: ['my-feature'] })
    }
  })
  
  return { data, isLoading, error, create, isPending }
}
```

### Using Design Tokens in Components

```tsx
// ✅ CORRECT: Use CSS variables
export function MyComponent() {
  return (
    <div 
      className="rounded-lg p-md shadow-md"
      style={{
        backgroundColor: 'var(--color-surface-secondary)',
        color: 'var(--color-text-primary)'
      }}
    >
      Content
    </div>
  )
}

// ✅ ALSO CORRECT: Use Tailwind with tokens
export function MyComponent() {
  return (
    <div className="rounded-lg p-md shadow-md bg-surface-secondary text-text-primary">
      Content
    </div>
  )
}

// ❌ WRONG: Hardcoded values
<div style={{ padding: '16px', backgroundColor: '#F5F5F7' }}>
  Don't do this!
</div>
```

---

## Testing Checklist

### Before Committing

- [ ] No console.error or console.warn
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] Linter passes (`npm run lint`)
- [ ] Component renders without crashing
- [ ] Responsive on mobile (< 640px) and desktop (> 1024px)
- [ ] Dark mode toggle works
- [ ] No broken links or missing images

### Before Deploying

- [ ] All tests pass
- [ ] Build succeeds (`npm run build`)
- [ ] Lighthouse score > 90
- [ ] Core Web Vitals pass
- [ ] No API errors in console
- [ ] Database queries optimized
- [ ] Environment variables set in Vercel

---

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/feature-name

# Make changes
git add .
git commit -m "Add feature description"

# Push to remote
git push origin feature/feature-name

# Create pull request on GitHub
# Then merge to main

# Back to main
git checkout main
git pull origin main

# Delete branch
git branch -d feature/feature-name
git push origin -d feature/feature-name
```

### Commit Message Format

```
[Type] Short description

# Examples:
[feat] Add dark mode toggle
[fix] Fix mobile menu not closing
[refactor] Extract MangaCard to separate component
[docs] Update design system docs
[perf] Optimize image loading

Types: feat, fix, refactor, docs, perf, test, chore
```

---

## Environment Variables

### Development (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[key]
SUPABASE_SERVICE_ROLE_KEY=[key]
NEXT_PUBLIC_SENTRY_DSN=[optional]
```

### Production (Vercel)

Same as above, plus:
```
NEXT_PUBLIC_DOMAIN=app.mangazone.id
REVALIDATE_SECRET=[random-key]
```

---

## Debugging Tips

### TypeScript Errors

```bash
# Find all TS errors
npm run type-check

# Generate types from Supabase
npx supabase gen types typescript --project-id xxx > lib/database.types.ts
```

### Network Issues

```typescript
// In browser console:
// Check API calls in Network tab
// Check for CORS errors
// Verify auth token exists: localStorage.getItem('auth-token')
```

### Dark Mode Issues

```javascript
// Check theme is applied:
document.documentElement.getAttribute('data-theme')

// Check CSS variables exist:
getComputedStyle(document.documentElement).getPropertyValue('--color-primary')

// Toggle theme:
document.documentElement.setAttribute('data-theme', 'dark')
```

### Performance Issues

```javascript
// Check Web Vitals:
// Open DevTools → Lighthouse → Generate report

// Check Core Web Vitals:
// Vercel Analytics dashboard

// Check database queries:
// Supabase dashboard → Explore → View query performance
```

---

## Database Tips

### Quick Query in Supabase Dashboard

Go to: Project → SQL Editor → Run query

```sql
-- Get all manga
SELECT * FROM manga LIMIT 10;

-- Get user's bookmarks
SELECT m.* FROM bookmarks b
JOIN manga m ON b.manga_id = m.id
WHERE b.user_id = '[user-id]';

-- Get chapter count per manga
SELECT manga_id, COUNT(*) as chapter_count
FROM chapters
GROUP BY manga_id;
```

### Backup Database

```bash
# Export data
pg_dump [connection-string] > backup.sql

# Restore data
psql [connection-string] < backup.sql
```

---

## Performance Optimization Checklist

- [ ] Images use next/image component
- [ ] Database indexes on frequently queried columns
- [ ] React Query caching configured (staleTime, gcTime)
- [ ] Dynamic imports for admin routes
- [ ] ISR configured for static pages
- [ ] API routes compressed responses
- [ ] No N+1 queries (batch queries with joins)
- [ ] Code splitting implemented

---

## Security Checklist

- [ ] No secrets in code
- [ ] All env variables used
- [ ] Input validation with Zod
- [ ] HTML sanitization with DOMPurify
- [ ] RLS policies configured
- [ ] API routes protected with role checks
- [ ] CORS configured properly
- [ ] Rate limiting on endpoints
- [ ] HTTPS enforced (Vercel handles)
- [ ] CSP headers set

---

## Useful Links

- **Next.js Docs:** https://nextjs.org/docs
- **Supabase Docs:** https://supabase.com/docs
- **React Query Docs:** https://tanstack.com/query/latest
- **Tailwind Docs:** https://tailwindcss.com/docs
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **MDN Web Docs:** https://developer.mozilla.org/en-US/

---

## Emergency Fixes

### App Won't Start

```bash
# Clear cache and node_modules
rm -rf .next node_modules
npm install
npm run dev
```

### Database Connection Failed

```bash
# Check API keys
# Verify Supabase project is running
# Check network: can reach supabase.co?
# Try from Supabase dashboard directly
```

### Deployment Failed

```bash
# Check build log on Vercel
# Verify all env variables set
# Check for TypeScript errors
# Try building locally: npm run build
```

### Theme Not Saved

```bash
# Clear localStorage
localStorage.clear()

# Check browser supports localStorage
# Verify ThemeProvider in layout.tsx
# Check CSS variables in theme.css
```

---

## Who to Contact (When Stuck)

- **Supabase Issues:** Check Supabase Status Page
- **Next.js Issues:** Next.js GitHub Issues
- **Styling Issues:** Check Tailwind docs
- **Performance:** Use Vercel Analytics

---

**Happy coding! 🚀**

Last Updated: 2026-05-15
