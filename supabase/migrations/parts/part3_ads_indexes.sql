-- ============================================================
-- PART 3: Ad System, Indexes, Triggers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_providers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  type        ad_type     NOT NULL DEFAULT 'BANNER',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  pixel_code  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_zones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  placement   TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  provider_id UUID        NOT NULL REFERENCES public.ad_providers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  zone_id        UUID        NOT NULL REFERENCES public.ad_zones(id) ON DELETE CASCADE,
  type           ad_type     NOT NULL DEFAULT 'BANNER',
  html_content   TEXT,
  image_url      TEXT,
  link_url       TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  priority       INT         NOT NULL DEFAULT 0,
  start_date     TIMESTAMPTZ,
  end_date       TIMESTAMPTZ,
  target_mobile  BOOLEAN     NOT NULL DEFAULT true,
  target_desktop BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_analytics (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID        NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  event       ad_event    NOT NULL,
  user_id     UUID,
  ip_hash     TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manga_slug        ON public.manga(slug);
CREATE INDEX IF NOT EXISTS idx_manga_status      ON public.manga(status);
CREATE INDEX IF NOT EXISTS idx_manga_created     ON public.manga(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_manga    ON public.chapters(manga_id);
CREATE INDEX IF NOT EXISTS idx_chapters_release  ON public.chapters(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_chapter_images    ON public.chapter_images(chapter_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user    ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_manga   ON public.bookmarks(manga_id);
CREATE INDEX IF NOT EXISTS idx_likes_user        ON public.likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_manga       ON public.likes(manga_id);
CREATE INDEX IF NOT EXISTS idx_reading_user      ON public.reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_zone ON public.ad_campaigns(zone_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ad_analytics_camp ON public.ad_analytics(campaign_id, event);
CREATE INDEX IF NOT EXISTS idx_manga_title_trgm  ON public.manga USING gin(title gin_trgm_ops);

-- updated_at auto-trigger
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
