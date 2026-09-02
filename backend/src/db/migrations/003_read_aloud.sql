-- ── 003_read_aloud.sql ───────────────────────────────────────────────────────
-- Add read-aloud text storage to pages.

ALTER TABLE pages ADD COLUMN IF NOT EXISTS read_aloud_text TEXT NOT NULL DEFAULT '';
