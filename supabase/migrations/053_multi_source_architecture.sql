-- ═══════════════════════════════════════════════════════════════
-- 053: Multi-Source Architecture
-- 
-- Tables: sources, source_domains
-- Purpose: Track multiple manga sources + mirror domains
--          Enable automatic domain rotation when CDN is blocked/down
-- ═══════════════════════════════════════════════════════════════

-- ─── sources ───────────────────────────────────────────────────
-- Registry of manga source sites (manhwaland, manhwalist, etc.)
CREATE TABLE IF NOT EXISTS sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,           -- "Manhwaland"
  slug        TEXT NOT NULL UNIQUE,           -- "manhwaland"
  
  -- Scraper theme adapter
  theme       TEXT NOT NULL DEFAULT 'madara', -- madara|flatsome|mangastream|wpmanga
  
  -- Sitemap auto-discovery
  sitemap_url TEXT,                           -- "https://04x-1s.manhwaland.land/sitemap_index.xml"
  
  -- Status tracking
  is_active   BOOLEAN NOT NULL DEFAULT true,
  
  -- Rate limit config per source
  delay_ms    INTEGER NOT NULL DEFAULT 2000,
  
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_active ON sources(is_active) WHERE is_active = true;

-- ─── source_domains ────────────────────────────────────────────
-- Multiple mirror domains per source (for rotation)
CREATE TABLE IF NOT EXISTS source_domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  
  domain      TEXT NOT NULL,                  -- "04x-1s.manhwaland.land"
  priority    INTEGER NOT NULL DEFAULT 10,    -- Lower = tried first (1-100)
  
  -- Health tracking
  status      TEXT NOT NULL DEFAULT 'unknown', -- healthy|degraded|down|unknown
  last_check  TIMESTAMPTZ,
  last_ok     TIMESTAMPTZ,
  last_fail   TIMESTAMPTZ,
  fail_count  INTEGER NOT NULL DEFAULT 0,
  
  -- Auto-rotation: when fail_count >= threshold, domain is marked down
  auto_disabled_at TIMESTAMPTZ,               -- Set when auto-rotated out
  
  -- CF challenge detection
  requires_cf_bypass BOOLEAN NOT NULL DEFAULT false,
  
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(source_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_source_domains_active 
  ON source_domains(source_id, status, priority) 
  WHERE auto_disabled_at IS NULL;

-- ─── manga.source_id FK ────────────────────────────────────────
-- Link manga to its primary source
ALTER TABLE manga 
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_manga_source_id ON manga(source_id) WHERE source_id IS NOT NULL;

-- ─── RLS Policies ──────────────────────────────────────────────
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_domains ENABLE ROW LEVEL SECURITY;

-- Public read (needed for scraper + admin dashboard)
CREATE POLICY sources_public_read ON sources
  FOR SELECT USING (true);

CREATE POLICY source_domains_public_read ON source_domains
  FOR SELECT USING (true);

-- Admin write (service_role bypasses RLS, but explicit for clarity)
-- Note: Admin writes go through service role key, which bypasses RLS

-- ─── Seed: Manhwaland + known mirrors ──────────────────────────
INSERT INTO sources (name, slug, theme, sitemap_url, delay_ms)
VALUES (
  'Manhwaland',
  'manhwaland',
  'madara',
  'https://04x-1s.manhwaland.land/sitemap_index.xml',
  2000
) ON CONFLICT (slug) DO UPDATE SET
  theme = EXCLUDED.theme,
  sitemap_url = EXCLUDED.sitemap_url;

-- Insert known mirror domains with priority
-- Priority 1 = best/fastest, higher = fallback
DO $$
DECLARE
  v_source_id UUID;
BEGIN
  SELECT id INTO v_source_id FROM sources WHERE slug = 'manhwaland';
  
  IF v_source_id IS NOT NULL THEN
    -- Primary domain (currently working)
    INSERT INTO source_domains (source_id, domain, priority, status)
    VALUES (v_source_id, '04x-1s.manhwaland.land', 1, 'healthy')
    ON CONFLICT (source_id, domain) DO NOTHING;
    
    -- Mirror domains (fallbacks)
    INSERT INTO source_domains (source_id, domain, priority, status)
    VALUES 
      (v_source_id, '04x.manhwaland.land', 2, 'unknown'),
      (v_source_id, 'manhwaland.land', 3, 'unknown')
    ON CONFLICT (source_id, domain) DO NOTHING;
  END IF;
END $$;

-- ─── Link existing manga to Manhwaland source ──────────────────
-- Any manga with manhwaland in source_url gets linked
UPDATE manga 
SET source_id = (SELECT id FROM sources WHERE slug = 'manhwaland')
WHERE source_url ILIKE '%manhwaland%'
  AND source_id IS NULL;

-- ─── Trigger: auto-update updated_at ───────────────────────────
CREATE OR REPLACE FUNCTION update_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sources_updated_at ON sources;
CREATE TRIGGER trg_sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW
  EXECUTE FUNCTION update_sources_updated_at();

-- ─── Comments ──────────────────────────────────────────────────
COMMENT ON TABLE sources IS 'Registry of manga source sites (manhwaland, manhwalist, etc.)';
COMMENT ON TABLE source_domains IS 'Mirror domains per source for rotation when CDN is blocked';
COMMENT ON COLUMN sources.theme IS 'Scraper theme adapter: madara|flatsome|mangastream|wpmanga';
COMMENT ON COLUMN source_domains.priority IS 'Lower priority = tried first (1=primary, higher=fallback)';
COMMENT ON COLUMN source_domains.status IS 'healthy|degraded|down|unknown';
COMMENT ON COLUMN source_domains.auto_disabled_at IS 'When auto-rotated out due to failures';