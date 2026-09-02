const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { nanoid } = require('nanoid');
const db       = require('../db');
const { requireAuth }                    = require('../middleware/auth');
const { upload, checkSize, STORAGE_PATH } = require('../middleware/upload');

const router = express.Router();
router.use(requireAuth);

// Helper: kebab-case title → URL slug
function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ── GET /api/v1/books  ────────────────────────────────────────────────────────
// List all books for the logged-in admin (all statuses).
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*,
       (SELECT count(*)::int FROM pages p WHERE p.book_id = b.id) AS page_count
     FROM books b
     WHERE b.admin_id = $1
     ORDER BY b.updated_at DESC`,
    [req.admin.id]
  );
  res.json(rows);
});

// ── POST /api/v1/books  ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, orientation = 'horizontal', autoplay = false, autoplay_interval_ms = 5000 } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  const { rows } = await db.query(
    `INSERT INTO books (admin_id, title, orientation, autoplay, autoplay_interval_ms)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [req.admin.id, title.trim(), orientation, autoplay, autoplay_interval_ms]
  );
  res.status(201).json(rows[0]);
});

// ── GET /api/v1/books/:id  ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*,
       json_agg(p ORDER BY p.page_number) FILTER (WHERE p.id IS NOT NULL) AS pages
     FROM books b
     LEFT JOIN pages p ON p.book_id = b.id
     WHERE b.id = $1 AND b.admin_id = $2
     GROUP BY b.id`,
    [req.params.id, req.admin.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Book not found' });
  res.json(rows[0]);
});

// ── PATCH /api/v1/books/:id  ──────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const allowed = ['title', 'orientation', 'autoplay', 'autoplay_interval_ms', 'preview_video_url'];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const sets  = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
  const vals  = Object.values(updates);
  const idx   = vals.length;

  const { rows } = await db.query(
    `UPDATE books SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${idx + 1} AND admin_id = $${idx + 2}
     RETURNING *`,
    [...vals, req.params.id, req.admin.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Book not found' });
  res.json(rows[0]);
});

// ── DELETE /api/v1/books/:id  ─────────────────────────────────────────────────
// Only draft books can be deleted.
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM books WHERE id = $1 AND admin_id = $2 AND status = 'draft'`,
    [req.params.id, req.admin.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Draft book not found' });
  res.json({ ok: true });
});

// ── POST /api/v1/books/:id/publish  ──────────────────────────────────────────
router.post('/:id/publish', async (req, res) => {
  // Check the book exists and belongs to this admin
  const { rows: [book] } = await db.query(
    'SELECT * FROM books WHERE id = $1 AND admin_id = $2',
    [req.params.id, req.admin.id]
  );
  if (!book) return res.status(404).json({ error: 'Book not found' });

  // Generate slug on first publish only
  const slug = book.slug || `${toSlug(book.title)}-${nanoid(4)}`;

  const { rows } = await db.query(
    `UPDATE books
     SET status = 'published', slug = $1, published_at = now(), updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [slug, book.id]
  );
  res.json(rows[0]);
});

// ── POST /api/v1/books/:id/archive  ──────────────────────────────────────────
router.post('/:id/archive', async (req, res) => {
  const { rows } = await db.query(
    `UPDATE books SET status = 'archived', updated_at = now()
     WHERE id = $1 AND admin_id = $2
     RETURNING *`,
    [req.params.id, req.admin.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Book not found' });
  res.json(rows[0]);
});

// ── POST /api/v1/books/:id/duplicate  ────────────────────────────────────────
router.post('/:id/duplicate', async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Fetch original book
    const { rows: [src] } = await client.query(
      'SELECT * FROM books WHERE id = $1 AND admin_id = $2',
      [req.params.id, req.admin.id]
    );
    if (!src) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Book not found' }); }

    // Create the new book
    const { rows: [newBook] } = await client.query(
      `INSERT INTO books (admin_id, title, orientation, autoplay, autoplay_interval_ms)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.admin.id, `Copy of ${src.title}`, src.orientation, src.autoplay, src.autoplay_interval_ms]
    );

    // Copy pages + elements
    const { rows: pages } = await client.query(
      'SELECT * FROM pages WHERE book_id = $1 ORDER BY page_number', [src.id]
    );
    for (const page of pages) {
      const { rows: [newPage] } = await client.query(
        'INSERT INTO pages (book_id, page_number) VALUES ($1, $2) RETURNING id',
        [newBook.id, page.page_number]
      );
      const { rows: elements } = await client.query(
        'SELECT * FROM elements WHERE page_id = $1', [page.id]
      );
      for (const el of elements) {
        await client.query(
          `INSERT INTO elements (page_id, layer, type, col_start, row_start, col_span, row_span, z_index, props)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [newPage.id, el.layer, el.type, el.col_start, el.row_start, el.col_span, el.row_span, el.z_index, el.props]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(newBook);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── POST /api/v1/books/:id/pages/:pageId/read-aloud-audio ─────────────────────
router.post('/:id/pages/:pageId/read-aloud-audio',
  upload.single('audio'), checkSize,
  async (req, res) => {
    const { rows: [book] } = await db.query(
      'SELECT id FROM books WHERE id = $1 AND admin_id = $2',
      [req.params.id, req.admin.id]
    );
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const audioUrl = `/uploads/${req._uploadSubDir}/${req.file.filename}`;

    const { rows: [page] } = await db.query(
      'SELECT read_aloud_audio FROM pages WHERE id = $1 AND book_id = $2',
      [req.params.pageId, req.params.id]
    );
    if (!page) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Page not found' });
    }

    // Delete old audio file if one exists
    if (page.read_aloud_audio) {
      const oldPath = path.join(STORAGE_PATH, page.read_aloud_audio.replace('/uploads/', ''));
      try { fs.unlinkSync(oldPath); } catch {}
    }

    const { rows: [updated] } = await db.query(
      `UPDATE pages SET read_aloud_audio = $1, updated_at = now()
       WHERE id = $2 AND book_id = $3 RETURNING *`,
      [audioUrl, req.params.pageId, req.params.id]
    );
    res.json(updated);
  }
);

// ── DELETE /api/v1/books/:id/pages/:pageId/read-aloud-audio ──────────────────
router.delete('/:id/pages/:pageId/read-aloud-audio', async (req, res) => {
  const { rows: [book] } = await db.query(
    'SELECT id FROM books WHERE id = $1 AND admin_id = $2',
    [req.params.id, req.admin.id]
  );
  if (!book) return res.status(404).json({ error: 'Book not found' });

  const { rows: [page] } = await db.query(
    'SELECT read_aloud_audio FROM pages WHERE id = $1 AND book_id = $2',
    [req.params.pageId, req.params.id]
  );
  if (!page) return res.status(404).json({ error: 'Page not found' });

  if (page.read_aloud_audio) {
    const filePath = path.join(STORAGE_PATH, page.read_aloud_audio.replace('/uploads/', ''));
    try { fs.unlinkSync(filePath); } catch {}
  }

  await db.query(
    `UPDATE pages SET read_aloud_audio = NULL, updated_at = now()
     WHERE id = $1 AND book_id = $2`,
    [req.params.pageId, req.params.id]
  );
  res.json({ ok: true });
});

module.exports = router;
