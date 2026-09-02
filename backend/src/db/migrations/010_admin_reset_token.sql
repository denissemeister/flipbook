ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS reset_token       TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
