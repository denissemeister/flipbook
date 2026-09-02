const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { requireAuth } = require('../middleware/auth');
const { upload, checkSize, STORAGE_PATH } = require('../middleware/upload');
const db = require('../db');

const router = express.Router();

// All font routes require admin auth
router.use(requireAuth);

// ── POST /api/v1/fonts  ───────────────────────────────────────────────────────
// Upload a font file. Field name: "file"
router.post('/', upload.single('file'), checkSize, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Derive a friendly font-family name from the filename (strip extension, clean separators)
  const basename = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const family   = basename.replace(/[-_]+/g, ' ').trim();

  // Storage key is the subdir + filename, relative to STORAGE_PATH
  const storageKey = `${req._uploadSubDir}/${req.file.filename}`;

  const { rows: [font] } = await db.query(
    `INSERT INTO fonts (admin_id, family, filename, storage_key, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.admin.id, family, req.file.originalname, storageKey, req.file.mimetype, req.file.size]
  );

  res.status(201).json({ ...font, url: `/uploads/${storageKey}` });
});

// ── GET /api/v1/fonts  ────────────────────────────────────────────────────────
// List all uploaded fonts for this admin
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM fonts WHERE admin_id = $1 ORDER BY family',
    [req.admin.id]
  );
  res.json(rows.map(f => ({ ...f, url: `/uploads/${f.storage_key}` })));
});

// ── PATCH /api/v1/fonts/:id  ──────────────────────────────────────────────────
// Rename the font family name
router.patch('/:id', async (req, res) => {
  const { family } = req.body;
  if (!family?.trim()) return res.status(400).json({ error: 'family is required' });

  const { rows: [font] } = await db.query(
    `UPDATE fonts SET family = $1 WHERE id = $2 AND admin_id = $3 RETURNING *`,
    [family.trim(), req.params.id, req.admin.id]
  );
  if (!font) return res.status(404).json({ error: 'Font not found' });
  res.json({ ...font, url: `/uploads/${font.storage_key}` });
});

// ── DELETE /api/v1/fonts/:id  ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { rows: [font] } = await db.query(
    'DELETE FROM fonts WHERE id = $1 AND admin_id = $2 RETURNING *',
    [req.params.id, req.admin.id]
  );
  if (!font) return res.status(404).json({ error: 'Font not found' });

  // Best-effort file delete
  const filePath = path.join(path.resolve(STORAGE_PATH), font.storage_key);
  fs.unlink(filePath, () => {});

  res.json({ ok: true });
});

module.exports = router;
