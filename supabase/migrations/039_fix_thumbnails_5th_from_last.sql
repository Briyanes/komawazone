-- Migration: Fix ALL chapter thumbnails to use 5th image FROM LAST
-- Example: Chapter with 30 images → thumbnail = image #26 (30 - 5 + 1)
-- Fallback: chapters with < 5 images → use first image
--
-- This RPC runs entirely server-side (single SQL query) instead of
-- thousands of individual HTTP API calls.

CREATE OR REPLACE FUNCTION admin_fix_thumbnails_5th_from_last()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_chapters     bigint;
  v_updated_5th        bigint;
  v_updated_fallback   bigint;
  v_already_correct    bigint;
  v_skipped_no_images  bigint;
BEGIN
  -- Count total chapters
  SELECT count(*) INTO v_total_chapters FROM chapters;

  -- Build a temp table with the target thumbnail for each chapter
  -- Uses window functions to find 5th-from-last image
  CREATE TEMP TABLE _thumb_targets ON COMMIT DROP AS
  SELECT DISTINCT ON (chapter_id)
    chapter_id,
    target_url
  FROM (
    SELECT
      ci.chapter_id,
      ci.image_url AS target_url,
      ci.number,
      COUNT(*)        OVER (PARTITION BY ci.chapter_id)                    AS img_count,
      ROW_NUMBER()    OVER (PARTITION BY ci.chapter_id ORDER BY ci.number ASC)  AS rn_asc,
      ROW_NUMBER()    OVER (PARTITION BY ci.chapter_id ORDER BY ci.number DESC) AS rn_desc
    FROM chapter_images ci
  ) ranked
  WHERE
    -- If chapter has >= 5 images: pick the 5th-from-last (rn_desc = 5)
    (img_count >= 5 AND rn_desc = 5)
    -- If chapter has < 5 images: pick the first image (rn_asc = 1)
    OR (img_count < 5 AND rn_asc = 1);

  -- Count how many will use 5th-from-last target
  SELECT count(*) INTO v_updated_5th
  FROM _thumb_targets t
  JOIN chapters c ON c.id = t.chapter_id
  WHERE (
    SELECT count(*) FROM chapter_images WHERE chapter_id = t.chapter_id
  ) >= 5
  AND c.thumbnail_url IS DISTINCT FROM t.target_url;

  -- Count how many will use fallback (first image)
  SELECT count(*) INTO v_updated_fallback
  FROM _thumb_targets t
  JOIN chapters c ON c.id = t.chapter_id
  WHERE (
    SELECT count(*) FROM chapter_images WHERE chapter_id = t.chapter_id
  ) < 5
  AND c.thumbnail_url IS DISTINCT FROM t.target_url;

  -- Count already correct
  SELECT count(*) INTO v_already_correct
  FROM _thumb_targets t
  JOIN chapters c ON c.id = t.chapter_id
  WHERE c.thumbnail_url IS NOT DISTINCT FROM t.target_url;

  -- Perform the UPDATE
  UPDATE chapters c
  SET thumbnail_url = t.target_url
  FROM _thumb_targets t
  WHERE c.id = t.chapter_id
    AND c.thumbnail_url IS DISTINCT FROM t.target_url;

  -- Count chapters with no images at all
  SELECT count(*) INTO v_skipped_no_images
  FROM chapters c
  WHERE NOT EXISTS (
    SELECT 1 FROM chapter_images WHERE chapter_id = c.id
  );

  -- Cleanup
  DROP TABLE _thumb_targets;

  RETURN jsonb_build_object(
    'total_chapters',     v_total_chapters,
    'updated_5th',        v_updated_5th,
    'updated_fallback',   v_updated_fallback,
    'already_correct',    v_already_correct,
    'skipped_no_images',  v_skipped_no_images,
    'total_updated',      v_updated_5th + v_updated_fallback
  );
END;
$$;