-- ============================================================
-- PART 2: Manga, Chapters, User Interactions
-- ============================================================

-- Manga table (with type, author, artist, genres columns)
CREATE TABLE IF NOT EXISTS public.manga (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT         UNIQUE NOT NULL,
  title        TEXT         NOT NULL,
  description  TEXT,
  cover_url    TEXT,
  banner_url   TEXT,
  status       manga_status NOT NULL DEFAULT 'ONGOING',
  type         manga_type   NOT NULL DEFAULT 'MANGA',
  author       TEXT,
  artist       TEXT,
  genres       TEXT[]       NOT NULL DEFAULT '{}',
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

-- reading_progress — column names match TypeScript types
CREATE TABLE IF NOT EXISTS public.reading_progress (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manga_id        UUID        NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  chapter_id      UUID        REFERENCES public.chapters(id) ON DELETE SET NULL,
  page_number     INT         NOT NULL DEFAULT 1,
  read_percentage INT         NOT NULL DEFAULT 0,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, manga_id)
);
