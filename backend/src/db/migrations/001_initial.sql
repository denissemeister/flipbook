-- ── Admins ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── Books ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id             UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  slug                 TEXT UNIQUE,
  orientation          TEXT NOT NULL DEFAULT 'horizontal'
                         CHECK (orientation IN ('horizontal','vertical')),
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','published','archived')),
  autoplay             BOOLEAN NOT NULL DEFAULT false,
  autoplay_interval_ms INT NOT NULL DEFAULT 5000,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  published_at         TIMESTAMPTZ
);

-- ── Pages ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_number INT NOT NULL CHECK (page_number BETWEEN 1 AND 100),
  UNIQUE (book_id, page_number),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Elements ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elements (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id   UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,

  -- Layer: 1=Background 2=Images 3=Text 4=Audio
  layer     INT NOT NULL CHECK (layer BETWEEN 1 AND 4),

  type      TEXT NOT NULL
              CHECK (type IN ('text','image','gif','video','link','audio','bg')),

  -- Position + size stored as 0.0–1.0 fractions of canvas dimensions
  col_start FLOAT NOT NULL DEFAULT 0,
  row_start FLOAT NOT NULL DEFAULT 0,
  col_span  FLOAT NOT NULL DEFAULT 0.4,
  row_span  FLOAT NOT NULL DEFAULT 0.3,

  -- Fine-grained stacking order within the same layer
  z_index   INT NOT NULL DEFAULT 0,

  -- All type-specific properties (text styles, media refs, link url, etc.)
  props     JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS elements_page_id_idx ON elements(page_id);

-- ── Media assets ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id          UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  storage_key       TEXT NOT NULL,   -- relative path under STORAGE_PATH
  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT,
  width             INT,             -- pixels (images / video)
  height            INT,
  duration_ms       INT,             -- audio / video
  thumbnail_key     TEXT,            -- relative path to generated thumbnail
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ── Migrations tracker ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);
