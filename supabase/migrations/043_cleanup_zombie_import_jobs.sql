-- 043_cleanup_zombie_import_jobs.sql
-- Cleanup zombie import jobs yang stuck di "running" 0/0
-- Penyebab: route manga-chapters menggunakan after() yang tidak reliable di serverless

-- 1. Mark semua zombie jobs sebagai "failed"
--    Zombie = running, total_items 0, dan sudah berjalan > 30 menit
UPDATE import_jobs
SET status = 'failed',
    completed_at = now(),
    error_message = 'Auto-cleanup: zombie job (stuck due to after() bug)'
WHERE status = 'running'
  AND total_items = 0
  AND started_at < now() - interval '30 minutes';

-- 2. Job yang running > 1 jam juga di-fail (timeout)
UPDATE import_jobs
SET status = 'failed',
    completed_at = now(),
    error_message = 'Auto-cleanup: job timed out (>1 hour)'
WHERE status = 'running'
  AND started_at < now() - interval '1 hour';

-- 3. Job running yang punya total_items > 0 tapi processed < total,
--    dan sudah > 2 jam → mark sebagai completed (partial success)
UPDATE import_jobs
SET status = 'completed',
    completed_at = coalesce(completed_at, now()),
    error_message = 'Auto-cleanup: forced complete (>2 hours)'
WHERE status = 'running'
  AND total_items > 0
  AND started_at < now() - interval '2 hours';

-- Verify: count jobs by status
SELECT status, count(*) as total
FROM import_jobs
GROUP BY status
ORDER BY status;