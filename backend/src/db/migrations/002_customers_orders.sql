-- ── 002_customers_orders.sql ─────────────────────────────────────────────────
-- Customers (book buyers), orders, and per-book order items with status flow.

-- Customers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  first_name    TEXT        NOT NULL DEFAULT '',
  last_name     TEXT        NOT NULL DEFAULT '',
  refresh_token TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_number TEXT        NOT NULL UNIQUE,   -- e.g. "ORD-20250001"
  total        NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency     TEXT        NOT NULL DEFAULT 'USD',
  status       TEXT        NOT NULL DEFAULT 'paid'
                           CHECK (status IN ('pending','paid','refunded','cancelled')),
  invoice_url  TEXT,                          -- link to PDF invoice
  placed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order items (one row per book within an order) ──────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  book_id         UUID        NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  book_status     TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (book_status IN ('pending','personalized','shared','reviewed')),
  personalized_at TIMESTAMPTZ,
  shared_at       TIMESTAMPTZ,
  reviewed_at     TIMESTAMPTZ,
  review_text     TEXT,
  review_rating   INT         CHECK (review_rating BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_customer      ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_book     ON order_items(book_id);
