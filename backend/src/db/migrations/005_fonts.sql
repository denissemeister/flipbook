CREATE TABLE IF NOT EXISTS fonts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  family      TEXT NOT NULL,
  filename    TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INT  NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
