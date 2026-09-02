const express = require('express');
const db      = require('../db');

const router = express.Router();

// ── GET /api/v1/public/books/:slug  ──────────────────────────────────────────
// Returns the full book data for the public viewer. No auth required.
// Returns 404 if the book is not published or doesn't exist.
router.get('/books/:slug', async (req, res) => {
  const { rows: [book] } = await db.query(
    `SELECT * FROM books WHERE slug = $1 AND status = 'published'`,
    [req.params.slug]
  );
  if (!book) return res.status(404).json({ error: 'Book not found' });

  // Fetch all pages with their elements
  const { rows: pages } = await db.query(
    'SELECT * FROM pages WHERE book_id = $1 ORDER BY page_number',
    [book.id]
  );

  const pageIds = pages.map(p => p.id);
  let elements = [];
  if (pageIds.length) {
    const { rows } = await db.query(
      'SELECT * FROM elements WHERE page_id = ANY($1) ORDER BY page_id, layer, z_index',
      [pageIds]
    );
    elements = rows;
  }

  // Group elements by page_id for convenience
  const elementsByPage = {};
  for (const el of elements) {
    if (!elementsByPage[el.page_id]) elementsByPage[el.page_id] = [];
    elementsByPage[el.page_id].push(el);
  }

  // Fetch custom fonts uploaded by this book's owner
  const { rows: customFonts } = await db.query(
    'SELECT family, storage_key FROM fonts WHERE admin_id = $1 ORDER BY family',
    [book.admin_id]
  );

  res.json({
    ...book,
    custom_fonts: customFonts.map(f => ({ family: f.family, url: `/uploads/${f.storage_key}` })),
    pages: pages.map(p => ({
      ...p,
      elements: elementsByPage[p.id] || [],
    })),
  });
});

// ── GET /api/v1/public/books/:slug/read-aloud ─────────────────────────────────
// Returns page texts for the Read Aloud reader. Book must be published.
router.get('/books/:slug/read-aloud', async (req, res) => {
  const { rows: [book] } = await db.query(
    `SELECT id, title, slug, orientation FROM books WHERE slug = $1`,
    [req.params.slug]
  );
  if (!book) return res.status(404).json({ error: 'Book not found' });

  const { rows: pages } = await db.query(
    `SELECT id, page_number, read_aloud_text, read_aloud_audio
     FROM pages WHERE book_id = $1 ORDER BY page_number`,
    [book.id]
  );

  res.json({ ...book, pages });
});

module.exports = router;
