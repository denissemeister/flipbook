const express = require('express');
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp');
const db      = require('../db');
const { requireAuth }        = require('../middleware/auth');
const { upload, checkSize, STORAGE_PATH } = require('../middleware/upload');

const router = express.Router();
router.use(requireAuth);

// ── POST /api/v1/media/upload  ────────────────────────────────────────────────
router.post('/upload', upload.single('file'), checkSize, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const file = req.file;
  const sub  = req._uploadSubDir || 'misc';

  // storage_key is the path relative to STORAGE_PATH
  const storageKey = `${sub}/${file.filename}`;

  let width = null, height = null, durationMs = null, thumbnailKey = null;

  // Generate thumbnail for images
  if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
    try {
      const thumbName = `thumb-${file.filename.replace(/\.[^.]+$/, '.webp')}`;
      const thumbDir  = path.join(STORAGE_PATH, 'thumbnails');
      fs.mkdirSync(thumbDir, { recursive: true });
      const thumbPath = path.join(thumbDir, thumbName);

      const meta = await sharp(file.path)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumbPath);

      width        = meta.width;
      height       = meta.height;
      thumbnailKey = `thumbnails/${thumbName}`;

      // Get original dimensions too
      const orig = await sharp(file.path).metadata();
      width  = orig.width  || width;
      height = orig.height || height;
    } catch (err) {
      console.warn('Thumbnail generation failed:', err.message);
    }
  }

  const { rows } = await db.query(
    `INSERT INTO media_assets
       (admin_id, original_filename, storage_key, mime_type, size_bytes, width, height, duration_ms, thumbnail_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [req.admin.id, file.originalname, storageKey, file.mimetype,
     file.size, width, height, durationMs, thumbnailKey]
  );

  const asset = rows[0];
  res.status(201).json({
    ...asset,
    url:          `/uploads/${asset.storage_key}`,
    thumbnailUrl: asset.thumbnail_key ? `/uploads/${asset.thumbnail_key}` : null,
  });
});

// ── GET /api/v1/media  ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { type } = req.query; // optional: 'image', 'video', 'audio'
  let query = 'SELECT * FROM media_assets WHERE admin_id = $1';
  const params = [req.admin.id];

  if (type) {
    query += ' AND mime_type LIKE $2';
    params.push(`${type}/%`);
  }

  query += ' ORDER BY created_at DESC';
  const { rows } = await db.query(query, params);

  res.json(rows.map(a => ({
    ...a,
    url:          `/uploads/${a.storage_key}`,
    thumbnailUrl: a.thumbnail_key ? `/uploads/${a.thumbnail_key}` : null,
  })));
});

// ── DELETE /api/v1/media/:id  ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { rows: [asset] } = await db.query(
    'SELECT * FROM media_assets WHERE id = $1 AND admin_id = $2',
    [req.params.id, req.admin.id]
  );
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  // Prevent deletion if referenced by any element
  const { rows: refs } = await db.query(
    `SELECT 1 FROM elements WHERE props->>'mediaId' = $1 LIMIT 1`,
    [req.params.id]
  );
  if (refs.length) {
    return res.status(409).json({ error: 'Asset is in use by one or more elements' });
  }

  // Delete files from disk
  const del = (key) => {
    if (!key) return;
    try { fs.unlinkSync(path.join(STORAGE_PATH, key)); } catch {}
  };
  del(asset.storage_key);
  del(asset.thumbnail_key);

  await db.query('DELETE FROM media_assets WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
