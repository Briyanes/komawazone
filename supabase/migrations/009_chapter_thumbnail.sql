-- Add thumbnail_url column to chapters table
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
