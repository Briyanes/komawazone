-- When a chapter is inserted, update the parent manga's updated_at
-- This ensures "Update Terbaru" homepage section sorts accurately by latest chapter upload

CREATE OR REPLACE FUNCTION update_manga_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE manga SET updated_at = NOW() WHERE id = NEW.manga_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_chapter_insert ON chapters;
CREATE TRIGGER on_chapter_insert
  AFTER INSERT ON chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_manga_timestamp();