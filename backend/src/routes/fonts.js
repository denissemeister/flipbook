const express = require('express');
const path    = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { requireAuth } = require('../middleware/auth');
const { upload, checkSize } = require('../middleware/upload');
const db = require('../db');

const router = express.Router();
router.use(requireAuth);

// ── R2 client (same config as media.js) ──────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET        = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

async function uploadToR2(key, buffer, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function deleteFromR2(key) {
  if (!key || key.startsWith('uploads/')) return; // skip old local-path keys
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.warn('R2 font delete failed:', err.message);
  }
}

function fontUrl(storageKey) {
  // Old rows stored a local path like "fonts/abc.otf" served via /uploads/
  // New rows store an R2 key; we return the full public URL.
  if (storageKey.startsWith('http')) return storageKey; // already a full URL
  if (storageKey.startsWith('uploads/') || !R2_PUBLIC_URL) {
    return `/${storageKey}`; // legacy local path fallback
  }
  return `${R2_PUBLIC_URL}/${storageKey}`;
}

// ── POST /api/v1/fonts  ───────────────────────────────────────────────────────
router.post('/', upload.single('file'), checkSize, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const basename = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const family   = basename.replace(/[-_]+/g, ' ').trim();

  const ext        = path.extname(req.file.originalname).toLowerCase();
  const key        = `fonts/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const contentType = req.file.mimetype || 'application/octet-stream';

  const url = await uploadToR2(key, req.file.buffer, contentType);

  const { rows: [font] } = await db.query(
    `INSERT INTO fonts (admin_id, family, filename, storage_key, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.admin.id, family, req.file.originalname, key, contentType, req.file.size]
  );

  res.status(201).json({ ...font, url });
});

// ── GET /api/v1/fonts  ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM fonts WHERE admin_id = $1 ORDER BY family',
    [req.admin.id]
  );
  res.json(rows.map(f => ({ ...f, url: fontUrl(f.storage_key) })));
});

// ── PATCH /api/v1/fonts/:id  ──────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { family } = req.body;
  if (!family?.trim()) return res.status(400).json({ error: 'family is required' });

  const { rows: [font] } = await db.query(
    `UPDATE fonts SET family = $1 WHERE id = $2 AND admin_id = $3 RETURNING *`,
    [family.trim(), req.params.id, req.admin.id]
  );
  if (!font) return res.status(404).json({ error: 'Font not found' });
  res.json({ ...font, url: fontUrl(font.storage_key) });
});

// ── DELETE /api/v1/fonts/:id  ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { rows: [font] } = await db.query(
    'DELETE FROM fonts WHERE id = $1 AND admin_id = $2 RETURNING *',
    [req.params.id, req.admin.id]
  );
  if (!font) return res.status(404).json({ error: 'Font not found' });

  await deleteFromR2(font.storage_key);

  res.json({ ok: true });
});

module.exports = router;
