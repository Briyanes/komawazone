-- ============================================================
-- PART 4: Row Level Security (RLS)
-- ============================================================

-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile"   ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Public can read usernames"    ON public.users;
CREATE POLICY "Public can read usernames"    ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- user_settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings" ON public.user_settings USING (auth.uid() = user_id);

-- manga
ALTER TABLE public.manga ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read manga"   ON public.manga;
DROP POLICY IF EXISTS "Admins can manage manga" ON public.manga;
CREATE POLICY "Public can read manga"   ON public.manga FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Admins can manage manga" ON public.manga FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN','MODERATOR')));

-- chapters
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read chapters"   ON public.chapters;
DROP POLICY IF EXISTS "Admins can manage chapters" ON public.chapters;
CREATE POLICY "Public can read chapters"   ON public.chapters FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Admins can manage chapters" ON public.chapters FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN','MODERATOR')));

-- chapter_images
ALTER TABLE public.chapter_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read chapter images" ON public.chapter_images;
DROP POLICY IF EXISTS "Admins can manage images"       ON public.chapter_images;
CREATE POLICY "Public can read chapter images" ON public.chapter_images FOR SELECT USING (true);
CREATE POLICY "Admins can manage images"       ON public.chapter_images FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN','MODERATOR')));

-- genres
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read genres" ON public.genres;
CREATE POLICY "Public can read genres" ON public.genres FOR SELECT USING (true);

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

-- ad system
ALTER TABLE public.ad_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_zones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage ad_providers" ON public.ad_providers;
DROP POLICY IF EXISTS "Admins manage ad_zones"     ON public.ad_zones;
DROP POLICY IF EXISTS "Admins manage ad_campaigns" ON public.ad_campaigns;
DROP POLICY IF EXISTS "Public read ad_campaigns"   ON public.ad_campaigns;
DROP POLICY IF EXISTS "Service insert analytics"   ON public.ad_analytics;

CREATE POLICY "Admins manage ad_providers" ON public.ad_providers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));
CREATE POLICY "Admins manage ad_zones"     ON public.ad_zones     FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));
CREATE POLICY "Admins manage ad_campaigns" ON public.ad_campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));
CREATE POLICY "Public read ad_campaigns"   ON public.ad_campaigns FOR SELECT USING (is_active = true);
CREATE POLICY "Service insert analytics"   ON public.ad_analytics FOR INSERT WITH CHECK (true);

-- audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit_logs" ON public.audit_logs;
CREATE POLICY "Admins read audit_logs" ON public.audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));
