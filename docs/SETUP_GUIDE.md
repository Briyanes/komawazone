# SETUP_GUIDE.md
## Manga Zone — Local Development Setup

**Document ID:** SETUP-001  
**Time Required:** ~30 minutes for first-time setup  
**Prerequisites:** macOS / Linux / WSL2

---

## Prerequisites

Install the following tools before starting:

| Tool | Required Version | Install |
|------|-----------------|---------|
| Node.js | ≥ 20.x LTS | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| npm | ≥ 10.x | Included with Node |
| Git | ≥ 2.x | `brew install git` |
| Supabase CLI | ≥ 1.x | `npm install -g supabase` |
| VS Code | Latest | [code.visualstudio.com](https://code.visualstudio.com) |

### Recommended VS Code Extensions
```
dbaeumer.vscode-eslint
esbenp.prettier-vscode
bradlc.vscode-tailwindcss
prisma.prisma
ms-vscode.vscode-typescript-next
```

---

## Step 1: Clone Repository

```bash
git clone https://github.com/your-username/manga-zone.git
cd manga-zone
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This installs all packages defined in `package.json`. Expected time: 1–3 minutes.

---

## Step 3: Environment Variables

```bash
# Copy the example file
cp docs/.env.example .env.local
```

Open `.env.local` and fill in the required values:

### 3A. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a region close to your users (e.g., Southeast Asia → Singapore)
3. Save the database password — you won't see it again
4. Wait for provisioning (~2 minutes)
5. Go to **Settings → API** and copy:
   - `NEXT_PUBLIC_SUPABASE_URL` → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon / public key
   - `SUPABASE_SERVICE_ROLE_KEY` → service_role key (**keep secret**)

### 3B. Generate JWT Secrets
```bash
# Generate secure secrets
openssl rand -base64 64   # → JWT_SECRET
openssl rand -base64 64   # → JWT_REFRESH_SECRET
openssl rand -hex 32      # → REVALIDATE_SECRET
```

### 3C. OAuth Providers (Optional)
Skip OAuth setup initially — email/password auth works without it.

**Google OAuth:**
1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URI: `http://localhost:3000/auth/callback`
4. Copy Client ID → `GOOGLE_CLIENT_ID`, Client Secret → `GOOGLE_CLIENT_SECRET`

**Discord OAuth:**
1. [discord.com/developers/applications](https://discord.com/developers/applications) → New Application
2. OAuth2 → Add Redirect: `http://localhost:3000/auth/callback`
3. Copy Client ID and Secret

### 3D. Minimum Required Variables
```bash
# These are the only REQUIRED variables for local dev:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
# NOTE: This project uses Supabase Auth (not NextAuth.js)
# Supabase handles auth sessions internally — no NEXTAUTH_SECRET needed
```

---

## Step 4: Database Setup

### 4A. Run Migrations
```bash
# Initialize Supabase local dev (optional, for local DB)
supabase init
supabase start

# Or apply migrations to remote Supabase
supabase db push
```

### 4B. Apply Schema
The database schema is defined in `docs/DATABASE_MIGRATIONS.md`. 

Create tables via Supabase SQL Editor or run the migration file:
```bash
# Apply migrations
supabase migration up

# Generate TypeScript types from schema
npx supabase gen types typescript \
  --project-id your-project-id \
  > src/lib/database.types.ts
```

### 4C. Seed Data (Optional)
```bash
# Create sample manga data for testing
npm run db:seed
```

---

## Step 5: Configure Supabase Auth

In your Supabase Dashboard:

1. **Authentication → Providers:**
   - Enable **Email** provider ✓
   - Enable **Google** (paste Client ID + Secret)
   - Enable **Discord** (paste Client ID + Secret)

2. **Authentication → URL Configuration:**
   - Site URL: `http://localhost:3000`
   - Redirect URLs (add all):
     ```
     http://localhost:3000/auth/callback
     http://localhost:3000/auth/oauth-callback
     https://app.mangazone.id/auth/callback
     ```

3. **Authentication → Email Templates:**
   - Customize confirm email, reset password templates with your branding

---

## Step 6: Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Start production server locally |
| `npm run lint` | Run ESLint checks |
| `npm run type-check` | Run TypeScript compiler check |
| `npm run test` | Run Jest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run storybook` | Start Storybook component explorer |

---

## Step 7: Verify Setup

Checklist to confirm everything is working:

```
[ ] http://localhost:3000 loads without errors
[ ] Dark/light theme toggle works
[ ] /auth/login page loads
[ ] Can create a new account (email signup)
[ ] Reading list page loads
[ ] /admin route redirects to login (not admin yet)
[ ] No console errors in browser
[ ] No TypeScript errors: npm run type-check
```

---

## Step 8: Set Up Vercel (Auto-Deploy)

1. Push your code to GitHub:
   ```bash
   git remote add origin https://github.com/your-username/manga-zone.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) → Import Repository
3. Select your repo → Framework: **Next.js** (auto-detected)
4. Add all environment variables from `.env.local` to Vercel project settings
5. Deploy → Vercel gives you a `.vercel.app` URL
6. Add your custom domain: `app.mangazone.id` → DNS configuration

**Every push to `main` branch will auto-deploy to production.**

---

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
# or
rm -rf node_modules && npm install
```

### Supabase connection failed
- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct (no trailing slash)
- Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the **anon** key, not service_role
- Ensure the Supabase project is active (not paused)

### TypeScript errors after Supabase schema changes
```bash
npx supabase gen types typescript --project-id your-project-id > src/lib/database.types.ts
```

### Port 3000 already in use
```bash
# Kill the process on port 3000
lsof -ti:3000 | xargs kill
npm run dev
```

### OAuth redirect errors
- Add `http://localhost:3000/auth/callback` to your OAuth provider's allowed redirect URIs
- Update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`

---

## Project Structure Quick Reference

```
manga-zone/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Homepage
│   ├── manga/              # Manga pages
│   ├── auth/               # Auth pages
│   ├── admin/              # Admin dashboard (protected)
│   └── api/                # API routes
├── components/             # Reusable React components
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities and configs
├── types/                  # TypeScript type definitions
├── styles/                 # Global CSS
├── docs/                   # Project documentation ← you're here
├── .env.example            # Environment variable template
├── tailwind.config.ts      # Tailwind + design tokens
├── tsconfig.json           # TypeScript config
└── next.config.js          # Next.js config
```

---

## Next Steps After Setup

1. Read **[IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)** — phase-by-phase dev guide
2. Read **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** — all 42+ API endpoints
3. Read **[DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)** — full schema
4. Check **[CHECKLIST.md](./CHECKLIST.md)** — what to build in what order

---

**Last Updated:** 2026-05-15  
**Version:** 1.0
