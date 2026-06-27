-- 044_add_import_jobs_columns.sql
-- Fix: kolom error_message & started_at tidak ada di tabel import_jobs production
-- Migration ini ADD COLUMN IF NOT EXISTS (safe to run multiple times)

-- 1. Tambah kolom yang missing (safe — IF NOT EXISTS)
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ
  DEFAULT now();

-- Update started_at untuk row lama yang NULL (pakai now() sebagai fallback)
UPDATE import_jobs
SET started_at = now()
WHERE started_at IS NULL;

-- 2. Cleanup zombie jobs (dari 043, sekarang bisa jalan karena kolom sudah ada)
--    Zombie = running, total_items 0, dan sudah > 30 menit
UPDATE import_jobs
SET status = 'failed',
    completed_at = now(),
    error_message = 'Auto-cleanup: zombie job (stuck due to after() bug)'
WHERE status = 'running'
  AND total_items = 0
  AND started_at < now() - interval '30 minutes';

-- 3. Job running > 1 jam juga di-fail (timeout)
UPDATE import_jobs
SET status = 'failed',
    completed_at = now(),
    error_message = 'Auto-cleanup: job timed out (>1 hour)'
WHERE status = 'running'
  AND started_at < now() - interval '1 hour';

-- 4. Job running yang punya total_items > 0 tapi processed < total,
--    dan sudah > 2 jam → mark sebagai completed (partial success)
UPDATE import_jobs
SET status = 'completed',
    completed_at = coalesce(completed_at, now()),
    error_message = 'Auto-cleanup: forced complete (>2 hours)'
WHERE status = 'running'
  AND total_items > 0
  AND started_at < now() - interval '2 hours';

-- 5. Verify: count jobs by status
SELECT status, count(*) as total
FROM import_jobs
GROUP BY status
ORDER BY status;