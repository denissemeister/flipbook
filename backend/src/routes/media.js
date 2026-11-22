// backend/src/routes/media.js
// Uploads go to Cloudflare R2 (S3-compatible) instead of local disk.
const express  = require('express');
const path     = require('path');
const os       = require('os');
const fs       = require('fs').promises;
const sharp    = require('sharp');
const ffmpeg   = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const db       = require('../db');
const { requireAuth }        = require('../middleware/auth');
const { upload, checkSize }  = require('../middleware/upload');

ffmpeg.setFfmpegPath(ffmpegPath);

// Convert an animated GIF buffer → WebM (VP9) buffer
async function gifToWebm(buffer) {
  const tmpIn  = path.join(os.tmpdir(), `gif-${Date.now()}-${Math.random().toString(36).slice(2)}.gif`);
  const tmpOut = path.join(os.tmpdir(), `webm-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`);
  await fs.writeFile(tmpIn, buffer);
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .outputOptions([
          '-c:v libvpx-vp9',
          '-b:v 0',          // variable bitrate
          '-crf 33',         // quality: 0=lossless, 63=worst; 33 is a good balance
          '-auto-alt-ref 0', // required for single-pass streaming
          '-an',             // no audio
        ])
        .output(tmpOut)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    return await fs.readFile(tmpOut);
  } finally {
    await fs.unlink(tmpIn).catch(() => {});
    await fs.unlink(tmpOut).catch(() => {});
  }
}

const router = express.Router();
router.use(requireAuth);

// ── R2 client ──────────────────────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET       = process.env.R2_BUCKET_NAME;
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
  if (!key) return;
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.warn('R2 delete failed:', err.message);
  }
}

function makeKey(sub, originalName) {
  const ext  = path.extname(originalName).toLowerCase();
  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  return `${sub}/${name}`;
}

// ── POST /api/v1/media/upload  ────────────────────────────────────────────────
router.post('/upload', upload.single('file'), checkSize, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let file = req.file;
  const sub  = req._uploadSubDir || 'misc';

  // ── Convert animated GIFs to WebM (VP9) for dramatically smaller files ──────
  if (file.mimetype === 'image/gif') {
    try {
      const webmBuffer = await gifToWebm(file.buffer);
      const ratio = (webmBuffer.length / file.buffer.length * 100).toFixed(0);
      console.log(`GIF→WebM: ${(file.buffer.length/1024).toFixed(0)}KB → ${(webmBuffer.length/1024).toFixed(0)}KB (${ratio}% of original)`);
      file = {
        ...file,
        buffer:       webmBuffer,
        size:         webmBuffer.length,
        mimetype:     'video/webm',
        originalname: file.originalname.replace(/\.gif$/i, '.webm'),
      };
    } catch (err) {
      console.warn('GIF→WebM conversion failed, storing original GIF:', err.message);
    }
  }

  const storageKey = makeKey(sub, file.originalname);

  let width = null, height = null, thumbnailKey = null;
  let fileBuffer = file.buffer;

  // Generate thumbnail for images (excluding SVG)
  if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
    try {
      const orig = await sharp(fileBuffer).metadata();
      width  = orig.width  || null;
      height = orig.height || null;

      const thumbBuffer = await sharp(fileBuffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const thumbName = storageKey.replace(/\.[^.]+$/, '.webp');
      thumbnailKey = `thumbnails/${path.basename(thumbName)}`;
      await uploadToR2(thumbnailKey, thumbBuffer, 'image/webp');
    } catch (err) {
      console.warn('Thumbnail generation failed:', err.message);
    }
  }

  // Upload original file to R2
  await uploadToR2(storageKey, fileBuffer, file.mimetype);

  const { rows } = await db.query(
    `INSERT INTO media_assets
       (admin_id, original_filename, storage_key, mime_type, size_bytes, width, height, duration_ms, thumbnail_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [req.admin.id, file.originalname, storageKey, file.mimetype,
     file.size, width, height, null, thumbnailKey]
  );

  const asset = rows[0];
  res.status(201).json({
    ...asset,
    url:          `${R2_PUBLIC_URL}/${asset.storage_key}`,
    thumbnailUrl: asset.thumbnail_key ? `${R2_PUBLIC_URL}/${asset.thumbnail_key}` : null,
  });
});

// ── GET /api/v1/media  ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { type } = req.query;
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
    url:          `${R2_PUBLIC_URL}/${a.storage_key}`,
    thumbnailUrl: a.thumbnail_key ? `${R2_PUBLIC_URL}/${a.thumbnail_key}` : null,
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

  // Delete from R2
  await deleteFromR2(asset.storage_key);
  await deleteFromR2(asset.thumbnail_key);

  await db.query('DELETE FROM media_assets WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
