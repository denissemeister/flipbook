// ── Admin product / bundle / discount management ──────────────────────────────
// All routes require admin JWT.

const express  = require('express');
const jwt      = require('jsonwebtoken');
const db       = require('../db');

const router = express.Router();

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.use(requireAdmin);

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/admin/products
router.get('/products', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*, b.title AS book_title
     FROM products p
     LEFT JOIN books b ON b.id = p.book_id
     WHERE p.admin_id = $1
     ORDER BY p.sort_order, p.created_at DESC`,
    [req.admin.sub]
  );
  res.json(rows);
});

// GET /api/v1/admin/products/:id
router.get('/products/:id', async (req, res) => {
  const { rows: [product] } = await db.query(
    'SELECT * FROM products WHERE id = $1 AND admin_id = $2',
    [req.params.id, req.admin.sub]
  );
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

// POST /api/v1/admin/products
router.post('/products', async (req, res) => {
  const { book_id, title, description = '', price, cover_image, status = 'draft', sort_order = 0 } = req.body;
  if (!title || price == null) return res.status(400).json({ error: 'title and price are required' });

  const { rows: [product] } = await db.query(
    `INSERT INTO products
       (admin_id, book_id, title, description, price, cover_image, status, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [req.admin.sub, book_id || null, title, description, price, cover_image || null, status, sort_order]
  );
  res.status(201).json(product);
});

// PATCH /api/v1/admin/products/:id
router.patch('/products/:id', async (req, res) => {
  const fields = ['book_id', 'title', 'description', 'price', 'cover_image', 'status', 'sort_order'];
  const updates = [];
  const vals    = [];
  let idx = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); vals.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  updates.push(`updated_at = now()`);
  vals.push(req.params.id, req.admin.sub);

  const { rows: [product] } = await db.query(
    `UPDATE products SET ${updates.join(', ')}
     WHERE id = $${idx++} AND admin_id = $${idx}
     RETURNING *`,
    vals
  );
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

// DELETE /api/v1/admin/products/:id
router.delete('/products/:id', async (req, res) => {
  await db.query('DELETE FROM products WHERE id = $1 AND admin_id = $2', [req.params.id, req.admin.sub]);
  res.status(204).end();
});

// ══════════════════════════════════════════════════════════════════════════════
// BUNDLES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/admin/bundles
router.get('/bundles', async (req, res) => {
  const { rows: bundles } = await db.query(
    'SELECT * FROM bundles WHERE admin_id = $1 ORDER BY sort_order, created_at DESC',
    [req.admin.sub]
  );
  if (!bundles.length) return res.json([]);

  const bundleIds = bundles.map(b => b.id);
  const { rows: items } = await db.query(
    `SELECT bi.bundle_id, p.id, p.title, p.price
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

// POST /api/v1/admin/bundles
router.post('/bundles', async (req, res) => {
  const { title, description = '', price, cover_image, status = 'draft', sort_order = 0, product_ids = [] } = req.body;
  if (!title || price == null) return res.status(400).json({ error: 'title and price are required' });

  const { rows: [bundle] } = await db.query(
    `INSERT INTO bundles
       (admin_id, title, description, price, cover_image, status, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [req.admin.sub, title, description, price, cover_image || null, status, sort_order]
  );

  for (const pid of product_ids) {
    await db.query('INSERT INTO bundle_items (bundle_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [bundle.id, pid]);
  }

  res.status(201).json({ ...bundle, product_ids });
});

// PATCH /api/v1/admin/bundles/:id
router.patch('/bundles/:id', async (req, res) => {
  const fields = ['title', 'description', 'price', 'cover_image', 'status', 'sort_order'];
  const updates = [];
  const vals    = [];
  let idx = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); vals.push(req.body[f]); }
  }

  if (updates.length) {
    updates.push('updated_at = now()');
    vals.push(req.params.id, req.admin.sub);
    const { rowCount } = await db.query(
      `UPDATE bundles SET ${updates.join(', ')}
       WHERE id = $${idx++} AND admin_id = $${idx}`,
      vals
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
  }

  // Replace products if provided
  if (Array.isArray(req.body.product_ids)) {
    await db.query('DELETE FROM bundle_items WHERE bundle_id = $1', [req.params.id]);
    for (const pid of req.body.product_ids) {
      await db.query('INSERT INTO bundle_items (bundle_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, pid]);
    }
  }

  const { rows: [bundle] } = await db.query('SELECT * FROM bundles WHERE id = $1', [req.params.id]);
  res.json(bundle || {});
});

// DELETE /api/v1/admin/bundles/:id
router.delete('/bundles/:id', async (req, res) => {
  await db.query('DELETE FROM bundles WHERE id = $1 AND admin_id = $2', [req.params.id, req.admin.sub]);
  res.status(204).end();
});

// ══════════════════════════════════════════════════════════════════════════════
// DISCOUNT RULES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/admin/discounts
router.get('/discounts', async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM discount_rules WHERE admin_id = $1 ORDER BY min_quantity',
    [req.admin.sub]
  );
  res.json(rows);
});

// POST /api/v1/admin/discounts
router.post('/discounts', async (req, res) => {
  const { label, min_quantity, discount_percent, active = true } = req.body;
  if (!label || !min_quantity || !discount_percent)
    return res.status(400).json({ error: 'label, min_quantity, and discount_percent are required' });

  const { rows: [rule] } = await db.query(
    `INSERT INTO discount_rules (admin_id, label, min_quantity, discount_percent, active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.admin.sub, label, min_quantity, discount_percent, active]
  );
  res.status(201).json(rule);
});

// PATCH /api/v1/admin/discounts/:id
router.patch('/discounts/:id', async (req, res) => {
  const fields = ['label', 'min_quantity', 'discount_percent', 'active'];
  const updates = [];
  const vals    = [];
  let idx = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); vals.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(req.params.id, req.admin.sub);

  const { rows: [rule] } = await db.query(
    `UPDATE discount_rules SET ${updates.join(', ')}
     WHERE id = $${idx++} AND admin_id = $${idx}
     RETURNING *`,
    vals
  );
  if (!rule) return res.status(404).json({ error: 'Not found' });
  res.json(rule);
});

// DELETE /api/v1/admin/discounts/:id
router.delete('/discounts/:id', async (req, res) => {
  await db.query('DELETE FROM discount_rules WHERE id = $1 AND admin_id = $2', [req.params.id, req.admin.sub]);
  res.status(204).end();
});

module.exports = router;
