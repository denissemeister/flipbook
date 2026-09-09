// ── Cart routes — requires customer auth ──────────────────────────────────────
const express = require('express');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router = express.Router();

function requireCustomer(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'customer') return res.status(403).json({ error: 'Forbidden' });
    req.customer = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.use(requireCustomer);

// Helper: compute cart totals with volume discount
async function getCartWithTotals(customerId) {
  const { rows: items } = await db.query(
    `SELECT
       ci.id, ci.quantity, ci.added_at,
       ci.product_id, ci.bundle_id,
       CASE WHEN ci.product_id IS NOT NULL
         THEN p.title ELSE b.title END AS title,
       CASE WHEN ci.product_id IS NOT NULL
         THEN p.price ELSE b.price END AS unit_price,
       CASE WHEN ci.product_id IS NOT NULL
         THEN p.cover_image ELSE b.cover_image END AS cover_image,
       CASE WHEN ci.product_id IS NOT NULL
         THEN 'product' ELSE 'bundle' END AS item_type
     FROM cart_items ci
     LEFT JOIN products p ON p.id = ci.product_id
     LEFT JOIN bundles  b ON b.id = ci.bundle_id
     WHERE ci.customer_id = $1
     ORDER BY ci.added_at`,
    [customerId]
  );

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + parseFloat(i.unit_price) * i.quantity, 0);

  // Find best applicable discount
  const { rows: rules } = await db.query(
    `SELECT min_quantity, discount_percent FROM discount_rules
     WHERE active = true AND min_quantity <= $1
     ORDER BY min_quantity DESC LIMIT 1`,
    [totalQty]
  );
  const discountPct = rules[0] ? parseFloat(rules[0].discount_percent) : 0;
  const discountAmt = subtotal * (discountPct / 100);
  const total       = subtotal - discountAmt;

  return {
    items: items.map(i => ({ ...i, unit_price: parseFloat(i.unit_price) })),
    subtotal: +subtotal.toFixed(2),
    discount_percent: discountPct,
    discount_amount:  +discountAmt.toFixed(2),
    total:            +total.toFixed(2),
    currency: 'USD',
  };
}

// ── GET /api/v1/store/cart ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cart = await getCartWithTotals(req.customer.sub);
  res.json(cart);
});

// ── POST /api/v1/store/cart ───────────────────────────────────────────────────
// Body: { product_id } OR { bundle_id }, optional { quantity }
router.post('/', async (req, res) => {
  const { product_id, bundle_id, quantity = 1 } = req.body;
  if (!product_id && !bundle_id) return res.status(400).json({ error: 'product_id or bundle_id required' });
  if (product_id && bundle_id) return res.status(400).json({ error: 'Provide product_id OR bundle_id, not both' });
  if (quantity < 1) return res.status(400).json({ error: 'quantity must be >= 1' });

  // Verify item exists and is active
  if (product_id) {
    const { rows: [p] } = await db.query("SELECT id FROM products WHERE id = $1 AND status = 'active'", [product_id]);
    if (!p) return res.status(404).json({ error: 'Product not found' });
  } else {
    const { rows: [b] } = await db.query("SELECT id FROM bundles WHERE id = $1 AND status = 'active'", [bundle_id]);
    if (!b) return res.status(404).json({ error: 'Bundle not found' });
  }

  // Upsert: if item already in cart, increase quantity
  const existing = await db.query(
    `SELECT id, quantity FROM cart_items
     WHERE customer_id = $1
       AND (product_id = $2 OR (product_id IS NULL AND $2::uuid IS NULL))
       AND (bundle_id  = $3 OR (bundle_id  IS NULL AND $3::uuid IS NULL))`,
    [req.customer.sub, product_id || null, bundle_id || null]
  );

  if (existing.rows[0]) {
    const newQty = existing.rows[0].quantity + quantity;
    await db.query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [newQty, existing.rows[0].id]);
  } else {
    await db.query(
      'INSERT INTO cart_items (customer_id, product_id, bundle_id, quantity) VALUES ($1,$2,$3,$4)',
      [req.customer.sub, product_id || null, bundle_id || null, quantity]
    );
  }

  const cart = await getCartWithTotals(req.customer.sub);
  res.status(201).json(cart);
});

// ── PATCH /api/v1/store/cart/:itemId ─────────────────────────────────────────
router.patch('/:itemId', async (req, res) => {
  const { quantity } = req.body;
  if (!quantity || quantity < 1) return res.status(400).json({ error: 'quantity must be >= 1' });

  const { rowCount } = await db.query(
    'UPDATE cart_items SET quantity = $1 WHERE id = $2 AND customer_id = $3',
    [quantity, req.params.itemId, req.customer.sub]
  );
  if (!rowCount) return res.status(404).json({ error: 'Cart item not found' });

  const cart = await getCartWithTotals(req.customer.sub);
  res.json(cart);
});

// ── DELETE /api/v1/store/cart/:itemId ────────────────────────────────────────
router.delete('/:itemId', async (req, res) => {
  await db.query(
    'DELETE FROM cart_items WHERE id = $1 AND customer_id = $2',
    [req.params.itemId, req.customer.sub]
  );
  const cart = await getCartWithTotals(req.customer.sub);
  res.json(cart);
});

// ── DELETE /api/v1/store/cart ─────────────────────────────────────────────────
router.delete('/', async (req, res) => {
  await db.query('DELETE FROM cart_items WHERE customer_id = $1', [req.customer.sub]);
  res.json({ items: [], subtotal: 0, discount_percent: 0, discount_amount: 0, total: 0, currency: 'USD' });
});

module.exports = router;
