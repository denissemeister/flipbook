// ── Public store routes — no authentication required ──────────────────────────
const express = require('express');
const db      = require('../db');

const router = express.Router();

// ── GET /api/v1/store/products ────────────────────────────────────────────────
// List all active products (public).
router.get('/products', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.id, p.title, p.description, p.price, p.currency,
            p.cover_image, p.sort_order,
            b.id AS book_id, b.title AS book_title, b.orientation
     FROM products p
     LEFT JOIN books b ON b.id = p.book_id
     WHERE p.status = 'active'
     ORDER BY p.sort_order, p.created_at`,
  );
  res.json(rows);
});

// ── GET /api/v1/store/products/:id ───────────────────────────────────────────
router.get('/products/:id', async (req, res) => {
  const { rows: [product] } = await db.query(
    `SELECT p.id, p.title, p.description, p.price, p.currency,
            p.cover_image, p.sort_order,
            b.id AS book_id, b.title AS book_title, b.orientation, b.slug AS book_slug
     FROM products p
     LEFT JOIN books b ON b.id = p.book_id
     WHERE p.id = $1 AND p.status = 'active'`,
    [req.params.id]
  );
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// ── GET /api/v1/store/bundles ─────────────────────────────────────────────────
router.get('/bundles', async (req, res) => {
  const { rows: bundles } = await db.query(
    `SELECT id, title, description, price, currency, cover_image, sort_order
     FROM bundles WHERE status = 'active'
     ORDER BY sort_order, created_at`,
  );
  if (!bundles.length) return res.json([]);

  // Attach products for each bundle
  const bundleIds = bundles.map(b => b.id);
  const { rows: items } = await db.query(
    `SELECT bi.bundle_id, p.id, p.title, p.price, p.cover_image
     FROM bundle_items bi
     JOIN products p ON p.id = bi.product_id
     WHERE bi.bundle_id = ANY($1::uuid[])`,
    [bundleIds]
  );
  const byBundle = {};
  for (const item of items) {
    if (!byBundle[item.bundle_id]) byBundle[item.bundle_id] = [];
    byBundle[item.bundle_id].push(item);
  }
  res.json(bundles.map(b => ({ ...b, products: byBundle[b.id] || [] })));
});

// ── GET /api/v1/store/discounts ───────────────────────────────────────────────
// Returns active volume discount tiers (used on frontend to show the discount badge).
router.get('/discounts', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, label, min_quantity, discount_percent
     FROM discount_rules WHERE active = true
     ORDER BY min_quantity`,
  );
  res.json(rows);
});

module.exports = router;
