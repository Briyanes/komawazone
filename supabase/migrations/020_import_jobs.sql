-- 020 — Import Jobs Table for Sitemap Import Tracking
-- This migration adds job tracking for bulk import operations

-- ── 1. Create import_jobs table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL, -- 'sitemap_import', 'manual_import', 'chapter_import'
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'

  -- Progress tracking
  total_items INT NOT NULL,
  processed_items INT NOT NULL DEFAULT 0,
  new_manga INT NOT NULL DEFAULT 0,
  updated_manga INT NOT NULL DEFAULT 0,
  skipped_items INT NOT NULL DEFAULT 0,

  -- Error tracking
  errors JSONB, -- Array of { url, error, timestamp }

  -- Configuration
  config JSONB, -- Store import options: sitemapUrls, batchSize, etc.

  -- Timestamps & ownership
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- ── 2. Create indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS import_jobs_status_idx ON public.import_jobs(status);
CREATE INDEX IF NOT EXISTS import_jobs_type_idx ON public.import_jobs(job_type);
CREATE INDEX IF NOT EXISTS import_jobs_created_by_idx ON public.import_jobs(created_by);
CREATE INDEX IF NOT EXISTS import_jobs_started_at_idx ON public.import_jobs(started_at DESC);

-- ── 3. Enable Row Level Security ───────────────────────────────────────────
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Admins can view all jobs
CREATE POLICY "Admins can view all import jobs"
  ON public.import_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

-- Admins can create jobs
CREATE POLICY "Admins can create import jobs"
  ON public.import_jobs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

-- Job creators can update their own jobs
CREATE POLICY "Creators can update own jobs"
  ON public.import_jobs FOR UPDATE
  USING (auth.uid() = created_by);

-- ── 4. Add helpful comments ───────────────────────────────────────────────────
COMMENT ON TABLE public.import_jobs IS 'Tracks bulk import operations (sitemaps, manual imports) with progress and error tracking';
COMMENT ON COLUMN public.import_jobs.job_type IS 'Type of import: sitemap_import, manual_import, chapter_import';
COMMENT ON COLUMN public.import_jobs.status IS 'Job status: running, completed, failed, cancelled';
COMMENT ON COLUMN public.import_jobs.errors IS 'Array of error objects: { url, error, timestamp }';
COMMENT ON COLUMN public.import_jobs.config IS 'Import configuration options stored as JSON';

-- ── 5. Create view for job statistics ────────────────────────────────────────
CREATE OR REPLACE VIEW public.import_job_stats AS
SELECT
  job_type,
  status,
  COUNT(*) as job_count,
  AVG(total_items) as avg_total_items,
  AVG(processed_items) as avg_processed_items,
  SUM(new_manga) as total_new_manga,
  SUM(updated_manga) as total_updated_manga,
  MAX(started_at) as last_job_started
FROM public.import_jobs
GROUP BY job_type, status;

COMMENT ON VIEW public.import_job_stats IS 'Aggregated import job statistics for admin dashboard';
