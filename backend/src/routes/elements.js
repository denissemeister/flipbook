const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Helper: verify a page belongs to the authenticated admin
async function getPage(pageId, adminId) {
  const { rows } = await db.query(
    `SELECT p.id FROM pages p
     JOIN books b ON b.id = p.book_id
     WHERE p.id = $1 AND b.admin_id = $2`,
    [pageId, adminId]
  );
  return rows[0] || null;
}

// ── GET /api/v1/pages/:pageId/elements  ───────────────────────────────────────
router.get('/pages/:pageId/elements', async (req, res) => {
  if (!await getPage(req.params.pageId, req.admin.id)) {
    return res.status(404).json({ error: 'Page not found' });
  }
  const { rows } = await db.query(
    'SELECT * FROM elements WHERE page_id = $1 ORDER BY layer, z_index',
    [req.params.pageId]
  );
  res.json(rows);
});

// ── POST /api/v1/pages/:pageId/elements  ─────────────────────────────────────
router.post('/pages/:pageId/elements', async (req, res) => {
  if (!await getPage(req.params.pageId, req.admin.id)) {
    return res.status(404).json({ error: 'Page not found' });
  }

  const {
    layer = 2, type, props = {},
    col_start = 0, row_start = 0,
    col_span = 0.4, row_span = 0.3,
    z_index = 0,
  } = req.body;

  if (!type) return res.status(400).json({ error: 'type is required' });

  const { rows } = await db.query(
    `INSERT INTO elements (page_id, layer, type, col_start, row_start, col_span, row_span, z_index, props)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [req.params.pageId, layer, type, col_start, row_start, col_span, row_span, z_index, JSON.stringify(props)]
  );
  res.status(201).json(rows[0]);
});

// ── PATCH /api/v1/elements/:id  ───────────────────────────────────────────────
router.patch('/elements/:id', async (req, res) => {
  // Verify ownership via JOIN
  const { rows: [el] } = await db.query(
    `SELECT e.* FROM elements e
     JOIN pages p ON p.id = e.page_id
     JOIN books b ON b.id = p.book_id
     WHERE e.id = $1 AND b.admin_id = $2`,
    [req.params.id, req.admin.id]
  );
  if (!el) return res.status(404).json({ error: 'Element not found' });

  const allowed = ['layer', 'type', 'col_start', 'row_start', 'col_span', 'row_span', 'z_index', 'props'];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  if (updates.props) updates.props = JSON.stringify(updates.props);

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const sets = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
  const vals = Object.values(updates);

  const { rows } = await db.query(
    `UPDATE elements SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${vals.length + 1} RETURNING *`,
    [...vals, req.params.id]
  );
  res.json(rows[0]);
});

// ── DELETE /api/v1/elements/:id  ──────────────────────────────────────────────
router.delete('/elements/:id', async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM elements e
     USING pages p, books b
     WHERE e.id = $1 AND e.page_id = p.id AND p.book_id = b.id AND b.admin_id = $2`,
    [req.params.id, req.admin.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Element not found' });
  res.json({ ok: true });
});

// ── POST /api/v1/pages/:pageId/elements/batch  ────────────────────────────────
// Full replace — syncs the DB to exactly the elements array sent.
// Deletes any elements on the page not present in the array, then upserts the rest.
// Body: { elements: [ { id?, layer, type, col_start, row_start, col_span, row_span, z_index, props } ] }
router.post('/pages/:pageId/elements/batch', async (req, res) => {
  if (!await getPage(req.params.pageId, req.admin.id)) {
    return res.status(404).json({ error: 'Page not found' });
  }

  const elements = req.body.elements;
  if (!Array.isArray(elements)) {
    return res.status(400).json({ error: 'elements must be an array' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Delete elements that are no longer in the batch
    const keptIds = elements.map(el => el.id).filter(Boolean);
    if (keptIds.length > 0) {
      await client.query(
        `DELETE FROM elements WHERE page_id = $1 AND id != ALL($2::uuid[])`,
        [req.params.pageId, keptIds]
      );
    } else {
      // No existing elements kept — clear the page
      await client.query('DELETE FROM elements WHERE page_id = $1', [req.params.pageId]);
    }

    // Upsert each element
    const results = [];
    for (const el of elements) {
      if (el.id) {
        const { rows } = await client.query(
          `UPDATE elements
           SET layer=$1, type=$2, col_start=$3, row_start=$4, col_span=$5, row_span=$6,
               z_index=$7, props=$8, updated_at=now()
           WHERE id=$9 AND page_id=$10
           RETURNING *`,
          [el.layer, el.type, el.col_start, el.row_start, el.col_span, el.row_span,
           el.z_index || 0, JSON.stringify(el.props || {}), el.id, req.params.pageId]
        );
        results.push(rows[0] ?? null);
      } else {
        const { rows } = await client.query(
          `INSERT INTO elements (page_id, layer, type, col_start, row_start, col_span, row_span, z_index, props)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [req.params.pageId, el.layer, el.type, el.col_start, el.row_start,
           el.col_span, el.row_span, el.z_index || 0, JSON.stringify(el.props || {})]
        );
        results.push(rows[0]);
      }
    }

    await client.query('COMMIT');
    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
