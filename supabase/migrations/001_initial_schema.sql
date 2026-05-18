-- ============================================================
-- Manga Zone — Initial Schema Migration
-- Run this in the Supabase SQL Editor (SQL > New Query)
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- for full-text search

-- ── ENUMS ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE manga_status AS ENUM ('ONGOING', 'COMPLETED', 'HIATUS', 'DROPPED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('USER', 'ADMIN', 'MODERATOR');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ad_provider_type AS ENUM ('ADSTERRA', 'CUSTOM_HTML', 'PIXEL_ONLY', 'GOOGLE_ADSENSE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ad_type AS ENUM ('BANNER', 'PIXEL', 'CUSTOM_HTML', 'NATIVE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ad_placement AS ENUM (
    'HOME_TOP', 'HOME_BOTTOM', 'READER_TOP', 'READER_BOTTOM',
    'SIDEBAR', 'SEARCH_RESULTS', 'CHAPTER_BETWEEN_PAGES'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ad_event AS ENUM ('IMPRESSION', 'CLICK');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── USERS (extends Supabase auth.users) ─────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT        UNIQUE NOT NULL,
  username        TEXT        UNIQUE,
  avatar_url      TEXT,
  bio             TEXT,
  role            user_role   NOT NULL DEFAULT 'USER',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID    UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  theme                TEXT    NOT NULL DEFAULT 'system',
  language             TEXT    NOT NULL DEFAULT 'en',
  nsfw                 BOOLEAN NOT NULL DEFAULT false,
  email_notifications  BOOLEAN NOT NULL DEFAULT false,
  reader_mode          TEXT    NOT NULL DEFAULT 'webtoon',
  reader_width         TEXT    NOT NULL DEFAULT 'medium'
);

-- Auto-create user profile row when Supabase Auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'username',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── MANGA ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manga (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT         UNIQUE NOT NULL,
  title        TEXT         NOT NULL,
  description  TEXT,
  cover_url    TEXT,
  banner_url   TEXT,
  status       manga_status NOT NULL DEFAULT 'ONGOING',
  rating       FLOAT        NOT NULL DEFAULT 0,
  rating_count INT          NOT NULL DEFAULT 0,
  views        INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.genres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.authors (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT UNIQUE NOT NULL,
  slug      TEXT UNIQUE NOT NULL,
  biography TEXT
);

-- M2M join tables
CREATE TABLE IF NOT EXISTS public.manga_genres (
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  PRIMARY KEY (manga_id, genre_id)
);

CREATE TABLE IF NOT EXISTS public.manga_authors (
  manga_id  UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  PRIMARY KEY (manga_id, author_id)
);

-- ── CHAPTERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chapters (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manga_id     UUID        NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  number       FLOAT       NOT NULL,
  title        TEXT,
  release_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  views        INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (manga_id, number)
);

CREATE TABLE IF NOT EXISTS public.chapter_images (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID        NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  number     INT         NOT NULL,
  image_url  TEXT        NOT NULL,
  width      INT         NOT NULL DEFAULT 1080,
  height     INT         NOT NULL DEFAULT 1440,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chapter_id, number)
);

-- ── USER INTERACTIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id   UUID        NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, manga_id)
);

CREATE TABLE IF NOT EXISTS public.likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id   UUID        NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, manga_id)
);

CREATE TABLE IF NOT EXISTS public.reading_progress (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id        UUID        NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  last_chapter_id UUID        REFERENCES public.chapters(id) ON DELETE SET NULL,
  last_page       INT         NOT NULL DEFAULT 1,
  read_percentage INT         NOT NULL DEFAULT 0,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, manga_id)
);

-- ── AD SYSTEM ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_providers (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT              NOT NULL,
  type        ad_provider_type  NOT NULL,
  is_active   BOOLEAN           NOT NULL DEFAULT true,
  pixel_code  TEXT,
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_zones (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL,
  placement   ad_placement NOT NULL,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  provider_id UUID         NOT NULL REFERENCES public.ad_providers(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  zone_id         UUID        NOT NULL REFERENCES public.ad_zones(id),
  type            ad_type     NOT NULL,
  html_content    TEXT,
  image_url       TEXT,
  link_url        TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  priority        INT         NOT NULL DEFAULT 0,
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  target_mobile   BOOLEAN     NOT NULL DEFAULT true,
  target_desktop  BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_analytics (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID        NOT NULL REFERENCES public.ad_campaigns(id),
  event       ad_event    NOT NULL,
  user_id     UUID,
  ip_hash     TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AUDIT LOG ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  action      TEXT        NOT NULL,
  resource    TEXT        NOT NULL,
  resource_id TEXT        NOT NULL,
  changes     JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_manga_slug         ON public.manga(slug);
CREATE INDEX IF NOT EXISTS idx_manga_status       ON public.manga(status);
CREATE INDEX IF NOT EXISTS idx_manga_created      ON public.manga(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_manga     ON public.chapters(manga_id);
CREATE INDEX IF NOT EXISTS idx_chapters_release   ON public.chapters(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_chapter_images     ON public.chapter_images(chapter_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user     ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_manga    ON public.bookmarks(manga_id);
CREATE INDEX IF NOT EXISTS idx_likes_user         ON public.likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_manga        ON public.likes(manga_id);
CREATE INDEX IF NOT EXISTS idx_reading_user       ON public.reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_zones_placement ON public.ad_zones(placement) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_zone  ON public.ad_campaigns(zone_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ad_analytics_camp  ON public.ad_analytics(campaign_id, event);
CREATE INDEX IF NOT EXISTS idx_audit_resource     ON public.audit_logs(resource, created_at DESC);

-- Full-text search on manga title
CREATE INDEX IF NOT EXISTS idx_manga_title_trgm ON public.manga USING gin(title gin_trgm_ops);

-- ── UPDATED_AT TRIGGER ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','manga','chapters','ad_providers','ad_zones','ad_campaigns'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I;
       CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', tbl, tbl
    );
  END LOOP;
END $$;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────

-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile"  ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Public can read usernames"   ON public.users;
CREATE POLICY "Users can read own profile"   ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Public can read usernames"    ON public.users FOR SELECT USING (true); -- needed for profile pages

-- user_settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings" ON public.user_settings USING (auth.uid() = user_id);

-- manga (public read, admin write)
ALTER TABLE public.manga ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read manga" ON public.manga;
DROP POLICY IF EXISTS "Admins can manage manga" ON public.manga;
CREATE POLICY "Public can read manga"    ON public.manga FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Admins can manage manga"  ON public.manga FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN','MODERATOR')));

-- chapters
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read chapters" ON public.chapters;
DROP POLICY IF EXISTS "Admins can manage chapters" ON public.chapters;
CREATE POLICY "Public can read chapters"   ON public.chapters FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Admins can manage chapters" ON public.chapters FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN','MODERATOR')));

-- chapter_images (public read)
ALTER TABLE public.chapter_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read chapter images" ON public.chapter_images;
CREATE POLICY "Public can read chapter images" ON public.chapter_images FOR SELECT USING (true);
CREATE POLICY "Admins can manage images" ON public.chapter_images FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN','MODERATOR')));

-- genres & authors (public read)
ALTER TABLE public.genres  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read genres"  ON public.genres  FOR SELECT USING (true);
CREATE POLICY "Public can read authors" ON public.authors FOR SELECT USING (true);

-- manga_genres, manga_authors (public read)
ALTER TABLE public.manga_genres  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manga_authors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read manga_genres"  ON public.manga_genres  FOR SELECT USING (true);
CREATE POLICY "Public can read manga_authors" ON public.manga_authors FOR SELECT USING (true);

-- bookmarks
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own bookmarks" ON public.bookmarks;
CREATE POLICY "Users manage own bookmarks" ON public.bookmarks USING (auth.uid() = user_id);

-- likes
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own likes" ON public.likes;
CREATE POLICY "Users manage own likes" ON public.likes USING (auth.uid() = user_id);

-- reading_progress
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own progress" ON public.reading_progress;
CREATE POLICY "Users manage own progress" ON public.reading_progress USING (auth.uid() = user_id);

-- ad system (admin only)
ALTER TABLE public.ad_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_zones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ad_providers" ON public.ad_providers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));
CREATE POLICY "Admins manage ad_zones"     ON public.ad_zones     FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));
CREATE POLICY "Admins manage ad_campaigns" ON public.ad_campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));
-- Anyone can log ad events (tracked server-side)
CREATE POLICY "Public read ad_campaigns" ON public.ad_campaigns FOR SELECT USING (is_active = true);
CREATE POLICY "Service insert analytics" ON public.ad_analytics FOR INSERT WITH CHECK (true);

-- audit_logs (admin read only)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit_logs" ON public.audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));
