-- Customer voice recordings per page
CREATE TABLE IF NOT EXISTS page_recordings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  page_id       UUID NOT NULL REFERENCES pages(id)       ON DELETE CASCADE,
  storage_key   TEXT NOT NULL,
  duration_sec  INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_item_id, page_id)
);
