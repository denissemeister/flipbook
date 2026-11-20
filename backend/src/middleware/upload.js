// backend/src/middleware/upload.js
// Uses multer memory storage — files go to req.file.buffer, then uploaded to R2.
const multer = require('multer');
const path   = require('path');

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
  image:   50  * 1024 * 1024,   // 50 MB
  video:   500 * 1024 * 1024,   // 500 MB
  audio:   100 * 1024 * 1024,   // 100 MB
  font:    20  * 1024 * 1024,   // 20 MB
  default: 50  * 1024 * 1024,
};

const FONT_EXTS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

function isFontFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  return FONT_EXTS.has(ext);
}

function getSubDir(file) {
  if (file.mimetype.startsWith('image/')) return 'images';
  if (file.mimetype.startsWith('video/')) return 'videos';
  if (file.mimetype.startsWith('audio/')) return 'audio';
  if (isFontFile(file)) return 'fonts';
  return 'misc';
}

function getLimit(mime) {
  if (mime.startsWith('video/')) return SIZE_LIMITS.video;
  if (mime.startsWith('audio/')) return SIZE_LIMITS.audio;
  return SIZE_LIMITS.image;
}

function fileFilter(req, file, cb) {
  if (ALLOWED_TYPES.has(file.mimetype) || isFontFile(file)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${file.mimetype}" is not allowed`), false);
  }
}

// Memory storage — file lands in req.file.buffer
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: SIZE_LIMITS.video }, // multer enforces the largest limit
});

// After multer, verify per-type size limit and set req._uploadSubDir
function checkSize(req, res, next) {
  if (!req.file) return next();
  const limit = getLimit(req.file.mimetype);
  if (req.file.size > limit) {
    return res.status(413).json({
      error: `File too large. Limit for ${req.file.mimetype} is ${limit / 1024 / 1024} MB.`,
    });
  }
  req._uploadSubDir = getSubDir(req.file);
  next();
}

module.exports = { upload, checkSize };
