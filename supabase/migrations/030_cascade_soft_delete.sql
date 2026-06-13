-- Migration 030: Auto-soft-delete chapters when manga is soft-deleted
-- Prevents orphaned chapters (chapters with active status when parent manga is deleted)

-- Function: cascade soft-delete to chapters when manga.deleted_at is set
CREATE OR REPLACE FUNCTION cascade_manga_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when deleted_at changes from NULL to a value
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Soft-delete all active chapters for this manga
    UPDATE chapters
    SET deleted_at = NEW.deleted_at
    WHERE manga_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: fires AFTER UPDATE on manga table
DROP TRIGGER IF EXISTS trigger_cascade_manga_soft_delete ON manga;
CREATE TRIGGER trigger_cascade_manga_soft_delete
  AFTER UPDATE OF deleted_at ON manga
  FOR EACH ROW
  EXECUTE FUNCTION cascade_manga_soft_delete();
</path>supabase/migrations/030_cascade_soft_delete.sql