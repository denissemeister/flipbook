-- Add a preview video URL to each book.
-- This video is shown on Screen 1 of the personalization wizard.
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS preview_video_url TEXT;
