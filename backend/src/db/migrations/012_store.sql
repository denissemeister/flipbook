-- ── 012_store.sql ─────────────────────────────────────────────────────────────
-- Products, bundles, discount rules, cart, and Stripe columns on orders.

-- Products ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID          NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  book_id      UUID          REFERENCES books(id) ON DELETE SET NULL,
  title        TEXT          NOT NULL,
  description  TEXT          NOT NULL DEFAULT '',
  price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  currency     TEXT          NOT NULL DEFAULT 'USD',
  cover_image  TEXT,
  status       TEXT          NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','active','archived')),
  sort_order   INT           NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Bundles ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bundles (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID          NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  title        TEXT          NOT NULL,
  description  TEXT          NOT NULL DEFAULT '',
  price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  currency     TEXT          NOT NULL DEFAULT 'USD',
  cover_image  TEXT,
  status       TEXT          NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','active','archived')),
  sort_order   INT           NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Bundle → Product join ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bundle_items (
  bundle_id  UUID NOT NULL REFERENCES bundles(id)  ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (bundle_id, product_id)
);

-- Volume discount rules ───────────────────────────────────────────────────────
-- e.g. "buy 3+, get 10% off"
CREATE TABLE IF NOT EXISTS discount_rules (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id         UUID          NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  label            TEXT          NOT NULL,
  min_quantity     INT           NOT NULL CHECK (min_quantity >= 2),
  discount_percent NUMERIC(5,2)  NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  active           BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Cart items (persisted per customer) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  UUID        REFERENCES products(id)  ON DELETE CASCADE,
  bundle_id   UUID        REFERENCES bundles(id)   ON DELETE CASCADE,
  quantity    INT         NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cart_item_xor CHECK (
    (product_id IS NOT NULL)::int + (bundle_id IS NOT NULL)::int = 1
  )
);

-- Add Stripe tracking to orders ───────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id      TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent  TEXT;

-- Add product/bundle ref to order_items ───────────────────────────────────────
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bundle_id  UUID REFERENCES bundles(id)  ON DELETE SET NULL;

-- Indexes ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_admin    ON products(admin_id);
CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
CREATE INDEX IF NOT EXISTS idx_bundles_admin     ON bundles(admin_id);
CREATE INDEX IF NOT EXISTS idx_bundles_status    ON bundles(status);
CREATE INDEX IF NOT EXISTS idx_cart_customer     ON cart_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe     ON orders(stripe_session_id);
