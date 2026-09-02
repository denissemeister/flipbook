const express = require('express');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');
const { requireAuth }                    = require('../middleware/auth');
const { upload, checkSize, STORAGE_PATH } = require('../middleware/upload');

const router = express.Router();
router.use(requireAuth);

// Helper: verify book belongs to the authenticated admin
async function getBook(bookId, adminId) {
  const { rows } = await db.query(
    'SELECT id FROM books WHERE id = $1 AND admin_id = $2', [bookId, adminId]
  );
  return rows[0] || null;
}

// ── GET /api/v1/books/:bookId/pages  ──────────────────────────────────────────
router.get('/books/:bookId/pages', async (req, res) => {
  if (!await getBook(req.params.bookId, req.admin.id)) {
    return res.status(404).json({ error: 'Book not found' });
  }
  const { rows } = await db.query(
    `SELECT p.*,
       count(e.id)::int AS element_count
     FROM pages p
     LEFT JOIN elements e ON e.page_id = p.id
     WHERE p.book_id = $1
     GROUP BY p.id
     ORDER BY p.page_number`,
    [req.params.bookId]
  );
  res.json(rows);
});

// ── POST /api/v1/books/:bookId/pages  ─────────────────────────────────────────
router.post('/books/:bookId/pages', async (req, res) => {
  if (!await getBook(req.params.bookId, req.admin.id)) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Enforce 100-page limit
  const { rows: [{ count }] } = await db.query(
    'SELECT count(*)::int FROM pages WHERE book_id = $1', [req.params.bookId]
  );
  if (count >= 100) return res.status(422).json({ error: 'Maximum 100 pages per book' });

  // Place the new page after the last existing page
  const { rows: [{ max }] } = await db.query(
    'SELECT coalesce(max(page_number), 0) AS max FROM pages WHERE book_id = $1',
    [req.params.bookId]
  );

  const { rows } = await db.query(
    'INSERT INTO pages (book_id, page_number) VALUES ($1, $2) RETURNING *',
    [req.params.bookId, max + 1]
  );
  res.status(201).json(rows[0]);
});

// ── DELETE /api/v1/books/:bookId/pages/:pageId  ───────────────────────────────
router.delete('/books/:bookId/pages/:pageId', async (req, res) => {
  if (!await getBook(req.params.bookId, req.admin.id)) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const { rowCount } = await db.query(
    'DELETE FROM pages WHERE id = $1 AND book_id = $2',
    [req.params.pageId, req.params.bookId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Page not found' });

  // Reorder remaining pages to close the gap
  await db.query(
    `UPDATE pages SET page_number = sub.rn
     FROM (
       SELECT id, row_number() OVER (ORDER BY page_number) AS rn
       FROM pages WHERE book_id = $1
     ) sub
     WHERE pages.id = sub.id`,
    [req.params.bookId]
  );

  res.json({ ok: true });
});

// ── POST /api/v1/books/:bookId/pages/:pageId/duplicate ───────────────────────
// Clone a page (with all its elements) immediately after the original.
router.post('/books/:bookId/pages/:pageId/duplicate', async (req, res) => {
  if (!await getBook(req.params.bookId, req.admin.id)) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [srcPage] } = await client.query(
      'SELECT * FROM pages WHERE id = $1 AND book_id = $2',
      [req.params.pageId, req.params.bookId]
    );
    if (!srcPage) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Page not found' });
    }

    const { rows: [{ count }] } = await client.query(
      'SELECT count(*)::int FROM pages WHERE book_id = $1', [req.params.bookId]
    );
    if (count >= 100) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Maximum 100 pages per book' });
    }

    // Shift all pages after the source page up by 1
    await client.query(
      `UPDATE pages SET page_number = page_number + 1
       WHERE book_id = $1 AND page_number > $2`,
      [req.params.bookId, srcPage.page_number]
    );

    // Insert duplicate immediately after source
    const { rows: [newPage] } = await client.query(
      'INSERT INTO pages (book_id, page_number) VALUES ($1, $2) RETURNING *',
      [req.params.bookId, srcPage.page_number + 1]
    );

    // Copy all elements
    const { rows: elements } = await client.query(
      'SELECT * FROM elements WHERE page_id = $1', [srcPage.id]
    );
    for (const el of elements) {
      await client.query(
        `INSERT INTO elements (page_id, layer, type, col_start, row_start, col_span, row_span, z_index, props)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [newPage.id, el.layer, el.type, el.col_start, el.row_start, el.col_span, el.row_span, el.z_index, el.props]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(newPage);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── PATCH /api/v1/books/:bookId/pages/:pageId/reorder  ───────────────────────
// Move a page to a new page_number; shift the others to accommodate.
router.patch('/books/:bookId/pages/:pageId/reorder', async (req, res) => {
  const { page_number: newNum } = req.body;
  if (!newNum || newNum < 1 || newNum > 100) {
    return res.status(400).json({ error: 'page_number must be between 1 and 100' });
  }
  if (!await getBook(req.params.bookId, req.admin.id)) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [page] } = await client.query(
      'SELECT * FROM pages WHERE id = $1 AND book_id = $2',
      [req.params.pageId, req.params.bookId]
    );
    if (!page) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Page not found' }); }

    const oldNum = page.page_number;
    if (oldNum === newNum) { await client.query('ROLLBACK'); return res.json(page); }

    // Temporarily move page out of the way
    await client.query('UPDATE pages SET page_number = 0 WHERE id = $1', [page.id]);

    if (newNum > oldNum) {
      await client.query(
        `UPDATE pages SET page_number = page_number - 1
         WHERE book_id = $1 AND page_number > $2 AND page_number <= $3`,
        [req.params.bookId, oldNum, newNum]
      );
    } else {
      await client.query(
        `UPDATE pages SET page_number = page_number + 1
         WHERE book_id = $1 AND page_number >= $2 AND page_number < $3`,
        [req.params.bookId, newNum, oldNum]
      );
    }

    const { rows } = await client.query(
      'UPDATE pages SET page_number = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [newNum, page.id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── PATCH /api/v1/books/:bookId/pages/:pageId/read-aloud ──────────────────────
// Save read-aloud text and/or audio URL for a single page.
router.patch('/books/:bookId/pages/:pageId/read-aloud', async (req, res) => {
  if (!await getBook(req.params.bookId, req.admin.id)) {
    return res.status(404).json({ error: 'Book not found' });
  }
  const { read_aloud_text, read_aloud_audio } = req.body;

  // Build update dynamically — only update fields that were sent
  const sets   = [];
  const values = [];
  if (read_aloud_text !== undefined) { sets.push(`read_aloud_text = $${sets.length + 1}`); values.push(read_aloud_text); }
  if (read_aloud_audio !== undefined) { sets.push(`read_aloud_audio = $${sets.length + 1}`); values.push(read_aloud_audio); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  const { rows: [page] } = await db.query(
    `UPDATE pages SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length + 1} AND book_id = $${values.length + 2} RETURNING *`,
    [...values, req.params.pageId, req.params.bookId]
  );
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json(page);
});

// ── POST /api/v1/books/:bookId/pages/:pageId/read-aloud-audio ─────────────────
// Upload an audio file for a page. Replaces any existing audio.
router.post('/books/:bookId/pages/:pageId/read-aloud-audio',
  upload.single('audio'), checkSize,
  async (req, res) => {
    if (!await getBook(req.params.bookId, req.admin.id)) {
      return res.status(404).json({ error: 'Book not found' });
    }
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const audioUrl = `/uploads/${req._uploadSubDir}/${req.file.filename}`;

    // Fetch existing audio path so we can delete the old file
    const { rows: [page] } = await db.query(
      'SELECT read_aloud_audio FROM pages WHERE id = $1 AND book_id = $2',
      [req.params.pageId, req.params.bookId]
    );
    if (!page) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Page not found' });
    }

    // Delete old audio file from disk
    if (page.read_aloud_audio) {
      const oldPath = path.join(STORAGE_PATH, page.read_aloud_audio.replace('/uploads/', ''));
      try { fs.unlinkSync(oldPath); } catch {}
    }

    const { rows: [updated] } = await db.query(
      `UPDATE pages SET read_aloud_audio = $1, updated_at = now()
       WHERE id = $2 AND book_id = $3 RETURNING *`,
      [audioUrl, req.params.pageId, req.params.bookId]
    );
    res.json(updated);
  }
);

// ── DELETE /api/v1/books/:bookId/pages/:pageId/read-aloud-audio ───────────────
// Remove the audio file from a page.
router.delete('/books/:bookId/pages/:pageId/read-aloud-audio', async (req, res) => {
  if (!await getBook(req.params.bookId, req.admin.id)) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const { rows: [page] } = await db.query(
    'SELECT read_aloud_audio FROM pages WHERE id = $1 AND book_id = $2',
    [req.params.pageId, req.params.bookId]
  );
  if (!page) return res.status(404).json({ error: 'Page not found' });

  if (page.read_aloud_audio) {
    const filePath = path.join(STORAGE_PATH, page.read_aloud_audio.replace('/uploads/', ''));
    try { fs.unlinkSync(filePath); } catch {}
  }

  await db.query(
    `UPDATE pages SET read_aloud_audio = NULL, updated_at = now()
     WHERE id = $1 AND book_id = $2`,
    [req.params.pageId, req.params.bookId]
  );
  res.json({ ok: true });
});

module.exports = router;
