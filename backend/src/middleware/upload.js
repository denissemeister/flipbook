const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const STORAGE_PATH = process.env.STORAGE_PATH || './uploads';

// Ensure uploads directory exists
fs.mkdirSync(STORAGE_PATH, { recursive: true });

// Allowed MIME types per category
const ALLOWED_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/webp', 'image/avif',
  'image/svg+xml', 'image/tiff', 'image/gif',
  // Video
  'video/mp4', 'video/webm', 'video/quicktime',
  // Audio
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/mp4', 'audio/webm',
  // Fonts
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'application/x-font-ttf', 'application/x-font-otf',
  'application/x-font-woff', 'application/x-font-woff2',
  'application/font-woff', 'application/font-woff2',
  'application/vnd.ms-fontobject', 'application/octet-stream',
]);

// File size limits (bytes)
const SIZE_LIMITS = {
  image: 50  * 1024 * 1024,   // 50 MB
  video: 500 * 1024 * 1024,   // 500 MB
  audio: 100 * 1024 * 1024,   // 100 MB
  font:  20  * 1024 * 1024,   // 20 MB
  default: 50 * 1024 * 1024,
};

const FONT_EXTS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

function isFontFile(file) {
  const ext = require('path').extname(file.originalname).toLowerCase();
  return FONT_EXTS.has(ext);
}

function getLimit(mime) {
  if (mime.startsWith('video/')) return SIZE_LIMITS.video;
  if (mime.startsWith('audio/')) return SIZE_LIMITS.audio;
  return SIZE_LIMITS.image;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Organise into sub-folders by type
    let sub = 'misc';
    if (file.mimetype.startsWith('image/')) sub = 'images';
    else if (file.mimetype.startsWith('video/')) sub = 'videos';
    else if (file.mimetype.startsWith('audio/')) sub = 'audio';
    else if (isFontFile(file)) sub = 'fonts';

    const dir = path.join(STORAGE_PATH, sub);
    fs.mkdirSync(dir, { recursive: true });
    req._uploadSubDir = sub;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  // Font files often come with generic MIME types — check by extension too
  if (ALLOWED_TYPES.has(file.mimetype) || isFontFile(file)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${file.mimetype}" is not allowed`), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: SIZE_LIMITS.video }, // multer enforces the largest; we validate per-type below
});

/**
 * After multer saves the file, verify the per-type size limit.
 * Returns 413 and deletes the file if over limit.
 */
function checkSize(req, res, next) {
  if (!req.file) return next();
  const limit = getLimit(req.file.mimetype);
  if (req.file.size > limit) {
    fs.unlink(req.file.path, () => {});
    return res.status(413).json({
      error: `File too large. Limit for ${req.file.mimetype} is ${limit / 1024 / 1024} MB.`,
    });
  }
  next();
}

module.exports = { upload, checkSize, STORAGE_PATH };
