const express = require('express');
const path    = require('path');
const fs      = require('fs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { upload, checkSize, STORAGE_PATH } = require('../middleware/upload');

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

// ── Verify order item belongs to customer ─────────────────────────────────────
async function verifyOrderItem(customerId, orderItemId) {
  const { rows: [item] } = await db.query(
    `SELECT oi.id FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = $1 AND o.customer_id = $2`,
    [orderItemId, customerId]
  );
  return item || null;
}

// ── GET /api/v1/customer/recordings/:orderItemId ──────────────────────────────
// Returns all saved recordings for an order item.
router.get('/:orderItemId', async (req, res) => {
  const item = await verifyOrderItem(req.customer.sub, req.params.orderItemId);
  if (!item) return res.status(404).json({ error: 'Order item not found' });

  const { rows } = await db.query(
    `SELECT id, page_id, storage_key, duration_sec, created_at
     FROM page_recordings
     WHERE order_item_id = $1
     ORDER BY created_at`,
    [req.params.orderItemId]
  );

  res.json(rows.map(r => ({
    ...r,
    url: `/uploads/${r.storage_key}`,
  })));
});

// ── POST /api/v1/customer/recordings/:orderItemId/pages/:pageId ───────────────
// Upload (or replace) the customer's recording for a single page.
router.post(
  '/:orderItemId/pages/:pageId',
  upload.single('audio'),
  checkSize,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const item = await verifyOrderItem(req.customer.sub, req.params.orderItemId);
    if (!item) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Order item not found' });
    }

    const { pageId, orderItemId } = req.params;
    const storageKey  = `${req._uploadSubDir || 'audio'}/${req.file.filename}`;
    const durationSec = req.body.duration_sec ? parseInt(req.body.duration_sec, 10) : null;

    // Delete old file if replacing
    const { rows: [existing] } = await db.query(
      'SELECT storage_key FROM page_recordings WHERE order_item_id = $1 AND page_id = $2',
      [orderItemId, pageId]
    );
    if (existing) {
      const oldPath = path.join(STORAGE_PATH, existing.storage_key);
      fs.unlink(oldPath, () => {});
    }

    // Upsert
    const { rows: [rec] } = await db.query(
      `INSERT INTO page_recordings (order_item_id, page_id, storage_key, duration_sec)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (order_item_id, page_id)
       DO UPDATE SET storage_key = $3, duration_sec = $4, updated_at = NOW()
       RETURNING *`,
      [orderItemId, pageId, storageKey, durationSec]
    );

    res.json({ ...rec, url: `/uploads/${rec.storage_key}` });
  }
);

// ── DELETE /api/v1/customer/recordings/:orderItemId/pages/:pageId ─────────────
router.delete('/:orderItemId/pages/:pageId', async (req, res) => {
  const item = await verifyOrderItem(req.customer.sub, req.params.orderItemId);
  if (!item) return res.status(404).json({ error: 'Order item not found' });

  const { rows: [rec] } = await db.query(
    `DELETE FROM page_recordings
     WHERE order_item_id = $1 AND page_id = $2
     RETURNING storage_key`,
    [req.params.orderItemId, req.params.pageId]
  );
  if (rec) fs.unlink(path.join(STORAGE_PATH, rec.storage_key), () => {});
  res.status(204).end();
});

module.exports = router;
