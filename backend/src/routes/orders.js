const express = require('express');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router = express.Router();

// ── Customer auth middleware ───────────────────────────────────────────────────
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

// ── GET /api/v1/customer/orders ───────────────────────────────────────────────
// Returns all orders for the logged-in customer, newest first,
// with their items and book details nested.
router.get('/', async (req, res) => {
  const { rows: orders } = await db.query(
    `SELECT o.id, o.order_number, o.total, o.currency, o.status,
            o.invoice_url, o.placed_at
     FROM orders o
     WHERE o.customer_id = $1
     ORDER BY o.placed_at DESC`,
    [req.customer.sub]
  );

  if (!orders.length) return res.json([]);

  const orderIds = orders.map(o => o.id);
  const { rows: items } = await db.query(
    `SELECT oi.id, oi.order_id, oi.book_id, oi.unit_price, oi.book_status,
            oi.personalized_at, oi.shared_at, oi.reviewed_at,
            oi.review_text, oi.review_rating,
            b.title AS book_title, b.slug AS book_slug,
            b.orientation AS book_orientation
     FROM order_items oi
     JOIN books b ON b.id = oi.book_id
     WHERE oi.order_id = ANY($1::uuid[])
     ORDER BY oi.created_at`,
    [orderIds]
  );

  // Nest items under their order
  const itemsByOrder = {};
  for (const item of items) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }

  const result = orders.map(o => ({ ...o, items: itemsByOrder[o.id] || [] }));
  res.json(result);
});

// ── PATCH /api/v1/customer/order-items/:id/advance ────────────────────────────
// Advance a book's status: pending → personalized → shared → reviewed
// Body (for 'reviewed' step): { review_text, review_rating }
const NEXT_STATUS = {
  pending:      'personalized',
  personalized: 'shared',
  shared:       'reviewed',
};

router.patch('/order-items/:id/advance', async (req, res) => {
  // Verify the item belongs to this customer
  const { rows: [item] } = await db.query(
    `SELECT oi.* FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = $1 AND o.customer_id = $2`,
    [req.params.id, req.customer.sub]
  );
  if (!item) return res.status(404).json({ error: 'Order item not found' });
  if (!NEXT_STATUS[item.book_status]) {
    return res.status(422).json({ error: 'No further status available' });
  }

  const next = NEXT_STATUS[item.book_status];
  const now  = new Date();
  const timestampCol = { personalized: 'personalized_at', shared: 'shared_at', reviewed: 'reviewed_at' }[next];

  let extraSets = '';
  const values  = [next, now, item.id];

  if (next === 'reviewed') {
    const { review_text = '', review_rating } = req.body;
    if (!review_rating || review_rating < 1 || review_rating > 5) {
      return res.status(400).json({ error: 'review_rating (1–5) is required' });
    }
    extraSets = ', review_text = $4, review_rating = $5';
    values.push(review_text, review_rating);
  }

  const { rows: [updated] } = await db.query(
    `UPDATE order_items
     SET book_status = $1, ${timestampCol} = $2, updated_at = $2 ${extraSets}
     WHERE id = $3 RETURNING *`,
    values
  );

  res.json(updated);
});

// ── GET /api/v1/customer/orders/:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { rows: [order] } = await db.query(
    `SELECT o.* FROM orders o
     WHERE o.id = $1 AND o.customer_id = $2`,
    [req.params.id, req.customer.sub]
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { rows: items } = await db.query(
    `SELECT oi.*, b.title AS book_title, b.slug AS book_slug
     FROM order_items oi
     JOIN books b ON b.id = oi.book_id
     WHERE oi.order_id = $1 ORDER BY oi.created_at`,
    [order.id]
  );

  res.json({ ...order, items });
});

module.exports = router;
